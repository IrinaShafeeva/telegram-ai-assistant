// Working version - step by step
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
app.use(express.json());

console.log('Starting app initialization...');

// Initialize clients
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
console.log('✅ Telegram bot initialized');

// Supabase with better error handling
let supabase = null;
try {
    const { createClient } = require('@supabase/supabase-js');
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    // Use service role key for server-side operations
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
    
    // Test connection
    supabase.from('tenants').select('count').limit(1)
        .then(({ data, error }) => {
            if (error) {
                console.error('⚠️ Supabase connection test failed:', error.message);
                console.error('⚠️ Error details:', error);
            } else {
                console.log('✅ Supabase connection test passed:', data);
            }
        })
        .catch(err => {
            console.error('⚠️ Supabase connection test error:', err);
        });
        
} catch (error) {
    console.error('❌ Supabase initialization failed:', error.message);
}

// OpenAI
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log('✅ OpenAI initialized');

// Context management (simple version)
async function getContext(chatId) {
    if (!supabase) {
        console.log('Using fallback context (no DB)');
        return {
            tenant_id: `chat_${chatId}`,
            user_id: `user_${chatId}`,
            tg_chat_id: chatId
        };
    }

    try {
        // Try to get existing tenant
        const { data: tenant } = await supabase
            .from('tenants')
            .select('*')
            .eq('name', `chat_${chatId}`)
            .single();

        if (tenant) {
            return {
                tenant_id: tenant.id,
                user_id: `user_${chatId}`, // Simplified
                tg_chat_id: chatId
            };
        } else {
            console.log(`Creating new tenant for chat ${chatId}`);
            return {
                tenant_id: `fallback_${chatId}`,
                user_id: `user_${chatId}`,
                tg_chat_id: chatId
            };
        }
    } catch (error) {
        console.error('Context error:', error.message);
        return {
            tenant_id: `fallback_${chatId}`,
            user_id: `user_${chatId}`,
            tg_chat_id: chatId
        };
    }
}

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: '🤖 AI Assistant v2.0 is running!',
        version: '2.0.0',
        clients: {
            telegram: !!bot,
            supabase: !!supabase,
            openai: !!openai
        },
        endpoints: {
            webhook: '/webhook',
            api: '/api/*'
        }
    });
});

// Webhook
app.post('/webhook', async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));
        
        if (req.body.message) {
            const msg = req.body.message;
            const chatId = msg.chat.id;
            const text = msg.text || '';
            
            console.log(`Processing message from ${chatId}: ${text}`);
            
            // Get context
            const context = await getContext(chatId);
            console.log('Context:', context);
            
            // Handle commands
            if (text.startsWith('/')) {
                if (text === '/start') {
                    await bot.sendMessage(chatId, `🎯 Добро пожаловать в AI Assistant v2.0!

Я готов помочь вам:
💰 Отслеживать расходы
📋 Управлять задачами  
🔖 Сохранять закладки

Попробуйте:
"Потратил 500 на обед"
"Задача: купить молоко"
"/help - подробная справка"`);
                } else if (text === '/help') {
                    await bot.sendMessage(chatId, `📖 Справка по командам:

💰 Расходы:
"Потратил 1000 на продукты"
"Доход 50000 зарплата"

📋 Задачи:
"Задача для Ивана: позвонить клиенту"
"Напомнить завтра купить хлеб"

🔖 Закладки:  
"Сохрани https://example.com"`);
                } else {
                    await bot.sendMessage(chatId, 'Неизвестная команда. Используйте /help для справки.');
                }
            } else {
                // Simple echo for now
                await bot.sendMessage(chatId, `Получил ваше сообщение: "${text}"\n\n🚧 LLM обработка временно отключена для диагностики`);
            }
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;// Force redeploy
