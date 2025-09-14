const { userService } = require('../services/supabase');
const { BOT_COMMANDS } = require('../config/constants');
const logger = require('../utils/logger');

// Import handlers
const commandHandlers = require('./handlers/commands');
const messageHandlers = require('./handlers/messages');
const callbackHandlers = require('./handlers/callbacks');
const voiceHandlers = require('./handlers/voice');

// Import keyboards
const { getMainMenuKeyboard } = require('./keyboards/reply');

async function setupBot(bot) {
  try {
    // Set bot commands
    await bot.setMyCommands(BOT_COMMANDS);
    
    // User middleware function (will be called in each handler)
    global.ensureUser = async (msg) => {
      if (msg.from) {
        try {
          let user = await userService.findById(msg.from.id);
          if (!user) {
            // Create new user
            user = await userService.create({
              id: msg.from.id,
              username: msg.from.username,
              first_name: msg.from.first_name,
              language_code: msg.from.language_code || 'en'
            });
            logger.info(`New user registered: ${msg.from.id}`);
          }
          
          // Check PRO subscription expiry
          if (user.is_premium && user.pro_expires_at) {
            const now = new Date();
            const expiryDate = new Date(user.pro_expires_at);
            
            if (now > expiryDate) {
              // PRO subscription expired, deactivate
              user = await userService.update(user.id, {
                is_premium: false,
                pro_expires_at: null,
                pro_plan_type: null
              });
              
              logger.info(`PRO subscription expired for user ${user.id}`);
              
              // Notify user about expiry (only once)
              if (msg.chat) {
                try {
                  await bot.sendMessage(msg.chat.id, 
                    `⏰ Ваша PRO подписка истекла\n\n💎 Чтобы продолжить пользоваться расширенными функциями, продлите подписку в разделе "⚙️ Настройки"`
                  );
                } catch (notifyError) {
                  logger.error('Error notifying about PRO expiry:', notifyError);
                }
              }
            }
          }
          
          // Attach user to message for handlers
          msg.user = user;
          return user;
        } catch (error) {
          logger.error('User middleware error:', error);
          return null;
        }
      }
      return null;
    };

    // Wrapper function to ensure user exists before calling handler
    const withUser = (handler) => async (msg, match) => {
      await global.ensureUser(msg);
      return handler(msg, match);
    };

    const withUserCallback = (handler) => async (callbackQuery) => {
      if (callbackQuery.from) {
        const fakeMsg = { from: callbackQuery.from };
        await global.ensureUser(fakeMsg);
        callbackQuery.user = fakeMsg.user;
      }
      return handler(callbackQuery);
    };

    // Command handlers
    bot.onText(/\/start/, withUser(commandHandlers.handleStart));
    bot.onText(/\/help/, withUser(commandHandlers.handleHelp));
    bot.onText(/\/projects/, withUser(commandHandlers.handleProjects));
    bot.onText(/\/settings/, withUser(commandHandlers.handleSettings));
    bot.onText(/\/connect(?:\s+(.+))?/, withUser(commandHandlers.handleConnect));
    bot.onText(/\/sync/, withUser(commandHandlers.handleSync));
    bot.onText(/\/devpro/, withUser(commandHandlers.handleDevPro));

    // Add general message logging
    bot.on('message', (msg) => {
      logger.info(`Received message: ${msg.text} from ${msg.from?.id}`);
    });

    // Add error handling
    bot.on('error', (error) => {
      logger.error('Bot error:', error);
    });

    // Add polling error handling
    bot.on('polling_error', (error) => {
      logger.error('Polling error:', error);
    });

    // Voice message handler
    bot.on('voice', withUser(voiceHandlers.handleVoice));
    
    // Text message handler (for expense parsing)
    bot.on('text', withUser(messageHandlers.handleText));
    
    // Callback query handler
    bot.on('callback_query', withUserCallback(callbackHandlers.handleCallback));
    
    // Pre-checkout query handler
    bot.on('pre_checkout_query', async (query) => {
      try {
        const validPayloads = ['expense_tracker_pro_1month', 'expense_tracker_pro_6months', 'expense_tracker_pro_1year'];
        
        if (validPayloads.includes(query.invoice_payload)) {
          await bot.answerPreCheckoutQuery(query.id, true);
        } else {
          await bot.answerPreCheckoutQuery(query.id, false, {
            error_message: 'Неизвестный тип подписки'
          });
        }
      } catch (error) {
        logger.error('Pre-checkout query error:', error);
        await bot.answerPreCheckoutQuery(query.id, false, {
          error_message: 'Ошибка обработки платежа'
        });
      }
    });

    // Successful payment handler
    bot.on('successful_payment', withUser(async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.user;
      const payment = msg.successful_payment;
      
      try {
        const validPayloads = ['expense_tracker_pro_1month', 'expense_tracker_pro_6months', 'expense_tracker_pro_1year'];
        
        if (validPayloads.includes(payment.invoice_payload)) {
          // Calculate expiry date based on payment plan
          const now = new Date();
          let expiresAt;
          let planType;
          
          switch (payment.invoice_payload) {
            case 'expense_tracker_pro_1month':
              expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
              planType = '1month';
              break;
            case 'expense_tracker_pro_6months':
              expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 180 days
              planType = '6months';
              break;
            case 'expense_tracker_pro_1year':
              expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 365 days
              planType = '1year';
              break;
            default:
              expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              planType = '1month';
          }
          
          // Activate PRO plan with expiry date
          await userService.update(user.id, { 
            is_premium: true,
            pro_expires_at: expiresAt.toISOString(),
            pro_plan_type: planType
          });
          
          const periodMap = {
            'expense_tracker_pro_1month': '1 месяц',
            'expense_tracker_pro_6months': '6 месяцев', 
            'expense_tracker_pro_1year': '1 год'
          };
          
          const period = periodMap[payment.invoice_payload];
          const expiryDate = expiresAt.toLocaleDateString('ru-RU');
          
          await bot.sendMessage(chatId, 
            `🎉 Оплата прошла успешно!\n\n💎 PRO план активирован на ${period}!\n📅 Действует до: ${expiryDate}\n\n✨ Теперь вам доступны все PRO функции:\n• ∞ Неограниченные проекты\n• ∞ Неограниченные записи\n• 20 AI вопросов/день\n• 10 синхронизаций/день\n• 👥 Командная работа\n• 📂 Кастомные категории\n\nСпасибо за поддержку! 🚀`
          );
          
          logger.info(`PRO plan activated for user ${user.id} via payment (${period})`);
        }
      } catch (error) {
        logger.error('Payment processing error:', error);
        await bot.sendMessage(chatId, '❌ Ошибка обработки платежа. Обратитесь в поддержку.');
      }
    }));

    // Error handler
    bot.on('polling_error', (error) => {
      logger.error('Polling error:', error);
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    logger.info('Bot handlers registered successfully');
  } catch (error) {
    logger.error('Failed to setup bot:', error);
    throw error;
  }
}

module.exports = { setupBot };