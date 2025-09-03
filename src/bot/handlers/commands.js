const { userService, projectService, expenseService } = require('../../services/supabase');
const googleSheetsService = require('../../services/googleSheets');
const { getMainMenuKeyboard, getCurrencyKeyboard } = require('../keyboards/reply');
const { getProjectSelectionKeyboard, getSettingsKeyboard, getUpgradeKeyboard } = require('../keyboards/inline');
const { SUPPORTED_CURRENCIES, SUBSCRIPTION_LIMITS } = require('../../config/constants');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');

// Command: /start
async function handleStart(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    if (!user) {
      return bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
    }

    // Check if user needs currency setup
    if (!user.primary_currency || user.primary_currency === 'USD') {
      await bot.sendMessage(chatId, 
        `🏦 Добро пожаловать в Expense Tracker!

Я помогу вам легко отслеживать расходы:
• 🎤 Отправляйте голосовые сообщения  
• 💬 Пишите текстом "кофе 200р"
• 📊 Получайте аналитику с AI
• 📋 Синхронизация с Google Sheets

💰 Сначала выберите валюту по умолчанию:`
      );

      const currencyKeyboard = {
        inline_keyboard: [
          [
            { text: '🇷🇺 Рубль (RUB)', callback_data: 'set_currency_RUB' },
            { text: '🇺🇸 Доллар (USD)', callback_data: 'set_currency_USD' }
          ],
          [
            { text: '🇪🇺 Евро (EUR)', callback_data: 'set_currency_EUR' },
            { text: '🇬🇧 Фунт (GBP)', callback_data: 'set_currency_GBP' }
          ],
          [
            { text: '🇰🇿 Тенге (KZT)', callback_data: 'set_currency_KZT' },
            { text: '🇺🇦 Гривна (UAH)', callback_data: 'set_currency_UAH' }
          ]
        ]
      };

      return bot.sendMessage(chatId, 'Выберите валюту:', { reply_markup: currencyKeyboard });
    }

    // Check if user already has projects
    const userProjects = await projectService.findByUserId(user.id);
    
    if (userProjects.length === 0) {
      // First time user - create project immediately
      await bot.sendMessage(chatId, 
        `✨ Создаю ваш первый проект...`
      );

      // Create first project automatically
      const project = await projectService.create({
        owner_id: user.id,
        name: 'Личные расходы',
        description: 'Проект для отслеживания расходов',
        is_active: true
      });

      await bot.sendMessage(chatId, 
        `✅ Проект "Личные расходы" создан!

✨ Теперь попробуйте добавить трату:
• Голосом: "Потратил 200 рублей на кофе"
• Текстом: "кофе 200р"

📊 Для подключения Google таблицы используйте: /connect [ID_таблицы]`,
        { reply_markup: getMainMenuKeyboard() }
      );
    } else {
      // Existing user - show main menu
      await bot.sendMessage(chatId, 
        `👋 С возвращением, ${user.first_name || 'друг'}!

🏦 Expense Tracker готов к работе.

Отправьте голосовое сообщение или напишите трату текстом, например:
• "кофе 200 рублей"
• "такси 15 долларов"
• "продукты 3500"`, 
        { reply_markup: getMainMenuKeyboard() }
      );
    }
  } catch (error) {
    logger.error('Start command error:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
  }
}

// Command: /help
async function handleHelp(msg, match) {
  const chatId = msg.chat.id;
  const bot = getBot();
  
  const helpText = `🏦 Expense Tracker - Справка

📝 Как добавить расход:
• Голосовое: "Потратил 500 рублей на продукты"
• Текстом: "кофе 200р" или "15$ такси"

🎯 Команды:
/start - Запуск бота
/projects - Управление проектами (создание для PRO)  
/connect - Подключить Google таблицу
/sync - Синхронизация с Google Sheets
/settings - Настройки
/categories - Свои категории (PRO)
/upgrade - Информация о PRO плане

🤖 AI аналитика (просто пишите вопросы):
• "Сколько потратил на еду в августе?"
• "На что больше всего трачу?"
• "Сравни этот месяц с прошлым"

💡 Что изменилось:
• 📊 Статистика заменена на умный AI анализ
• 📋 Проекты только для PRO пользователей
• 📂 Кастомные категории с эмодзи (PRO)
• 🎯 Упрощенный интерфейс

❓ Проблемы? Напишите @support_bot`;

  await bot.sendMessage(chatId, helpText);
}

