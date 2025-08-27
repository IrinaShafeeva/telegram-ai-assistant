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
    bot.onText(/\/stats/, withUser(commandHandlers.handleStats));
    bot.onText(/\/sync/, withUser(commandHandlers.handleSync));
    bot.onText(/\/settings/, withUser(commandHandlers.handleSettings));
    bot.onText(/\/categories/, withUser(commandHandlers.handleCategories));
    bot.onText(/\/upgrade/, withUser(commandHandlers.handleUpgrade));
    bot.onText(/\/invite (.+)/, withUser(commandHandlers.handleInvite));
    bot.onText(/\/email (.+)/, withUser(commandHandlers.handleEmail));
    bot.onText(/\/connect (.+)/, withUser(commandHandlers.handleConnect));

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