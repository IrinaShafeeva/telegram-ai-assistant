// Minimal working version
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
app.use(express.json());

// Test basic imports first
console.log('✅ Express and basic modules loaded');

// Test Telegram bot
let bot;
try {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('✅ Telegram bot initialized');
} catch (error) {
    console.error('❌ Telegram bot error:', error);
}

// Test Supabase
let supabase;
try {
    console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
    console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
    
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );
    console.log('✅ Supabase client initialized');
} catch (error) {
    console.error('❌ Supabase error:', error.message);
    console.error('❌ Supabase stack:', error.stack);
}

// Test OpenAI
let openai;
try {
    const OpenAI = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✅ OpenAI client initialized');
} catch (error) {
    console.error('❌ OpenAI error:', error);
}

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Minimal version - all modules loaded',
        clients: {
            telegram: !!bot,
            supabase: !!supabase,
            openai: !!openai
        }
    });
});

// Simple webhook
app.post('/webhook', async (req, res) => {
    try {
        console.log('Webhook received');
        
        if (req.body.message) {
            const msg = req.body.message;
            const chatId = msg.chat.id;
            const text = msg.text || '';
            
            console.log(`Message from ${chatId}: ${text}`);
            
            // Simple response
            if (bot) {
                await bot.sendMessage(chatId, `Получил: ${text}`);
            }
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;