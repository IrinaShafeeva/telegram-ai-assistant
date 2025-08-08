// DigitalOcean App Platform version
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('🚀 Starting AI Assistant on DigitalOcean...');

// Initialize Telegram bot
let bot;
try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('✅ Telegram bot initialized');
} catch (error) {
    console.error('❌ Telegram bot initialization failed:', error);
}

// Initialize Supabase (optional)
let supabase = null;
try {
    const { createClient } = require('@supabase/supabase-js');
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );
        console.log('✅ Supabase client initialized');
    }
} catch (error) {
    console.error('⚠️ Supabase initialization failed:', error.message);
}

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: '🤖 AI Assistant v2.0 on DigitalOcean',
        version: '2.0.0-do',
        timestamp: new Date().toISOString(),
        platform: 'DigitalOcean App Platform',
        clients: {
            telegram: !!bot,
            supabase: !!supabase
        }
    });
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    try {
        console.log('📨 Webhook received on DigitalOcean');
        
        const update = req.body;
        if (!update || !bot) {
            return res.json({ ok: true });
        }
        
        // Handle message
        if (update.message) {
            const msg = update.message;
            const chatId = msg.chat.id;
            const text = msg.text || '';
            
            console.log(`💬 Message from ${chatId}: ${text}`);
            
            try {
                if (text.startsWith('/')) {
                    await handleCommand(text, chatId);
                } else {
                    // Simple echo with DigitalOcean branding
                    await bot.sendMessage(chatId, 
                        `🌊 DigitalOcean AI Assistant\n\n` +
                        `✅ Получил: "${text}"\n` +
                        `⏱️ ${new Date().toLocaleString('ru-RU')}\n` +
                        `🌐 Работает на DigitalOcean App Platform\n\n` +
                        `Попробуйте:\n` +
                        `/start - главное меню\n` +
                        `/help - справка\n` +
                        `/status - статус системы`
                    );
                }
            } catch (botError) {
                console.error('Bot send error:', botError);
            }
        }
        
        // Handle callback queries
        if (update.callback_query) {
            const query = update.callback_query;
            const chatId = query.message.chat.id;
            
            try {
                await bot.answerCallbackQuery(query.id, { text: 'Обработано!' });
                await bot.sendMessage(chatId, `✅ Кнопка "${query.data}" обработана на DigitalOcean`);
            } catch (botError) {
                console.error('Callback error:', botError);
            }
        }
        
        res.json({ ok: true, platform: 'digitalocean' });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            platform: 'digitalocean'
        });
    }
});

// Command handler
async function handleCommand(command, chatId) {
    if (!bot) return;
    
    try {
        console.log(`🔧 Processing command: ${command}`);
        
        switch (command) {
            case '/start':
                await bot.sendMessage(chatId, 
                    `🌊 Добро пожаловать в AI Assistant на DigitalOcean!\n\n` +
                    `✨ Новая архитектура v2.0\n` +
                    `🚀 Работает на DigitalOcean App Platform\n` +
                    `💡 Стабильное подключение к Telegram\n\n` +
                    `Выберите действие:`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '💰 Расходы', callback_data: 'expenses' },
                                { text: '📋 Задачи', callback_data: 'tasks' }
                            ],
                            [
                                { text: '🔖 Закладки', callback_data: 'bookmarks' },
                                { text: '📊 Статистика', callback_data: 'stats' }
                            ],
                            [
                                { text: '⚙️ Настройки', callback_data: 'settings' },
                                { text: '❓ Помощь', callback_data: 'help' }
                            ]
                        ]
                    }
                });
                break;
                
            case '/help':
                await bot.sendMessage(chatId,
                    `📖 AI Assistant v2.0 - Справка\n\n` +
                    `🌊 Работает на DigitalOcean App Platform\n\n` +
                    `💰 Управление расходами:\n` +
                    `"Потратил 500 на продукты"\n` +
                    `"Доход 30000 зарплата"\n\n` +
                    `📋 Управление задачами:\n` +
                    `"Задача: купить хлеб"\n` +
                    `"Напомнить завтра позвонить"\n\n` +
                    `🔖 Сохранение ссылок:\n` +
                    `"Сохрани https://example.com"\n\n` +
                    `🔧 Команды:\n` +
                    `/start - главное меню\n` +
                    `/help - эта справка\n` +
                    `/status - статус системы`
                );
                break;
                
            case '/status':
                const statusMessage = 
                    `📊 Статус AI Assistant v2.0\n\n` +
                    `🌊 Платформа: DigitalOcean App Platform\n` +
                    `✅ Telegram Bot: ${bot ? 'Активен' : 'Неактивен'}\n` +
                    `${supabase ? '✅' : '⚠️'} Supabase: ${supabase ? 'Подключен' : 'Отключен'}\n` +
                    `⏱️ Время: ${new Date().toLocaleString('ru-RU')}\n` +
                    `🔄 Uptime: ${Math.floor(process.uptime() / 60)} мин\n` +
                    `💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n\n` +
                    `🎯 Архитектура v2.0 готова к работе!`;
                    
                await bot.sendMessage(chatId, statusMessage);
                break;
                
            default:
                await bot.sendMessage(chatId, 
                    `❓ Неизвестная команда: ${command}\n\n` +
                    `Используйте /help для списка команд`
                );
        }
        
    } catch (error) {
        console.error(`❌ Command error: ${command}`, error);
        try {
            await bot.sendMessage(chatId, 
                `❌ Ошибка обработки команды\n\n` +
                `Попробуйте /start для перезапуска`
            );
        } catch (botError) {
            console.error('Failed to send error message:', botError);
        }
    }
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AI Assistant running on DigitalOcean:${PORT}`);
    console.log(`🌊 Platform: DigitalOcean App Platform`);
    console.log(`🎯 Ready for Telegram webhook!`);
});

module.exports = app;