// Command: /projects
async function handleProjects(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    const projects = await projectService.findByUserId(user.id);
    
    if (projects.length === 0) {
      await bot.sendMessage(chatId, 
        '📋 У вас пока нет проектов.\n\nХотите создать первый проект?',
        { 
          reply_markup: {
            inline_keyboard: [[
              { text: '➕ Создать проект', callback_data: 'create_project' }
            ]]
          }
        }
      );
      return;
    }

    let message = '📋 Ваши проекты:\n\n';
    projects.forEach((project, index) => {
      const isOwner = project.owner_id === user.id;
      const status = project.is_active ? '✅' : '⏸️';
      message += `${index + 1}. ${project.name} ${status}\n`;
      message += `   ${isOwner ? '👑 Владелец' : '👤 Участник'}\n`;
      if (project.google_sheet_url) {
        message += `   📊 Google Sheets подключены\n`;
      }
      message += '\n';
    });

    await bot.sendMessage(chatId, message, {
      reply_markup: getProjectSelectionKeyboard(projects, 'manage', user.is_premium)
    });
  } catch (error) {
    logger.error('Projects command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка загрузки проектов.');
  }
}


// Command: /sync
async function handleSync(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    // Check sync limits
    const canSync = await userService.checkDailyLimits(user.id, 'sync');
    if (!canSync) {
      const limit = user.is_premium ? 10 : 1;
      await bot.sendMessage(chatId, 
        `⛔ Лимит синхронизации исчерпан (${limit} раз в день).\n\n💎 В PRO плане: до 10 синхронизаций в день.`,
        { reply_markup: getUpgradeKeyboard() }
      );
      return;
    }

    const projects = await projectService.findByUserId(user.id);
    const projectsWithSheets = projects.filter(p => p.google_sheet_id);

    if (projectsWithSheets.length === 0) {
      await bot.sendMessage(chatId, 
        '📊 У вас нет проектов с подключенными Google Sheets.\n\nGoogle Sheets создаются автоматически при создании проекта.'
      );
      return;
    }

    await bot.sendMessage(chatId, '🔄 Синхронизация с Google Sheets...');

    let totalImported = 0;
    let totalErrors = 0;

    for (const project of projectsWithSheets) {
      try {
        const result = await googleSheetsService.syncFromGoogleSheets(user.id, project.id);
        totalImported += result.imported;
        totalErrors += result.errors.length;
      } catch (error) {
        logger.error(`Sync failed for project ${project.id}:`, error);
        totalErrors++;
      }
    }

    // Increment usage counter
    await userService.incrementDailyUsage(user.id, 'sync');

    await bot.sendMessage(chatId, 
      `✅ Синхронизация завершена!\n\n📥 Импортировано: ${totalImported} записей\n${totalErrors > 0 ? `❌ Ошибок: ${totalErrors}` : ''}\n\nПроверьте свои данные командой /stats`
    );
  } catch (error) {
    logger.error('Sync command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка синхронизации. Попробуйте позже.');
  }
}

// Command: /settings
async function handleSettings(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  const settingsText = `⚙️ Настройки

👤 Пользователь: ${user.first_name} ${user.username ? `(@${user.username})` : ''}
💱 Основная валюта: ${user.primary_currency}
💎 План: ${user.is_premium ? 'PRO' : 'FREE'}

${user.is_premium ? '✨ Доступны все PRO функции!' : '💎 Обновитесь до PRO для дополнительных возможностей!'}`;

  await bot.sendMessage(chatId, settingsText, {
    reply_markup: getSettingsKeyboard(user.is_premium)
  });
}

// Command: /categories (PRO only)
async function handleCategories(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  if (!user.is_premium) {
    await bot.sendMessage(chatId, 
      '💎 Кастомные категории доступны только в PRO плане!',
      { reply_markup: getUpgradeKeyboard() }
    );
    return;
  }

  await bot.sendMessage(chatId, 
    `📂 Управление категориями
    
🆓 Доступные категории:
• 🍔 Еда и рестораны
• 🚗 Транспорт 
• 🏠 Дом и быт
• 🛍️ Покупки
• 💊 Здоровье
• 🎬 Развлечения
• 💼 Работа
• ✈️ Путешествия
• 🎓 Образование

💎 В PRO плане доступно создание своих категорий с эмодзи!`,
    { reply_markup: getUpgradeKeyboard() }
  );
}

