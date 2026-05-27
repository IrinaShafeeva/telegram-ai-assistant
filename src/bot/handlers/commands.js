const { userService, projectService, projectSheetService, expenseService, customCategoryService, transactionService } = require('../../services/supabase');
const googleSheetsService = require('../../services/googleSheets');
const { getMainMenuKeyboard, getCurrencyKeyboard } = require('../keyboards/reply');
const { getProjectSelectionKeyboard, getSettingsKeyboard, getCurrencySelectionKeyboard, getRecentTransactionsKeyboard } = require('../keyboards/inline');
const { SUPPORTED_CURRENCIES } = require('../../config/constants');
const { getBot } = require('../../utils/bot');
const { stateManager } = require('../../utils/stateManager');
const logger = require('../../utils/logger');
const { showLumikUpdateIfNeeded, userHasFamilyMenu, sendPartnerWelcomeAfterJoin } = require('./familyBudget');

// Command: /start
async function handleStart(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    // Clear any active states when command is called
    stateManager.clearState(chatId);

    if (!user) {
      logger.error(`Start command: user is null for chatId ${chatId}`);
      return bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
    }

    logger.info(`Start command called by user ${user.id} (${user.first_name || 'unknown'})`);

    // Check for invite token parameter: /start TOKEN
    const inviteToken = match && match[1];
    if (inviteToken) {
      try {
        const { projectMemberService } = require('../../services/supabase');
        const project = await projectMemberService.joinByInvite(inviteToken, user.id);

        if (project.is_family_budget) {
          await sendPartnerWelcomeAfterJoin(chatId, user, project);
        } else {
          await bot.sendMessage(chatId,
            `✅ Вы успешно присоединились к проекту "${project.name}"!\n\n` +
            `Теперь вы можете добавлять траты и доходы в этот проект.`
          );
        }
        return;
      } catch (error) {
        logger.error('Invite join error:', error);
        await bot.sendMessage(chatId, `❌ ${error.message}`);
        return;
      }
    }

    // Check if user already has projects
    const userProjects = await projectService.findByUserId(user.id);
    
    if (userProjects.length === 0) {
      // First time user - show currency selection first
      await bot.sendMessage(chatId,
        `🌟 Добро пожаловать в AI трекер расходов!

🎯 Давайте настроим ваш первый проект:

💱 Сначала выберите основную валюту:`,
        { reply_markup: getCurrencySelectionKeyboard('initial', 'onboarding') }
      );
    } else {
      const hasFamily = await userHasFamilyMenu(user.id);
      await bot.sendMessage(chatId, 
        `👋 С возвращением, ${user.first_name || 'друг'}!

🏦 Loomiq готов к работе.

Отправьте голосовое сообщение или напишите трату текстом, например:
• "кофе 15 евро"
• "такси 15 долларов"
• "продукты 3500"`, 
        { reply_markup: getMainMenuKeyboard(hasFamily) }
      );
      await showLumikUpdateIfNeeded(chatId, user);
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
  
  const helpText = `🏦 Loomiq - Справка

📝 Как добавить транзакцию:
• Голосовое: "Потратил 50 евро на продукты"
• Текстом: "кофе 15€" или "зарплата 3500€"
• Поддержка расходов и доходов

🎯 Команды (через меню):
/start - Главное меню
/help - Эта справка

🤖 Умные запросы (просто пишите):
• "Сколько потратил на еду в августе?"
• "На что больше всего трачу?"
• "Покажи баланс за месяц"

✏️ Редактирование записей:
• "Хочу отредактировать последние 5 записей"
• "Покажи последние 10 записей" + кнопка "Редактировать"
• Изменяйте сумму, описание, категорию и проект

Дополнительно:
• 📂 Кастомные категории с эмодзи
• 📋 Несколько проектов
• 🎯 Ключевые слова для автоопределения проектов
• 👥 Командные проекты

❓ Проблемы? Напишите @loomiq_support`;

  await bot.sendMessage(chatId, helpText);
}

// Command: /projects
async function handleProjects(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    // Clear any active states when command is called
    stateManager.clearState(chatId);
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

    // Create clickable project buttons
    const keyboard = projects.map(project => ([{
      text: `📁 ${project.name}`,
      callback_data: `project_info:${project.id}`
    }]));

    // Add create project button
    keyboard.push([{ text: '➕ Создать проект', callback_data: 'create_project' }]);

    let message = '📋 Ваши проекты:\n\nНажмите на проект для просмотра детальной информации:';

    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
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
    // Clear any active states when command is called
    stateManager.clearState(chatId);
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
      `✅ Синхронизация завершена!\n\n📥 Импортировано: ${totalImported} записей${totalErrors > 0 ? `\n❌ Ошибок: ${totalErrors}` : ''}`
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

  // Clear any active states when command is called
  stateManager.clearState(chatId);

  const settingsText = `⚙️ Настройки

👤 Пользователь: ${user.first_name} ${user.username ? `(@${user.username})` : ''}
💱 Основная валюта: ${user.primary_currency}`;

  await bot.sendMessage(chatId, settingsText, {
    reply_markup: getSettingsKeyboard()
  });
}

// Command: /categories
async function handleCategories(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    // Get user's custom categories
    const customCategories = await customCategoryService.findByUserId(user.id);
    const categoryCount = await customCategoryService.getCountByUserId(user.id);

    let message = `📂 Управление категориями

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

📌 Ваши категории (${categoryCount}/50):`;

    if (customCategories.length === 0) {
      message += '\nПока нет кастомных категорий.';
    } else {
      customCategories.forEach(cat => {
        message += `\n• ${cat.emoji || '📁'} ${cat.name}`;
      });
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '➕ Добавить категорию', callback_data: 'add_custom_category' },
          { text: '📝 Управлять', callback_data: 'manage_categories' }
        ],
        [{ text: '🔙 Назад', callback_data: 'main_menu' }]
      ]
    };

    await bot.sendMessage(chatId, message, { reply_markup: keyboard });
  } catch (error) {
    logger.error('Error showing categories:', error);
    await bot.sendMessage(chatId, '❌ Ошибка загрузки категорий.');
  }
}

