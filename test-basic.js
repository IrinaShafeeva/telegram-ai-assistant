/**
 * Базовый тест функциональности
 */

console.log('🧪 Начинаем базовое тестирование...');

// Тест 1: Проверка импорта модулей
try {
    console.log('📦 Тест 1: Проверка импорта модулей...');
    
    const express = require('express');
    console.log('✅ Express загружен');
    
    const cors = require('cors');
    console.log('✅ CORS загружен');
    
    const { supabase } = require('./src/config/database');
    console.log('✅ Supabase конфигурация загружена');
    
    console.log('✅ Все основные модули загружены успешно');
} catch (error) {
    console.error('❌ Ошибка загрузки модулей:', error.message);
}

// Тест 2: Проверка переменных окружения
console.log('\n🔧 Тест 2: Проверка переменных окружения...');
require('dotenv').config();

const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'OPENAI_API_KEY', 
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
];

let envOk = true;
requiredEnvVars.forEach(varName => {
    if (process.env[varName]) {
        console.log(`✅ ${varName}: настроен`);
    } else {
        console.log(`❌ ${varName}: НЕ настроен`);
        envOk = false;
    }
});

if (envOk) {
    console.log('✅ Все переменные окружения настроены');
} else {
    console.log('⚠️ Некоторые переменные окружения не настроены');
}

// Тест 3: Проверка структуры проекта
console.log('\n📁 Тест 3: Проверка структуры проекта...');

const fs = require('fs');
const path = require('path');

const requiredFiles = [
    'src/app.js',
    'src/config/database.js',
    'src/tools/index.js',
    'package.json'
];

let filesOk = true;
requiredFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        console.log(`✅ ${filePath}: существует`);
    } else {
        console.log(`❌ ${filePath}: НЕ существует`);
        filesOk = false;
    }
});

if (filesOk) {
    console.log('✅ Все необходимые файлы найдены');
} else {
    console.log('❌ Некоторые файлы отсутствуют');
}

// Тест 4: Проверка подключения к базе данных (если настроена)
console.log('\n🗄️ Тест 4: Проверка подключения к базе данных...');

if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
        const { supabase } = require('./src/config/database');
        
        // Простой тест подключения - синхронно
        console.log('✅ Supabase клиент создан успешно');
        console.log('⚠️ Для полного теста подключения нужны реальные данные');
    } catch (error) {
        console.log('❌ Ошибка тестирования базы данных:', error.message);
    }
} else {
    console.log('⚠️ Переменные базы данных не настроены, пропускаем тест');
}

console.log('\n🎉 Базовое тестирование завершено!');
