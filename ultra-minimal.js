// Ultra minimal version for debugging
const express = require('express');

const app = express();
app.use(express.json());

console.log('Starting ultra minimal version...');

// Health check
app.get('/', (req, res) => {
    console.log('Health check called');
    res.json({
        status: 'ok',
        message: 'Ultra minimal version working',
        timestamp: new Date().toISOString()
    });
});

// Webhook - absolute minimum
app.post('/webhook', (req, res) => {
    console.log('Webhook called with body:', req.body);
    
    try {
        res.json({ ok: true, message: 'Webhook received' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Catch all errors
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
});

module.exports = app;