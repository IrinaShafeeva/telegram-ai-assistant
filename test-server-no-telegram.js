/**
 * Тестовый сервер без Telegram
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: '🤖 AI Assistant Test Server is running!',
        version: '2.0.0',
        endpoints: {
            webhook: '/webhook',
            api: '/api/*'
        }
    });
});

// Webhook endpoint
app.get('/webhook', (req, res) => {
    res.json({ 
        status: 'webhook_ready',
        message: 'Webhook endpoint is ready for POST requests',
        method: 'POST only'
    });
});

// Records API
app.get('/api/records', (req, res) => {
    try {
        const { tenant_id, kind, limit = 20 } = req.query;
        
        if (!tenant_id) {
            return res.status(400).json({ error: 'tenant_id is required' });
        }
        
        // Mock data
        const mockRecords = [
            {
                id: 1,
                title: 'Test Expense',
                kind: 'expense',
                amount: -1000,
                tenant_id: tenant_id,
                created_at: new Date().toISOString()
            },
            {
                id: 2,
                title: 'Test Task',
                kind: 'task',
                tenant_id: tenant_id,
                created_at: new Date().toISOString()
            }
        ];
        
        res.json(mockRecords.slice(0, limit));
    } catch (error) {
        console.error('API records error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Search API
app.get('/api/search', (req, res) => {
    try {
        const { tenant_id, query } = req.query;
        
        if (!tenant_id || !query) {
            return res.status(400).json({ error: 'tenant_id and query are required' });
        }
        
        // Mock search results
        const mockResults = [
            {
                id: 1,
                title: `Search result for: ${query}`,
                kind: 'expense',
                snippet: `Found ${query} in records`,
                tenant_id: tenant_id
            }
        ];
        
        res.json(mockResults);
    } catch (error) {
        console.error('API search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Test server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/`);
    console.log(`🔗 Webhook: http://localhost:${PORT}/webhook`);
    console.log(`📊 API: http://localhost:${PORT}/api/records`);
});
