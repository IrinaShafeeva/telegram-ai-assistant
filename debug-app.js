// Minimal debug version to find the issue
const express = require('express');

const app = express();
app.use(express.json());

// Basic health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Debug version running',
        timestamp: new Date().toISOString(),
        env: {
            NODE_ENV: process.env.NODE_ENV,
            hasOpenAI: !!process.env.OPENAI_API_KEY,
            hasSupabase: !!process.env.SUPABASE_URL
        }
    });
});

// Simple webhook endpoint
app.post('/webhook', (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));
        
        // Basic response
        res.json({ ok: true, message: 'Webhook processed' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export for Vercel
module.exports = app;