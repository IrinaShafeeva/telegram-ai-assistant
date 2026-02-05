require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { setupDatabase } = require('./services/supabase');
const { setupBot } = require('./bot');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Global bot instance
let bot = null;

// Middleware
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Expense Tracker Bot is running!',
    bot: bot ? 'Bot initialized' : 'Bot not initialized',
    timestamp: new Date().toISOString()
  });
});

// Test bot endpoint
app.get('/test-bot', async (req, res) => {
  try {
    if (!bot) {
      return res.json({ error: 'Bot not initialized' });
    }
    
    const me = await bot.getMe();
    res.json({ 
      bot: me,
      status: 'Bot is working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

async function startBot() {
  try {
    // Initialize database
    await setupDatabase();
    
    // Initialize bot
    const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error('BOT_TOKEN is not configured');
    }
    
    const webhookUrl = process.env.WEBHOOK_URL;
    const useWebhook = process.env.USE_WEBHOOK === 'true';
    
    if (useWebhook && webhookUrl) {
      // Use webhook mode for production (no built-in server, we use Express)
      bot = new TelegramBot(botToken, { webHook: false });
      global.bot = bot; // Make bot globally available
      await setupBot(bot);

      // Register webhook endpoint BEFORE setting webhook
      const webhookPath = `/webhook/${botToken}`;
      app.post(webhookPath, (req, res) => {
        logger.info('Received webhook request from Telegram');
        bot.processUpdate(req.body);
        res.sendStatus(200);
      });

      // Set webhook after endpoint is registered
      await bot.setWebHook(`${webhookUrl}${webhookPath}`);
      logger.info(`🏦 Expense Tracker Bot started successfully in webhook mode: ${webhookUrl}${webhookPath}`);

    } else {
      // Use polling mode for development
      bot = new TelegramBot(botToken, { polling: true });
      global.bot = bot; // Make bot globally available
      await setupBot(bot);

      logger.info('🏦 Expense Tracker Bot started successfully in polling mode');
    }


    // Tribute webhook endpoint (available in both modes)
    app.post('/webhook/tribute', async (req, res) => {
      try {
        const { handleTributeWebhook } = require('./services/tributeWebhook');
        await handleTributeWebhook(req.body);
        res.sendStatus(200);
      } catch (error) {
        logger.error('Tribute webhook error:', error);
        res.sendStatus(500);
      }
    });

    // Start web server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
    
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (bot) {
    const useWebhook = process.env.USE_WEBHOOK === 'true';
    if (useWebhook) {
      bot.deleteWebHook();
    } else {
      bot.stopPolling();
    }
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (bot) {
    const useWebhook = process.env.USE_WEBHOOK === 'true';
    if (useWebhook) {
      bot.deleteWebHook();
    } else {
      bot.stopPolling();
    }
  }
  process.exit(0);
});

startBot();