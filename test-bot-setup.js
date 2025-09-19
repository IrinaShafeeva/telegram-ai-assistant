#!/usr/bin/env node

/**
 * Скрипт для безопасной настройки тестового бота
 */

const fs = require('fs');
const path = require('path');

console.log('🤖 Safe Bot Testing Setup');
console.log('========================\n');

// Проверка наличия .env файла
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('❌ Файл .env не найден!');
  console.log('📝 Создайте файл .env из шаблона:');
  console.log('   npm run setup:local\n');
  process.exit(1);
}

require('dotenv').config();

const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const useWebhook = process.env.USE_WEBHOOK === 'true';

console.log('🔍 Текущая конфигурация:');
console.log(`   BOT_TOKEN: ${botToken ? '✅ Настроен' : '❌ Не настроен'}`);
console.log(`   USE_WEBHOOK: ${useWebhook ? '✅ Да (webhook режим)' : '❌ Нет (polling режим)'}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}\n`);

if (useWebhook) {
  console.log('⚠️  ВНИМАНИЕ: Бот настроен в webhook режиме!');
  console.log('📋 Это означает, что бот запущен на сервере.');
  console.log('🚫 Нельзя запускать локальный polling режим одновременно!\n');
  
  console.log('💡 Варианты решения:');
  console.log('   1. Остановить серверный бот временно');
  console.log('   2. Изменить USE_WEBHOOK=false в .env');
  console.log('   3. Использовать тестовый токен бота\n');
  
  console.log('🛠️  Для безопасного тестирования:');
  console.log('   1. Создайте тестового бота через @BotFather');
  console.log('   2. Используйте тестовый токен в .env');
  console.log('   3. Или временно измените USE_WEBHOOK=false\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('❓ Хотите изменить USE_WEBHOOK=false для локального тестирования? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      // Изменить USE_WEBHOOK на false
      const envContent = fs.readFileSync(envPath, 'utf8');
      const newEnvContent = envContent.replace(
        /USE_WEBHOOK=true/g, 
        'USE_WEBHOOK=false'
      );
      
      if (newEnvContent !== envContent) {
        fs.writeFileSync(envPath, newEnvContent);
        console.log('✅ USE_WEBHOOK изменен на false');
        console.log('🚀 Теперь можно запускать: npm run local');
      } else {
        console.log('ℹ️  USE_WEBHOOK уже установлен в false');
      }
    } else {
      console.log('ℹ️  Оставляем текущую конфигурацию');
      console.log('💡 Помните: остановите серверный бот перед локальным тестированием!');
    }
    
    rl.close();
  });
  
} else {
  console.log('✅ Бот настроен в polling режиме - безопасно для локального тестирования');
  console.log('🚀 Можно запускать: npm run local');
}
