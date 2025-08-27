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
  res.json({ status: 'Expense Tracker Bot is running!' });
});

async function startBot() {
  try {
    // Initialize database
    await setupDatabase();
    
    // Initialize bot
    bot = new TelegramBot(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN, { polling: true });
    global.bot = bot; // Make bot globally available
    await setupBot(bot);
    
    logger.info('🏦 Expense Tracker Bot started successfully');
    
    // Start web server for webhook (if needed)
    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
      app.post(`/webhook/${botToken}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      });
      
      bot.setWebHook(`${process.env.WEBHOOK_URL}/webhook/${botToken}`);
      logger.info(`Webhook set to: ${process.env.WEBHOOK_URL}/webhook/${process.env.BOT_TOKEN}`);
    }
    
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
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startBot();