// Command: /upgrade
async function handleUpgrade(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  if (user.is_premium) {
    await bot.sendMessage(chatId, 
      '💎 У вас уже есть PRO план!\n\nСпасибо за поддержку! 🙏'
    );
    return;
  }

  const upgradeText = `💎 Expense Tracker PRO

🆓 FREE план:
• 1 проект
• 50 записей/месяц
• 5 AI вопросов/день
• 1 синхронизация/день
• Базовые категории

💎 PRO планы:
• ∞ Неограниченные проекты
• ∞ Неограниченные записи
• 20 AI вопросов/день
• 10 синхронизаций/день
• 👥 Командная работа
• 📂 Кастомные категории
• ⚡ Приоритетная поддержка

💰 Цены (Telegram Stars):
• 1 месяц: 250 ⭐ (~$5)
• 6 месяцев: 1200 ⭐ (~$24) 🔥 Экономия $6
• 1 год: 2000 ⭐ (~$40) 🔥🔥 Экономия $20`;

  await bot.sendMessage(chatId, upgradeText, {
    reply_markup: getUpgradeKeyboard()
  });
}

// Command: /invite (PRO only)
async function handleInvite(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const username = match[1];
  const bot = getBot();

  if (!user.is_premium) {
    await bot.sendMessage(chatId, 
      '💎 Приглашения в команду доступны только в PRO плане!',
      { reply_markup: getUpgradeKeyboard() }
    );
    return;
  }

  await bot.sendMessage(chatId, 
    `👥 Командная работа (PRO функция)

Пригласить пользователя @${username} в команду?

💎 В PRO плане доступно:
• Совместные проекты
• Приглашения по username
• Общие Google таблицы
• Роли и права доступа

🚧 Функция в разработке`,
    { reply_markup: getUpgradeKeyboard() }
  );
}

// Command: /email - Set Google email for sheet access
async function handleEmail(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const email = match[1];
  const bot = getBot();

  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      await bot.sendMessage(chatId, '❌ Неверный формат email. Попробуйте еще раз.');
      return;
    }

    // Update user's email
    await userService.update(user.id, { email: email });

    // Share existing project sheets with the user
    const projects = await projectService.findByUserId(user.id);
    let sharedCount = 0;

    for (const project of projects) {
      if (project.google_sheet_id) {
        const shared = await googleSheetsService.shareSheetWithUser(
          project.google_sheet_id, 
          email, 
          user.first_name
        );
        if (shared) sharedCount++;
      }
    }

    let message = `✅ Email ${email} сохранен!`;
    if (sharedCount > 0) {
      message += `\n📊 ${sharedCount} таблиц(ы) теперь доступны в вашем Google Drive`;
    }

    await bot.sendMessage(chatId, message);
  } catch (error) {
    logger.error('Email command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка сохранения email.');
  }
}