// Command: /invite
async function handleInvite(msg, match) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const username = match[1];
  const bot = getBot();

  await bot.sendMessage(chatId, 
    `👥 Командная работа

Пригласить пользователя @${username} в команду?

Доступно:
• Совместные проекты
• Приглашения по username
• Общие Google таблицы
• Роли и права доступа

🚧 Функция в разработке`
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
    // Clear any active states when command is called
    stateManager.clearState(chatId);

    // If no spreadsheet ID provided, show project selection first
    if (!spreadsheetId) {
      const { projectService } = require('../../services/supabase');

      // Only project owners can attach the shared Google Sheet for a project.
      const projects = (await projectService.findByUserId(user.id))
        .filter(project => project.owner_id === user.id || project.user_role === 'owner');

      if (projects.length === 0) {
        await bot.sendMessage(chatId, '❌ Сначала создайте проект для подключения таблицы.\n\nИспользуйте команду 📋 Проекты для создания.');
        return;
      }

      // Show project selection menu
      const keyboard = projects.map(project => ([{
        text: `📁 ${project.name}${project.is_active ? ' ✅' : ''}`,
        callback_data: `select_project_for_connect:${project.id}`
      }]));

      keyboard.push([{
        text: '❌ Отмена',
        callback_data: 'cancel_connect'
      }]);

      await bot.sendMessage(chatId,
        `🔗 Подключение Google Sheets\n\n` +
        `📋 Выберите проект для подключения таблицы:`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        }
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

    // Get user's active owned project or create one
    const projects = (await projectService.findByUserId(user.id))
      .filter(project => project.owner_id === user.id || project.user_role === 'owner');
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

    const healthResult = await googleSheetsService.checkProjectSheet(cleanSpreadsheetId, activeProject.name);
    if (!healthResult.success) {
      await bot.sendMessage(chatId, `❌ Таблица открывается, но её не удалось подготовить для проекта: ${healthResult.error}`);
      return;
    }

    // Save the connection in project_sheets and keep legacy project fields in sync.
    await projectSheetService.upsertConnection(activeProject.id, {
      google_sheet_id: cleanSpreadsheetId,
      google_sheet_url: result.sheetUrl,
      connected_by_user_id: user.id,
      status: 'active'
    });

    await bot.sendMessage(chatId, 
      `✅ Подключение успешно!

📊 Таблица: ${result.title}
🔗 Ссылка: ${result.sheetUrl}

Теперь все ваши расходы будут автоматически добавляться в эту таблицу.

✨ Попробуйте добавить первую трату:
• Голосом: "Потратил 15 евро на кофе"
• Текстом: "кофе 15€"`,
      { reply_markup: getMainMenuKeyboard() }
    );

  } catch (error) {
    logger.error('Connect command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка подключения к таблице.');
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

async function handleTeam(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    // Get user's projects to see which ones are collaborative
    const projects = await projectService.findByUserId(user.id);

    if (projects.length === 0) {
      await bot.sendMessage(chatId,
        '📂 У вас пока нет проектов.\n\n' +
        'Создайте проект через команду "📋 Проекты"'
      );
      return;
    }

    const collaborativeProjects = projects.filter(p => p.is_collaborative && p.user_role === 'owner');
    const memberProjects = projects.filter(p => p.user_role === 'member');

    let message = '👥 Командная работа\n\n';

    if (collaborativeProjects.length > 0) {
      message += '📋 Ваши командные проекты:\n';
      for (const project of collaborativeProjects) {
        const members = await projectService.getMembers(project.id);
        message += `• ${project.name} (${members.length + 1} участников)\n`;
      }
      message += '\n';
    }

    if (memberProjects.length > 0) {
      message += '🤝 Проекты где вы участник:\n';
      for (const project of memberProjects) {
        message += `• ${project.name}\n`;
      }
      message += '\n';
    }

    const keyboard = [
      [{ text: '➕ Сделать проект командным', callback_data: 'make_collaborative' }],
      [{ text: '👤 Пригласить участника', callback_data: 'invite_member' }],
      [{ text: '👥 Управление участниками', callback_data: 'manage_members' }]
    ];

    await bot.sendMessage(chatId, message, {
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    logger.error('Error in handleTeam:', error);
    await bot.sendMessage(chatId, '❌ Ошибка загрузки командных проектов');
  }
}

// Command: /edit
async function handleEdit(msg, match, limit = 3) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  try {
    // Clear any active states
    stateManager.clearState(chatId);

    const editLimit = 20;
    const requestedLimit = limit || editLimit;
    const actualLimit = Math.min(requestedLimit, editLimit);

    // Get recent transactions
    const recentTransactions = await transactionService.getRecentTransactions(user.id, actualLimit);

    if (recentTransactions.length === 0) {
      await bot.sendMessage(chatId,
        '📝 У вас пока нет транзакций для редактирования.\n\n💡 Добавьте несколько трат или доходов, чтобы потом их можно было изменить.'
      );
      return;
    }

    const keyboard = getRecentTransactionsKeyboard(recentTransactions);

    let message = `✏️ Редактирование транзакций\n\nПоказано последних записей: ${recentTransactions.length}`;

    message += '\n\nВыберите транзакцию для редактирования:';

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

  } catch (error) {
    logger.error('Edit command error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка загрузки транзакций. Попробуйте позже.');
  }
}

module.exports = {
  handleStart,
  handleHelp,
  handleProjects,
  handleSync,
  handleSettings,
  handleCategories,
  handleTeam,
  handleInvite,
  handleEmail,
  handleConnect,
  handleAsk,
  handleEdit
};
