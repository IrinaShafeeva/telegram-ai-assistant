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
    bot.onText(/\/connect (.+)/, withUser(commandHandlers.handleConnect));
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
    
    // Successful payment handler
    bot.on('successful_payment', withUser(async (msg) => {
      const chatId = msg.chat.id;
      const user = msg.user;
      const payment = msg.successful_payment;
      
      try {
        const validPayloads = ['expense_tracker_pro_1month', 'expense_tracker_pro_6months', 'expense_tracker_pro_1year'];
        
        if (validPayloads.includes(payment.invoice_payload)) {
          // Activate PRO plan
          await userService.update(user.id, { is_premium: true });
          
          const periodMap = {
            'expense_tracker_pro_1month': '1 месяц',
            'expense_tracker_pro_6months': '6 месяцев', 
            'expense_tracker_pro_1year': '1 год'
          };
          
          const period = periodMap[payment.invoice_payload];
          
          await bot.sendMessage(chatId, 
            `🎉 Оплата прошла успешно!\n\n💎 PRO план активирован на ${period}!\n\n✨ Теперь вам доступны все PRO функции:\n• ∞ Неограниченные проекты\n• ∞ Неограниченные записи\n• 20 AI вопросов/день\n• 10 синхронизаций/день\n• 👥 Командная работа\n• 📂 Кастомные категории\n\nСпасибо за поддержку! 🚀`
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