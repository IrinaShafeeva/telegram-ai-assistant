// Stable working version - minimal dependencies
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

console.log('🚀 Starting stable AI Assistant...');

// Initialize Telegram bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
console.log('✅ Telegram bot initialized');

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: '🤖 AI Assistant v2.0 - Stable Version',
        version: '2.0.0-stable',
        timestamp: new Date().toISOString()
    });
});

// Simple webhook handler
app.post('/webhook', async (req, res) => {
    try {
        console.log('📨 Webhook received');
        
        const update = req.body;
        if (!update) {
            return res.json({ ok: true });
        }
        
        // Handle message
        if (update.message) {
            const msg = update.message;
            const chatId = msg.chat.id;
            const text = msg.text || '';
            
            console.log(`💬 Message from ${chatId}: ${text}`);
            
            // Handle commands
            if (text.startsWith('/')) {
                await handleCommand(text, chatId);
            } else {
                // Echo response for now
                await bot.sendMessage(chatId, 
                    `✅ Получил ваше сообщение: "${text}"\n\n` +
                    `🎯 AI Assistant v2.0 работает!\n` +
                    `⏱️ ${new Date().toLocaleTimeString('ru-RU')}\n\n` +
                    `Используйте /help для справки`
                );
            }
        }
        
        // Handle callback queries (buttons)
        if (update.callback_query) {
            const query = update.callback_query;
            const chatId = query.message.chat.id;
            
            await bot.answerCallbackQuery(query.id, { text: 'Понял!' });
            await bot.sendMessage(chatId, `Нажата кнопка: ${query.data}`);
        }
        
        res.json({ ok: true });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Command handler
async function handleCommand(command, chatId) {
    try {
        console.log(`🔧 Processing command: ${command}`);
        
        switch (command) {
            case '/start':
                await bot.sendMessage(chatId, 
                    `🎯 Добро пожаловать в AI Assistant v2.0!\n\n` +
                    `Я помогу вам:\n` +
                    `💰 Управлять расходами\n` +
                    `📋 Организовать задачи\n` +
                    `🔖 Сохранять закладки\n\n` +
                    `Выберите действие:`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '💰 Добавить расход', callback_data: 'add_expense' },
                                { text: '📋 Создать задачу', callback_data: 'add_task' }
                            ],
                            [
                                { text: '🔖 Сохранить ссылку', callback_data: 'add_bookmark' },
                                { text: '📖 Справка', callback_data: 'help' }
                            ]
                        ]
                    }
                });
                break;
                
            case '/help':
                await bot.sendMessage(chatId,
                    `📖 Справка по AI Assistant v2.0\n\n` +
                    `💰 Расходы:\n` +
                    `"Потратил 500 на продукты"\n` +
                    `"Доход 30000 зарплата"\n\n` +
                    `📋 Задачи:\n` +
                    `"Задача: купить молоко"\n` +
                    `"Напомнить завтра позвонить"\n\n` +
                    `🔖 Закладки:\n` +
                    `"Сохрани https://example.com"\n\n` +
                    `🔧 Команды:\n` +
                    `/start - главное меню\n` +
                    `/help - эта справка\n` +
                    `/status - статус системы`
                );
                break;
                
            case '/status':
                await bot.sendMessage(chatId,
                    `📊 Статус AI Assistant v2.0\n\n` +
                    `✅ Telegram Bot: Работает\n` +
                    `✅ Webhook: Активен\n` +
                    `✅ Serverless: Vercel\n` +
                    `⏱️ Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                    `🌐 URL: https://ai-assist-neon.vercel.app`
                );
                break;
                
            default:
                await bot.sendMessage(chatId, 
                    `❓ Неизвестная команда: ${command}\n\n` +
                    `Используйте /help для списка команд`
                );
        }
        
    } catch (error) {
        console.error(`❌ Command error: ${command}`, error);
        await bot.sendMessage(chatId, 
            `❌ Ошибка обработки команды: ${command}\n\n` +
            `Попробуйте /start для перезапуска`
        );
    }
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;