#!/usr/bin/env node

/**
 * Скрипт для быстрого тестирования бота локально
 */

const fs = require('fs');
const path = require('path');

console.log('🤖 Expense Tracker Bot - Local Testing Setup');
console.log('=============================================\n');

// Проверка наличия .env файла
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('❌ Файл .env не найден!');
  console.log('📝 Создайте файл .env из шаблона:');
  console.log('   cp local-test.env .env');
  console.log('   Затем отредактируйте .env с вашими данными\n');
  process.exit(1);
}

// Проверка обязательных переменных
require('dotenv').config();

const requiredVars = [
  'BOT_TOKEN',
  'SUPABASE_URL', 
  'SUPABASE_ANON_KEY',
  'OPENAI_API_KEY'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.log('❌ Отсутствуют обязательные переменные окружения:');
  missingVars.forEach(varName => {
    console.log(`   - ${varName}`);
  });
  console.log('\n📝 Добавьте их в файл .env\n');
  process.exit(1);
}

console.log('✅ Конфигурация проверена успешно!');
console.log('\n🚀 Доступные команды:');
console.log('   npm run local      - Запуск в режиме разработки');
console.log('   npm run local:prod - Запуск в продакшн режиме');
console.log('   npm run dev        - Обычный режим разработки');
console.log('\n📊 Проверка бота:');
console.log('   http://localhost:3000/        - Статус сервера');
console.log('   http://localhost:3000/test-bot - Проверка бота');
console.log('\n💡 После запуска найдите вашего бота в Telegram и отправьте /start');

// Проверка Google Sheets файла
const googleSheetsPath = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH || './ai-assistant-sheets-ddaae7505964.json';
if (fs.existsSync(googleSheetsPath)) {
  console.log('✅ Google Sheets credentials найдены');
} else {
  console.log('⚠️  Google Sheets credentials не найдены (опционально)');
}

console.log('\n🎯 Готово к тестированию!');
