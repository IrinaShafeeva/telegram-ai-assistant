#!/usr/bin/env node

/**
 * Скрипт для переключения между webhook и polling режимами
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.log('❌ Файл .env не найден!');
  process.exit(1);
}

const mode = process.argv[2];

if (!mode || !['webhook', 'polling'].includes(mode)) {
  console.log('🔄 Переключение режима бота');
  console.log('==========================\n');
  console.log('Использование:');
  console.log('  node switch-mode.js webhook  - Переключить в webhook режим (для продакшена)');
  console.log('  node switch-mode.js polling  - Переключить в polling режим (для локального тестирования)');
  console.log('');
  process.exit(1);
}

try {
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Изменить USE_WEBHOOK
  if (mode === 'webhook') {
    envContent = envContent.replace(/USE_WEBHOOK=false/g, 'USE_WEBHOOK=true');
    envContent = envContent.replace(/USE_WEBHOOK=true/g, 'USE_WEBHOOK=true');
    
    // Убедиться, что строка есть
    if (!envContent.includes('USE_WEBHOOK=')) {
      envContent += '\nUSE_WEBHOOK=true\n';
    }
    
    console.log('✅ Переключен в webhook режим (для продакшена)');
    console.log('📋 Убедитесь, что WEBHOOK_URL настроен правильно');
    
  } else if (mode === 'polling') {
    envContent = envContent.replace(/USE_WEBHOOK=true/g, 'USE_WEBHOOK=false');
    envContent = envContent.replace(/USE_WEBHOOK=false/g, 'USE_WEBHOOK=false');
    
    // Убедиться, что строка есть
    if (!envContent.includes('USE_WEBHOOK=')) {
      envContent += '\nUSE_WEBHOOK=false\n';
    }
    
    console.log('✅ Переключен в polling режим (для локального тестирования)');
    console.log('🚀 Теперь можно запускать: npm run local');
  }
  
  fs.writeFileSync(envPath, envContent);
  
  console.log('\n📝 Обновленный .env файл:');
  const lines = envContent.split('\n');
  const webhookLine = lines.find(line => line.startsWith('USE_WEBHOOK='));
  if (webhookLine) {
    console.log(`   ${webhookLine}`);
  }
  
} catch (error) {
  console.error('❌ Ошибка при изменении .env файла:', error.message);
  process.exit(1);
}