// Command: /connect - Connect to user's Google Sheet
async function handleConnect(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const spreadsheetId = match ? match[1] : null;
  const bot = getBot();

  try {
    // If no spreadsheet ID provided, ask for link with instructions
    if (!spreadsheetId) {
      const { stateManager } = require('../../utils/stateManager');
      stateManager.setState(chatId, 'WAITING_GOOGLE_SHEETS_LINK');
      
      await bot.sendMessage(chatId,
        `🔗 **Подключение Google Sheets**\n\n` +
        `**Пошаговая инструкция:**\n\n` +
        `1️⃣ Откройте Google Sheets и создайте новую таблицу\n` +
        `2️⃣ Нажмите **"Настроить доступ"** → **"Предоставить доступ"**\n` +
        `3️⃣ Добавьте email: **ai-assistant@your-project.iam.gserviceaccount.com**\n` +
        `4️⃣ Установите права: **"Редактор"**\n` +
        `5️⃣ Скопируйте ссылку на таблицу и отправьте мне\n\n` +
        `📝 **Пример ссылки:**\n` +
        `https://docs.google.com/spreadsheets/d/1A2B3C.../edit\n\n` +
        `✨ Просто отправьте такую ссылку следующим сообщением!`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Extract spreadsheet ID from URL if full URL provided
    let cleanSpreadsheetId = spreadsheetId;
    if (spreadsheetId.includes('docs.google.com')) {
      const match = spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        cleanSpreadsheetId = match[1];
      } else {
        await bot.sendMessage(chatId, '❌ Неверная ссылка на Google таблицу.');
        return;
      }
    }

    // Validate spreadsheet ID format
    if (!/^[a-zA-Z0-9-_]+$/.test(cleanSpreadsheetId)) {
      await bot.sendMessage(chatId, '❌ Неверный формат ID таблицы.');
      return;
    }

    await bot.sendMessage(chatId, '🔄 Подключаюсь к вашей Google таблице...');

    // Connect to the sheet
    const result = await googleSheetsService.connectToUserSheet(cleanSpreadsheetId, user.email);

    if (!result.success) {
      await bot.sendMessage(chatId, `❌ ${result.error}`);
      return;
    }

    // Get user's active project or create one
    const projects = await projectService.findByUserId(user.id);
    let activeProject = projects.find(p => p.is_active) || projects[0];

    if (!activeProject) {
      // Create new project
      activeProject = await projectService.create({
        owner_id: user.id,
        name: 'Личные траты',
        description: 'Проект для отслеживания расходов',
        is_active: true
      });
    }

    // Update project with sheet info
    await projectService.update(activeProject.id, {
      google_sheet_id: cleanSpreadsheetId,
      google_sheet_url: result.sheetUrl
    });

    await bot.sendMessage(chatId, 
      `✅ Подключение успешно!

📊 Таблица: ${result.title}
🔗 Ссылка: ${result.sheetUrl}

Теперь все ваши расходы будут автоматически добавляться в эту таблицу.

✨ Попробуйте добавить первую трату:
• Голосом: "Потратил 200 рублей на кофе"
• Текстом: "кофе 200р"`,
      { reply_markup: getMainMenuKeyboard() }
    );

  } catch (error) {
    logger.error('Connect command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка подключения к таблице.');
  }
}



// Secret command: /devpro - Activate PRO for developers
async function handleDevPro(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    // Update user to PRO status
    await userService.update(user.id, { is_premium: true });

    await bot.sendMessage(chatId, 
      `🎉 PRO план активирован!

💎 Теперь вам доступно:
• ∞ Неограниченные проекты
• ∞ Неограниченные записи  
• 20 AI вопросов/день
• 10 синхронизаций/день
• 👥 Командная работа
• 📂 Кастомные категории
• ⚡ Приоритетная поддержка

Добро пожаловать в PRO! 🚀`
    );
  } catch (error) {
    logger.error('DevPro command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка активации PRO.');
  }
}

// Command: /ask - AI questions about expenses
async function handleAsk(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();
  const question = match[1]?.trim();

  if (!question) {
    await bot.sendMessage(chatId, 
      `🤖 AI-анализ расходов\n\nЗадайте вопрос о ваших тратах:\n\n📝 Примеры:\n• /ask сколько я потратил на еду на этой неделе?\n• /ask какая моя самая дорогая категория?\n• /ask сколько в среднем трачу в день?\n• /ask сравни расходы этого месяца с прошлым`
    );
    return;
  }

  try {
    // Check AI limits
    const canUseAI = await userService.checkDailyLimits(user.id, 'ai_question');
    if (!canUseAI) {
      const limit = user.is_premium ? 20 : 5;
      await bot.sendMessage(chatId, 
        `⛔ Лимит AI-вопросов исчерпан (${limit} в день).\n\n💎 В PRO плане: до 20 вопросов в день.`,
        { reply_markup: getUpgradeKeyboard() }
      );
      return;
    }

    // Get user's active project
    const projects = await projectService.findByUserId(user.id);
    const activeProject = projects.find(p => p.is_active);

    if (!activeProject) {
      await bot.sendMessage(chatId, 
        '📊 Сначала создайте проект для отслеживания расходов.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '➕ Создать проект', callback_data: 'create_project' }
            ]]
          }
        }
      );
      return;
    }

    await bot.sendMessage(chatId, '🤖 Анализирую ваши расходы...');

    // Get recent expenses (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const expenses = await expenseService.findByProject(activeProject.id, 1000, 0);
    const recentExpenses = expenses.filter(exp => 
      new Date(exp.expense_date) >= threeMonthsAgo
    );

    if (recentExpenses.length === 0) {
      await bot.sendMessage(chatId, '📭 У вас пока нет расходов для анализа.');
      return;
    }

    // Use analytics service to generate AI response
    const analyticsService = require('../../services/analytics');
    const response = await analyticsService.askAIAnalytics(user.id, question);

    await bot.sendMessage(chatId, `🤖 ${response}`);

    // Increment usage counter
    await userService.incrementDailyUsage(user.id, 'ai_question');

  } catch (error) {
    logger.error('Ask command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка AI-анализа. Попробуйте позже.');
  }
}

module.exports = {
  handleStart,
  handleHelp,
  handleProjects,
  handleSync,
  handleSettings,
  handleCategories,
  handleUpgrade,
  handleInvite,
  handleEmail,
  handleConnect,
  handleDevPro,
  handleAsk
};