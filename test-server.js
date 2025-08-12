require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('1. Начинаем инициализацию...');

// Middleware
app.use(cors());
app.use(express.json());

console.log('2. Middleware настроен...');

// Простой endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: '🤖 AI Assistant v2.0 is running!',
        version: '2.0.0'
    });
});

console.log('3. Роуты настроены...');

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 AI Assistant server running on port ${PORT}`);
    console.log('🎯 Test server ready!');
});

console.log('4. Сервер запускается...');
