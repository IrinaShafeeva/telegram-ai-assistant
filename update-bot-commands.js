const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

async function updateBotCommands() {
  try {
    // Устанавливаем список команд бота
    await bot.setMyCommands([
      { command: 'start', description: 'Начать работу с ботом' },
      { command: 'projects', description: 'Управление проектами' },
      { command: 'settings', description: 'Настройки бота' },
      { command: 'help', description: 'Помощь и инструкции' },
      { command: 'connect', description: 'Подключить Google Sheets' },
      { command: 'export', description: 'Экспорт данных' }
    ]);

    console.log('✅ Команды бота успешно обновлены!');
    
    // Также можно очистить веб-хук (если используется)
    await bot.deleteWebHook();
    console.log('✅ Веб-хук очищен');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка обновления команд:', error);
    process.exit(1);
  }
}

updateBotCommands();