const { userService, projectService, expenseService, customCategoryService, incomeService, supabase } = require('../../services/supabase');
const googleSheetsService = require('../../services/googleSheets');
const { tempExpenses, tempIncomes } = require('./messages');
const { 
  getCategorySelectionKeyboard, 
  getIncomeCategorySelectionKeyboard,
  getIncomeProjectSelectionKeyboard,
  getIncomeConfirmationKeyboard,
  getAmountSelectionKeyboard,
  getExpenseConfirmationKeyboard,
  getProjectSelectionKeyboardForExpense,
  getUpgradeKeyboard,
  getExportFormatKeyboard,
  getExportPeriodKeyboard,
  getSettingsKeyboard
} = require('../keyboards/inline');
const { getBot } = require('../../utils/bot');
const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
const logger = require('../../utils/logger');

async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const user = callbackQuery.user; // Should be set by withUserCallback middleware
  const bot = getBot();

  // Debug user data
  if (!user || !user.id) {
    logger.error('User data missing in callback:', { 
      hasUser: !!callbackQuery.user, 
      hasFrom: !!callbackQuery.from,
      fromId: callbackQuery.from?.id 
    });
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: '❌ Ошибка данных пользователя', 
      show_alert: true 
    });
    return;
  }

  try {
    await bot.answerCallbackQuery(callbackQuery.id);

    // Route callback to appropriate handler
    if (data.startsWith('set_currency_')) {
      await handleSetCurrency(chatId, messageId, data, callbackQuery.user);
    } else if (data.startsWith('change_currency_')) {
      await handleChangeCurrency(chatId, messageId, data, callbackQuery.user);
    } else if (data === 'back_to_settings') {
      await handleBackToSettings(chatId, messageId, callbackQuery.user);
    } else if (data.startsWith('save_expense:')) {
      await handleSaveExpense(chatId, messageId, data, user);
    } else if (data.startsWith('edit_category:')) {
      await handleEditCategory(chatId, messageId, data, user);
    } else if (data.startsWith('edit_amount:')) {
      await handleEditAmount(chatId, messageId, data, user);
    } else if (data.startsWith('edit_description:')) {
      await handleEditDescription(chatId, messageId, data, user);
    } else if (data.startsWith('edit_project:')) {
      await handleEditProject(chatId, messageId, data, user);
    } else if (data.startsWith('set_project:')) {
      await handleSetProject(chatId, messageId, data, user);
    } else if (data.startsWith('set_category:')) {
      await handleSetCategory(chatId, messageId, data, user);
    } else if (data.startsWith('set_income_category:')) {
      await handleSetIncomeCategory(chatId, messageId, data, user);
    } else if (data.startsWith('set_income_project:')) {
      await handleSetIncomeProject(chatId, messageId, data, user);
    } else if (data.startsWith('back_to_income_confirmation:')) {
      await handleBackToIncomeConfirmation(chatId, messageId, data, user);
    } else if (data.startsWith('save_income:')) {
      await handleSaveIncome(chatId, messageId, data, user);
    } else if (data.startsWith('edit_income_category:')) {
      await handleEditIncomeCategory(chatId, messageId, data, user);
    } else if (data.startsWith('edit_income_amount:')) {
      await handleEditIncomeAmount(chatId, messageId, data, user);
    } else if (data.startsWith('edit_income_description:')) {
      await handleEditIncomeDescription(chatId, messageId, data, user);
    } else if (data.startsWith('edit_income_project:')) {
      await handleEditIncomeProject(chatId, messageId, data, user);
    } else if (data.startsWith('cancel_income:')) {
      await handleCancelIncome(chatId, messageId, data);
    } else if (data.startsWith('cancel_expense:')) {
      await handleCancelExpense(chatId, messageId, data);
    } else if (data.startsWith('back_to_confirmation:')) {
      await handleBackToConfirmation(chatId, messageId, data, user);
    } else if (data.startsWith('create_project')) {
      await handleCreateProject(chatId, user);
    } else if (data.startsWith('upgrade:')) {
      await handleUpgradeAction(chatId, messageId, data);
    } else if (data.startsWith('settings:')) {
      await handleSettingsAction(chatId, messageId, data, user);
    } else if (data.startsWith('switch_project:') || data.startsWith('activate_project:')) {
      await handleSwitchProject(chatId, messageId, data, user);
    } else if (data.startsWith('delete_project:')) {
      await handleDeleteProject(chatId, messageId, data, user);
    } else if (data.startsWith('edit_project_name:')) {
      await handleEditProjectName(chatId, messageId, data, user);
    } else if (data.startsWith('confirm_delete_project:')) {
      await handleConfirmDeleteProject(chatId, messageId, data, user);
    } else if (data === 'back_to_projects') {
      await handleBackToProjects(chatId, messageId, user);
    } else if (data === 'create_project_existing_sheet') {
      await handleCreateProjectWithExistingSheet(chatId, messageId, user);
    } else if (data === 'create_project_new_sheet') {
      await handleCreateProjectWithNewSheet(chatId, messageId, user);
    } else if (data === 'cancel_project_creation') {
      await handleCancelProjectCreation(chatId, messageId, user);
    } else if (data.startsWith('custom_category:')) {
      await handleCustomCategory(chatId, messageId, data, user);
    } else if (data.startsWith('custom_amount:')) {
      await handleCustomAmount(chatId, messageId, data, user);
    } else if (data === 'add_custom_category') {
      await handleAddCustomCategory(chatId, messageId, user);
    } else if (data === 'manage_categories') {
      await handleManageCategories(chatId, messageId, user);
    } else if (data.startsWith('edit_custom_category:')) {
      await handleEditCustomCategory(chatId, messageId, data, user);
    } else if (data.startsWith('delete_category:')) {
      await handleDeleteCategory(chatId, messageId, data, user);
    } else if (data.startsWith('confirm_delete_category:')) {
      await handleConfirmDeleteCategory(chatId, messageId, data, user);
    } else if (data.startsWith('edit_cat_name:')) {
      await handleEditCategoryName(chatId, messageId, data, user);
    } else if (data.startsWith('edit_cat_emoji:')) {
      await handleEditCategoryEmoji(chatId, messageId, data, user);
    } else if (data.startsWith('remove_emoji:')) {
      await handleRemoveEmoji(chatId, messageId, data, user);
    } else if (data === 'skip_emoji') {
      await handleSkipEmoji(chatId, messageId, user);
    } else if (data === 'categories') {
      await handleCategoriesCallback(chatId, messageId, user);
    } else if (data.startsWith('export_format:')) {
      await handleExportFormat(chatId, messageId, data, user);
    } else if (data.startsWith('export_period:')) {
      await handleExportPeriod(chatId, messageId, data, user);
    } else if (data === 'confirm_clear_data') {
      await handleConfirmClearData(chatId, messageId, user);
    } else if (data === 'cancel_clear_data') {
      await handleCancelClearData(chatId, messageId, user);
    } else if (data === 'noop') {
      // Pagination placeholder - answer callback query to remove loading state
      await bot.answerCallbackQuery(callbackQuery.id, { text: '' });
      return;
    } else {
      logger.warn('Unknown callback data:', data);
    }
  } catch (error) {
    logger.error('Callback handling error:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
  }
}

async function handleSaveExpense(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  const expenseData = tempExpenses.get(tempId);

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    // Save expense to database
    logger.info(`💾 Saving expense to database: ${expenseData.description} - ${expenseData.amount} ${expenseData.currency}`);
    const savedExpense = await expenseService.create(expenseData);
    logger.info(`✅ Expense saved with ID: ${savedExpense.id}`);

    // Try to add to Google Sheets (don't fail if this fails)
    let sheetsSuccess = false;
    logger.info(`🔄 Starting Google Sheets sync for project: ${expenseData.project_id}`);
    try {
      await googleSheetsService.addExpenseToSheet(savedExpense, expenseData.project_id);
      sheetsSuccess = true;
      logger.info(`✅ Google Sheets sync successful`);
    } catch (sheetsError) {
      logger.warn('Google Sheets sync failed but expense saved:', sheetsError.message);
      logger.error('Google Sheets sync error details:', sheetsError);
    }

    // Get project name for confirmation
    const project = await projectService.findById(expenseData.project_id);

    const successText = `✅ Расход сохранён!

💰 ${expenseData.description}: -${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📋 Проект: ${project.name}
${sheetsSuccess ? '📊 Добавлено в Google Sheets' : '📊 Синхронизация с Google Sheets: ошибка (данные сохранены)'}

📈 Посмотреть статистику: /stats`;

    await bot.editMessageText(successText, {
      chat_id: chatId,
      message_id: messageId
    });

    // Remove temp data
    tempExpenses.delete(tempId);

  } catch (error) {
    logger.error('Save expense error:', error);
    await bot.editMessageText('❌ Ошибка сохранения расхода. Попробуйте позже.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}


async function handleEditAmount(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  const expenseData = tempExpenses.get(tempId);

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  await bot.editMessageText('💰 Выберите сумму или введите свою:', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: getAmountSelectionKeyboard(tempId)
  });
}

async function handleEditDescription(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  const bot = getBot();
  
  // Set state to wait for description input
  stateManager.setState(chatId, STATE_TYPES.WAITING_EXPENSE_DESCRIPTION, { 
    tempId,
    messageId 
  });
  
  await bot.editMessageText('📝 Отправьте новое описание расхода:', {
    chat_id: chatId,
    message_id: messageId
  });
}

async function handleEditCategory(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  const expenseData = tempExpenses.get(tempId);
  const bot = getBot();

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    // Get user's custom categories if PRO
    let customCategories = [];
    if (user.is_premium) {
      try {
        customCategories = await customCategoryService.findByUserId(user.id);
      } catch (error) {
        logger.error('Error loading custom categories:', error);
      }
    }

    await bot.editMessageText('📂 Выберите категорию:', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getCategorySelectionKeyboard(tempId, customCategories)
    });
  } catch (error) {
    logger.error('Error loading categories for expense:', error);
    await bot.editMessageText('❌ Ошибка загрузки категорий.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleEditProject(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  const expenseData = tempExpenses.get(tempId);
  const bot = getBot();

  if (!user.is_premium) {
    await bot.editMessageText('💎 Проекты доступны только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `back_to_confirmation:${tempId}` }]] }
    });
    return;
  }

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    // Get user's projects
    logger.info(`User object:`, JSON.stringify(user, null, 2));
    logger.info(`Getting projects for user: ${user.id}`);
    const projects = await projectService.findByUserId(user.id);
    logger.info(`Found ${projects?.length || 0} projects for user ${user.id}`);
    
    if (!projects || projects.length === 0) {
      await bot.editMessageText('❌ У вас нет проектов для выбора.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    await bot.editMessageText('📋 Выберите проект:', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getProjectSelectionKeyboardForExpense(tempId, projects)
    });
  } catch (error) {
    logger.error('Error loading projects for expense:', error);
    await bot.editMessageText('❌ Ошибка загрузки проектов.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleSetProject(chatId, messageId, data, user) {
  const parts = data.split(':');
  const tempId = parts[1];
  const projectIndex = parseInt(parts[2]);
  const expenseData = tempExpenses.get(tempId);
  const bot = getBot();

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    // Get all user's projects to find by index
    const projects = await projectService.findByUserId(user.id);
    const project = projects[projectIndex];
    
    if (!project) {
      throw new Error('Project not found');
    }

    // Update expense data
    expenseData.project_id = project.id;
    tempExpenses.set(tempId, expenseData);

    // Show updated confirmation
    const confirmationText = `💰 Подтвердите расход:

📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}  
📂 Категория: ${expenseData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

✅ Проект обновлен!`;

    await bot.editMessageText(confirmationText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getExpenseConfirmationKeyboard(tempId, user.is_premium)
    });
  } catch (error) {
    logger.error('Error setting project for expense:', error);
    await bot.editMessageText('❌ Ошибка обновления проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleSetCategory(chatId, messageId, data, user) {
  const parts = data.split(':');
  const tempId = parts[1];
  const categoryIndex = parseInt(parts[2]);
  const expenseData = tempExpenses.get(tempId);

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    logger.info(`Setting category for expense ${tempId}, categoryIndex: ${categoryIndex}, user.is_premium: ${user.is_premium}`);
    
    // Get available categories (same logic as in keyboard)
    let customCategories = [];
    if (user.is_premium) {
      try {
        customCategories = await customCategoryService.findByUserId(user.id);
        logger.info(`Found ${customCategories.length} custom categories`);
      } catch (customError) {
        logger.error('Error getting custom categories:', customError);
        customCategories = [];
      }
    }
    
    const { DEFAULT_CATEGORIES } = require('../../config/constants');
    const categories = [...DEFAULT_CATEGORIES, ...customCategories.map(c => `${c.emoji} ${c.name}`)];
    logger.info(`Total categories: ${categories.length}, categoryIndex: ${categoryIndex}`);
    logger.info(`Available categories: ${JSON.stringify(categories)}`);
    
    const selectedCategory = categories[categoryIndex];
    
    if (!selectedCategory) {
      throw new Error('Invalid category index');
    }

    // Extract category name without emoji
    const categoryName = selectedCategory.split(' ').slice(1).join(' ');
    expenseData.category = categoryName;
    tempExpenses.set(tempId, expenseData);

    await handleBackToConfirmation(chatId, messageId, `back_to_confirmation:${tempId}`, user);
  } catch (error) {
    logger.error('Error setting category:', error);
    await bot.editMessageText('❌ Ошибка выбора категории.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}


async function handleBackToConfirmation(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  const expenseData = tempExpenses.get(tempId);

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  // Get project name
  const project = await projectService.findById(expenseData.project_id);

  const confirmationText = `💰 Подтвердите расход:

📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

  await bot.editMessageText(confirmationText, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: getExpenseConfirmationKeyboard(tempId, user.is_premium)
  });
}

async function handleCancelExpense(chatId, messageId, data) {
  const tempId = data.split(':')[1];
  tempExpenses.delete(tempId);

  await bot.editMessageText('❌ Расход отменён.', {
    chat_id: chatId,
    message_id: messageId
  });
}

async function handleCreateProject(chatId, user) {
  const bot = getBot();
  
  try {
    // Get user data
    const userData = await userService.findById(user.id);
    const userProjects = await projectService.findByUserId(user.id);

    // For FREE users, only allow 1 project
    if (!userData.is_premium && userProjects.length >= 1) {
      await bot.sendMessage(chatId, 
        '⛔ Лимит проектов исчерпан!\n\n🆓 FREE план: 1 проект\n💎 PRO план: неограниченные проекты',
        { reply_markup: getUpgradeKeyboard() }
      );
      return;
    }

    // For first project, create automatically
    if (userProjects.length === 0) {
      const newProject = await projectService.create({
        owner_id: user.id,
        name: 'Личные расходы',
        description: 'Проект для отслеживания расходов',
        is_active: true
      });

      await bot.sendMessage(chatId, 
        `✅ Проект "Личные расходы" создан!\n\n✨ Теперь можете добавлять расходы.`
      );
    } else {
      // For additional projects (PRO only), check if user has existing Google Sheets
      if (userData.is_premium) {
        const projectsWithSheets = userProjects.filter(p => p.google_sheet_id);
        
        if (projectsWithSheets.length > 0) {
          // User has existing Google Sheets - offer choice
          await bot.sendMessage(chatId, 
            '📋 Создание нового проекта\n\n' +
            '📊 У вас уже есть подключенные Google таблицы. Выберите опцию:\n\n' +
            '💡 **Новый лист** - создаст лист в существующей таблице\n' +
            '📄 **Отдельная таблица** - создаст новую Google таблицу для проекта',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '📄 Новый лист в таблице', callback_data: 'create_project_existing_sheet' },
                    { text: '📊 Отдельная таблица', callback_data: 'create_project_new_sheet' }
                  ],
                  [
                    { text: '❌ Отмена', callback_data: 'cancel_project_creation' }
                  ]
                ]
              }
            }
          );
        } else {
          // No existing sheets - just ask for name
          stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_NAME, {});
          
          await bot.sendMessage(chatId, 
            '📋 Создание нового проекта\n\nОтправьте название проекта:\n\n📝 Пример: "Отпуск в Турции" или "Рабочие расходы"'
          );
        }
      } else {
        await bot.sendMessage(chatId, 
          '💎 Создание дополнительных проектов доступно только в PRO плане!',
          { reply_markup: getUpgradeKeyboard() }
        );
      }
    }
  } catch (error) {
    logger.error('Create project error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка создания проекта. Попробуйте позже.');
  }
}

async function handleUpgradeAction(chatId, messageId, data) {
  const action = data.split(':')[1];

  switch (action) {
    case 'pro_month':
      await createInvoice(chatId, messageId, {
        title: '💎 Expense Tracker PRO (1 месяц)',
        description: '🚀 Получите неограниченные проекты, 20 AI вопросов/день, командную работу и кастомные категории на 1 месяц!',
        payload: 'expense_tracker_pro_1month',
        amount: 250,
        period: '1 месяц',
        price: '$5'
      });
      break;
      
    case 'pro_6months':
      await createInvoice(chatId, messageId, {
        title: '💎 Expense Tracker PRO (6 месяцев)',
        description: '🚀 Получите неограниченные проекты, 20 AI вопросов/день, командную работу и кастомные категории на 6 месяцев! Экономия $6!',
        payload: 'expense_tracker_pro_6months',
        amount: 1200,
        period: '6 месяцев',
        price: '$24 (экономия $6)'
      });
      break;
      
    case 'pro_year':
      await createInvoice(chatId, messageId, {
        title: '💎 Expense Tracker PRO (1 год)',
        description: '🚀 Получите неограниченные проекты, 20 AI вопросов/день, командную работу и кастомные категории на целый год! Экономия $20!',
        payload: 'expense_tracker_pro_1year',
        amount: 2000,
        period: '1 год',
        price: '$40 (экономия $20)'
      });
      break;
      
    case 'compare':
      const compareText = `📊 Сравнение планов:

🆓 FREE:
✅ 1 проект
✅ 50 записей/месяц
✅ 5 AI вопросов/день
✅ 1 синхронизация/день
✅ 9 базовых категорий
❌ Командная работа
❌ Кастомные категории

💎 PRO ($7/месяц):
✅ Неограниченные проекты
✅ Неограниченные записи
✅ 20 AI вопросов/день
✅ 10 синхронизаций/день
✅ Командная работа
✅ Кастомные категории
✅ Приоритетная поддержка`;

      await bot.editMessageText(compareText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '💎 Купить PRO', callback_data: 'upgrade:pro' }
          ]]
        }
      });
      break;
      
    case 'faq':
      const faqText = `❓ Частые вопросы PRO:

Q: Как отменить подписку?
A: Напишите @support_bot

Q: Есть ли бесплатный пробный период?
A: Да, 7 дней бесплатно при первом платеже

Q: Сохранятся ли данные при отмене?
A: Да, все данные останутся, но с ограничениями FREE плана

Q: Можно ли оплатить картой РФ?
A: Да, поддерживаются все основные платежные системы

Другие вопросы: @support_bot`;

      await bot.editMessageText(faqText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '💎 Купить PRO', callback_data: 'upgrade:pro' }
          ]]
        }
      });
      break;
  }
}


// Settings handlers
async function handleSettingsAction(chatId, messageId, data, user) {
  const bot = getBot();
  const action = data.split(':')[1];
  
  try {
    switch (action) {
      case 'currency':
        const currencyKeyboard = {
          inline_keyboard: [
            [
              { text: '🇷🇺 Рубль (RUB)', callback_data: 'change_currency_RUB' },
              { text: '🇺🇸 Доллар (USD)', callback_data: 'change_currency_USD' }
            ],
            [
              { text: '🇪🇺 Евро (EUR)', callback_data: 'change_currency_EUR' },
              { text: '🇬🇧 Фунт (GBP)', callback_data: 'change_currency_GBP' }
            ],
            [
              { text: '🇰🇿 Тенге (KZT)', callback_data: 'change_currency_KZT' },
              { text: '🇺🇦 Гривна (UAH)', callback_data: 'change_currency_UAH' }
            ],
            [
              { text: '← Назад', callback_data: 'back_to_settings' }
            ]
          ]
        };
        
        await bot.editMessageText(
          `💱 Смена валюты по умолчанию\n\nТекущая валюта: ${user.primary_currency || 'USD'}\n\nВыберите новую валюту:`, 
          { chat_id: chatId, message_id: messageId, reply_markup: currencyKeyboard }
        );
        break;
        
      case 'export':
        await bot.editMessageText('📊 Экспорт данных\n\nВыберите формат экспорта:', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getExportFormatKeyboard()
        });
        break;
        
      case 'categories':
        if (!user.is_premium) {
          await bot.editMessageText('💎 Управление категориями доступно только в PRO плане!', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: getUpgradeKeyboard()
          });
        } else {
          // Show user's custom categories
          try {
            const categories = await customCategoryService.findByUserId(user.id);
            
            let message = '📂 Ваши кастомные категории:\n\n';
            if (categories.length === 0) {
              message += '❌ У вас пока нет кастомных категорий.\n\n💡 Создайте их при добавлении расходов через кнопку "➕ Своя категория"';
            } else {
              categories.forEach((cat, index) => {
                message += `${index + 1}. ${cat.emoji} ${cat.name}\n`;
              });
              message += `\n📊 Всего: ${categories.length}/50`;
            }
            
            await bot.editMessageText(message, {
              chat_id: chatId,
              message_id: messageId
            });
          } catch (error) {
            logger.error('Error loading categories:', error);
            await bot.editMessageText('❌ Ошибка загрузки категорий.', {
              chat_id: chatId,
              message_id: messageId
            });
          }
        }
        break;
        
      case 'main':
        await bot.editMessageText('⚙️ Настройки', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getSettingsKeyboard(user.is_premium)
        });
        break;
        
      case 'clear_data':
        await handleClearDataConfirmation(chatId, messageId, user);
        break;
    }
  } catch (error) {
    logger.error('Settings action error:', error);
    await bot.editMessageText('❌ Ошибка настроек.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Project switching
async function handleSwitchProject(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];
  
  try {
    // Deactivate all user's projects
    const projects = await projectService.findByUserId(user.id);
    for (const project of projects) {
      if (project.is_active) {
        await projectService.update(project.id, { is_active: false });
      }
    }
    
    // Activate selected project
    const selectedProject = await projectService.update(projectId, { is_active: true });
    
    await bot.editMessageText(`✅ Переключились на проект "${selectedProject.name}"!\n\nТеперь все новые расходы будут сохраняться в этот проект.`, {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (error) {
    logger.error('Switch project error:', error);
    await bot.editMessageText('❌ Ошибка переключения проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Custom category (PRO feature)
async function handleCustomCategory(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Кастомные категории доступны только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getUpgradeKeyboard()
    });
    return;
  }
  
  // Check limit for FREE vs PRO
  const categoryCount = await customCategoryService.getCountByUserId(user.id);
  const maxCategories = user.is_premium ? 50 : 10; // PRO can have 50, FREE would be 10 (but FREE can't create)
  
  if (categoryCount >= maxCategories) {
    await bot.editMessageText(`📂 Достигнут лимит категорий (${maxCategories})\n\nУдалите старые категории или обновитесь до более высокого плана.`, {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }
  
  // Set state to wait for category name input
  stateManager.setState(chatId, STATE_TYPES.WAITING_CUSTOM_CATEGORY, { 
    tempId,
    messageId 
  });
  
  await bot.editMessageText('➕ Создание кастомной категории\n\nОтправьте название категории с эмодзи:\n\n📝 Пример: "🎮 Игры" или "🏥 Медицина"\n\n💡 Формат: эмодзи + пробел + название', {
    chat_id: chatId,
    message_id: messageId
  });
}

// Custom amount input
async function handleCustomAmount(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  
  // Set state to wait for custom amount input
  stateManager.setState(chatId, STATE_TYPES.WAITING_CUSTOM_AMOUNT, { 
    tempId,
    messageId 
  });
  
  await bot.editMessageText('💰 Введите сумму:\n\n📝 Примеры: 250, 1500.50, 50', {
    chat_id: chatId,
    message_id: messageId
  });
}

// Helper function to create Telegram Stars invoice
async function createInvoice(chatId, messageId, options) {
  const bot = getBot();
  
  try {
    const invoice = {
      title: options.title,
      description: options.description,
      payload: options.payload,
      provider_token: '', // Empty for Telegram Stars
      currency: 'XTR', // Telegram Stars currency
      prices: [{ label: `PRO план (${options.period})`, amount: options.amount }],
      photo_url: undefined,
      photo_size: undefined,
      photo_width: undefined,
      photo_height: undefined,
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false,
      send_phone_number_to_provider: false,
      send_email_to_provider: false,
      is_flexible: false
    };

    await bot.sendInvoice(chatId, invoice);
    
    await bot.editMessageText(
      `💎 Счет на оплату отправлен!\n\n⭐ Стоимость: ${options.amount} Telegram Stars\n💰 ${options.price}\n📅 Период: ${options.period}\n\n✨ После оплаты PRO активируется автоматически!`,
      { chat_id: chatId, message_id: messageId }
    );
  } catch (error) {
    logger.error('Invoice creation error:', error);
    await bot.editMessageText(
      `💎 Оплата PRO плана\n\n⭐ Стоимость: ${options.amount} Telegram Stars (${options.price})\n📅 Период: ${options.period}\n\n🚧 Временно недоступно. Используйте команду /devpro для тестирования PRO функций.\n\nОбратитесь в поддержку: @support_bot`,
      { chat_id: chatId, message_id: messageId }
    );
  }
}

async function handleSetCurrency(chatId, messageId, data, user) {
  const bot = getBot();
  
  try {
    const currency = data.replace('set_currency_', '');
    
    // Update user's primary currency
    await userService.update(user.id, { primary_currency: currency });
    
    const currencyNames = {
      'RUB': 'Рубль',
      'USD': 'Доллар',
      'EUR': 'Евро', 
      'GBP': 'Фунт',
      'KZT': 'Тенге',
      'UAH': 'Гривна'
    };
    
    await bot.editMessageText(
      `✅ Валюта установлена: ${currencyNames[currency]} (${currency})\n\n✨ Создаю ваш первый проект...`,
      { chat_id: chatId, message_id: messageId }
    );
    
    // Create first project automatically
    const project = await projectService.create({
      owner_id: user.id,
      name: 'Личные расходы',
      description: 'Проект для отслеживания расходов',
      is_active: true
    });

    const { getMainMenuKeyboard } = require('../keyboards/reply');
    await bot.sendMessage(chatId, 
      `✅ Проект "Личные расходы" создан!

✨ Теперь попробуйте добавить трату:
• Голосом: "Потратил 200 рублей на кофе"
• Текстом: "кофе 200р"

📊 Для подключения Google таблицы используйте: /connect [ID_таблицы]`,
      { reply_markup: getMainMenuKeyboard() }
    );
    
  } catch (error) {
    logger.error('Set currency error:', error);
    await bot.editMessageText(
      '❌ Ошибка при установке валюты. Попробуйте еще раз.',
      { chat_id: chatId, message_id: messageId }
    );
  }
}

async function handleChangeCurrency(chatId, messageId, data, user) {
  const bot = getBot();
  
  try {
    const currency = data.replace('change_currency_', '');
    
    // Update user's primary currency
    await userService.update(user.id, { primary_currency: currency });
    
    const currencyNames = {
      'RUB': 'Рубль',
      'USD': 'Доллар',
      'EUR': 'Евро', 
      'GBP': 'Фунт',
      'KZT': 'Тенге',
      'UAH': 'Гривна'
    };
    
    await bot.editMessageText(
      `✅ Валюта изменена на: ${currencyNames[currency]} (${currency})\n\nТеперь новые расходы будут использовать эту валюту по умолчанию.`,
      { chat_id: chatId, message_id: messageId, reply_markup: { 
        inline_keyboard: [[{ text: '← Назад к настройкам', callback_data: 'back_to_settings' }]]
      }}
    );
    
  } catch (error) {
    logger.error('Change currency error:', error);
    await bot.editMessageText(
      '❌ Ошибка при смене валюты. Попробуйте еще раз.',
      { chat_id: chatId, message_id: messageId }
    );
  }
}

async function handleBackToSettings(chatId, messageId, user) {
  const bot = getBot();
  const { getSettingsKeyboard } = require('../keyboards/inline');
  
  try {
    const settingsText = `⚙️ Настройки

👤 Пользователь: ${user.first_name} ${user.username ? `(@${user.username})` : ''}
💱 Основная валюта: ${user.primary_currency || 'USD'}
🌐 Язык: ${user.language_code === 'ru' ? 'Русский' : 'English'}
💎 План: ${user.is_premium ? 'PRO' : 'FREE'}

${user.is_premium ? '' : '💎 Обновитесь до PRO для дополнительных возможностей!'}`;

    await bot.editMessageText(settingsText, {
      chat_id: chatId, 
      message_id: messageId,
      reply_markup: getSettingsKeyboard()
    });
  } catch (error) {
    logger.error('Back to settings error:', error);
  }
}

// Custom category management functions
async function handleAddCustomCategory(chatId, messageId, user) {
  const bot = getBot();
  const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Кастомные категории доступны только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'manage_categories' }]] }
    });
    return;
  }

  try {
    const categoryCount = await customCategoryService.getCountByUserId(user.id);
    if (categoryCount >= 10) {
      await bot.editMessageText('❌ Достигнут лимит кастомных категорий (10/10)', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'manage_categories' }]] }
      });
      return;
    }

    stateManager.setState(chatId, STATE_TYPES.WAITING_CATEGORY_NAME, { messageId });
    
    await bot.editMessageText(`➕ Создание новой категории

📝 Отправьте название категории (максимум 50 символов).

💡 Примеры:
• Собака
• Ремонт дома  
• Фитнес

🎨 Эмодзи можно добавить на следующем шаге.`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'manage_categories' }]] }
    });
  } catch (error) {
    logger.error('Error in handleAddCustomCategory:', error);
    await bot.editMessageText('❌ Ошибка. Попробуйте позже.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleManageCategories(chatId, messageId, user) {
  const bot = getBot();
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Управление категориями доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'categories' }]] }
    });
    return;
  }

  try {
    const customCategories = await customCategoryService.findByUserId(user.id);
    
    if (customCategories.length === 0) {
      await bot.editMessageText(`📝 Управление категориями

У вас пока нет кастомных категорий.`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { 
          inline_keyboard: [
            [{ text: '➕ Добавить первую категорию', callback_data: 'add_custom_category' }],
            [{ text: '🔙 Назад', callback_data: 'categories' }]
          ]
        }
      });
      return;
    }

    let message = `📝 Управление категориями (${customCategories.length}/10)\n\nВыберите категорию для редактирования:`;
    
    const keyboard = customCategories.map(cat => ([
      { text: `${cat.emoji || '📁'} ${cat.name}`, callback_data: `edit_custom_category:${cat.id}` }
    ]));
    
    keyboard.push([{ text: '➕ Добавить новую', callback_data: 'add_custom_category' }]);
    keyboard.push([{ text: '🔙 Назад', callback_data: 'categories' }]);

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    logger.error('Error in handleManageCategories:', error);
    await bot.editMessageText('❌ Ошибка загрузки категорий.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleEditCustomCategory(chatId, messageId, data, user) {
  const bot = getBot();
  const categoryId = data.split(':')[1];
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Редактирование категорий доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'categories' }]] }
    });
    return;
  }
  
  try {
    const categories = await customCategoryService.findByUserId(user.id);
    const category = categories.find(cat => cat.id === categoryId);
    
    if (!category) {
      await bot.editMessageText('❌ Категория не найдена.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'manage_categories' }]] }
      });
      return;
    }

    const message = `✏️ Редактирование категории

${category.emoji || '📁'} **${category.name}**

Выберите действие:`;

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Изменить название', callback_data: `edit_cat_name:${categoryId}` }],
          [{ text: '🎨 Изменить эмодзи', callback_data: `edit_cat_emoji:${categoryId}` }],
          [{ text: '🗑️ Удалить', callback_data: `delete_category:${categoryId}` }],
          [{ text: '🔙 Назад', callback_data: 'manage_categories' }]
        ]
      }
    });
  } catch (error) {
    logger.error('Error in handleEditCategory:', error);
    await bot.editMessageText('❌ Ошибка загрузки категории.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleDeleteCategory(chatId, messageId, data, user) {
  const bot = getBot();
  const categoryId = data.split(':')[1];
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Удаление категорий доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'categories' }]] }
    });
    return;
  }
  
  try {
    const categories = await customCategoryService.findByUserId(user.id);
    const category = categories.find(cat => cat.id === categoryId);
    
    if (!category) {
      await bot.editMessageText('❌ Категория не найдена.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    await bot.editMessageText(`🗑️ Удаление категории

Вы уверены, что хотите удалить категорию "${category.emoji || '📁'} ${category.name}"?

⚠️ Это действие нельзя отменить!`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Да, удалить', callback_data: `confirm_delete_category:${categoryId}` }],
          [{ text: '❌ Отмена', callback_data: `edit_custom_category:${categoryId}` }]
        ]
      }
    });
  } catch (error) {
    logger.error('Error in handleDeleteCategory:', error);
    await bot.editMessageText('❌ Ошибка.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleConfirmDeleteCategory(chatId, messageId, data, user) {
  const bot = getBot();
  const categoryId = data.split(':')[1];
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Удаление категорий доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'categories' }]] }
    });
    return;
  }
  
  try {
    await customCategoryService.delete(categoryId);
    
    await bot.editMessageText('✅ Категория успешно удалена!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 К управлению категориями', callback_data: 'manage_categories' }]]
      }
    });
  } catch (error) {
    logger.error('Error deleting category:', error);
    await bot.editMessageText('❌ Ошибка удаления категории.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleEditCategoryName(chatId, messageId, data, user) {
  const bot = getBot();
  const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
  const categoryId = data.split(':')[1];
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Редактирование категорий доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'categories' }]] }
    });
    return;
  }
  
  try {
    const categories = await customCategoryService.findByUserId(user.id);
    const category = categories.find(cat => cat.id === categoryId);
    
    if (!category) {
      await bot.editMessageText('❌ Категория не найдена.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    stateManager.setState(chatId, STATE_TYPES.WAITING_CATEGORY_NAME_EDIT, { 
      messageId,
      categoryId,
      currentName: category.name
    });
    
    await bot.editMessageText(`✏️ Изменение названия категории

Текущее название: **${category.name}**

📝 Отправьте новое название категории (максимум 50 символов):`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { 
        inline_keyboard: [[{ text: '❌ Отмена', callback_data: `edit_category:${categoryId}` }]]
      }
    });
  } catch (error) {
    logger.error('Error in handleEditCategoryName:', error);
    await bot.editMessageText('❌ Ошибка.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleEditCategoryEmoji(chatId, messageId, data, user) {
  const bot = getBot();
  const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
  const categoryId = data.split(':')[1];
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Редактирование категорий доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'categories' }]] }
    });
    return;
  }
  
  try {
    const categories = await customCategoryService.findByUserId(user.id);
    const category = categories.find(cat => cat.id === categoryId);
    
    if (!category) {
      await bot.editMessageText('❌ Категория не найдена.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    stateManager.setState(chatId, STATE_TYPES.WAITING_CATEGORY_EMOJI_EDIT, { 
      messageId,
      categoryId,
      currentEmoji: category.emoji
    });
    
    await bot.editMessageText(`🎨 Изменение эмодзи категории

Категория: **${category.name}**
Текущий эмодзи: ${category.emoji || '📁 (по умолчанию)'}

🎯 Отправьте новый эмодзи (один символ):

💡 Примеры: 🐕 🏠 🚗 🍔 💊 🎬 ✈️`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { 
        inline_keyboard: [
          [{ text: '🗑️ Убрать эмодзи', callback_data: `remove_emoji:${categoryId}` }],
          [{ text: '❌ Отмена', callback_data: `edit_custom_category:${categoryId}` }]
        ]
      }
    });
  } catch (error) {
    logger.error('Error in handleEditCategoryEmoji:', error);
    await bot.editMessageText('❌ Ошибка.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleRemoveEmoji(chatId, messageId, data, user) {
  const bot = getBot();
  const categoryId = data.split(':')[1];
  
  if (!user.is_premium) {
    await bot.editMessageText('💎 Редактирование категорий доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'categories' }]] }
    });
    return;
  }
  
  try {
    await customCategoryService.update(categoryId, { emoji: null });
    
    await bot.editMessageText('✅ Эмодзи удален!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Назад к категории', callback_data: `edit_custom_category:${categoryId}` }]]
      }
    });
  } catch (error) {
    logger.error('Error removing emoji:', error);
    await bot.editMessageText('❌ Ошибка удаления эмодзи.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleSkipEmoji(chatId, messageId, user) {
  const bot = getBot();
  const { stateManager } = require('../../utils/stateManager');
  
  try {
    const state = stateManager.getState(chatId);
    if (!state || !state.data || !state.data.categoryName) {
      await bot.editMessageText('❌ Данные сессии устарели.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    const { categoryName } = state.data;
    
    // Create category without emoji
    const category = await customCategoryService.create({
      user_id: user.id,
      name: categoryName,
      emoji: null
    });

    await bot.editMessageText(`✅ Категория создана!

📁 **${categoryName}**

Теперь эта категория доступна при записи расходов.`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 К управлению категориями', callback_data: 'manage_categories' }]]
      }
    });

    stateManager.clearState(chatId);
  } catch (error) {
    logger.error('Error creating category without emoji:', error);
    await bot.editMessageText('❌ Ошибка создания категории.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleCategoriesCallback(chatId, messageId, user) {
  const { handleCategories } = require('./commands');
  const bot = getBot();
  
  try {
    // Create a fake message object for handleCategories function
    const fakeMsg = {
      chat: { id: chatId },
      user: user
    };
    
    // Delete the callback message first
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (e) {
      // Ignore if message can't be deleted
    }
    
    // Call the categories command handler
    await handleCategories(fakeMsg);
  } catch (error) {
    logger.error('Error handling categories callback:', error);
    await bot.editMessageText('❌ Ошибка загрузки категорий.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Export handlers
async function handleExportFormat(chatId, messageId, data, user) {
  const bot = getBot();
  const format = data.split(':')[1]; // xlsx or csv
  
  await bot.editMessageText('📅 Выберите период для экспорта:', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: getExportPeriodKeyboard(format)
  });
}

async function handleExportPeriod(chatId, messageId, data, user) {
  const bot = getBot();
  const parts = data.split(':');
  const format = parts[1]; // xlsx or csv
  const period = parts[2]; // today, week, month, custom
  
  if (period === 'custom') {
    // Set state for custom date range input
    stateManager.setState(chatId, 'WAITING_CUSTOM_EXPORT_DATES', { 
      format,
      messageId 
    });
    
    await bot.editMessageText('📅 Укажите период экспорта:\n\n📝 Формат: ДД.ММ.ГГГГ - ДД.ММ.ГГГГ\n\n✅ Пример: 01.12.2024 - 31.12.2024', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }
  
  try {
    // Calculate date range
    const { startDate, endDate } = getDateRange(period);
    
    // Generate export
    await generateExport(chatId, messageId, user, format, startDate, endDate);
    
  } catch (error) {
    logger.error('Export error:', error);
    await bot.editMessageText('❌ Ошибка создания экспорта. Попробуйте позже.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

function getDateRange(period) {
  const today = new Date();
  let startDate, endDate;
  
  switch (period) {
    case 'today':
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      break;
    case 'week':
      startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = today;
      break;
    case 'month':
      startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      endDate = today;
      break;
    default:
      throw new Error('Unknown period');
  }
  
  return { startDate, endDate };
}

async function generateExport(chatId, messageId, user, format, startDate, endDate) {
  const bot = getBot();
  
  // Show processing message
  await bot.editMessageText('⏳ Генерируем экспорт...', {
    chat_id: chatId,
    message_id: messageId
  });
  
  try {
    // Get user's expenses for the period
    const expenses = await expenseService.getExpensesForExport(user.id, startDate, endDate);
    
    if (expenses.length === 0) {
      await bot.editMessageText('📊 Нет данных за выбранный период для экспорта.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
    
    let fileContent, fileName, mimeType;
    
    if (format === 'csv') {
      // Generate CSV
      const csvData = generateCSV(expenses);
      fileContent = Buffer.from(csvData, 'utf-8');
      fileName = `expenses_${formatDate(startDate)}_${formatDate(endDate)}.csv`;
      mimeType = 'text/csv';
    } else {
      // Generate Excel - for now, use CSV format as placeholder
      const csvData = generateCSV(expenses);
      fileContent = Buffer.from(csvData, 'utf-8');
      fileName = `expenses_${formatDate(startDate)}_${formatDate(endDate)}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    
    // Send file
    await bot.sendDocument(chatId, fileContent, {
      filename: fileName,
      contentType: mimeType
    });
    
    // Update message
    await bot.editMessageText(`✅ Экспорт готов!\n\n📊 Экспортировано: ${expenses.length} записей\n📅 Период: ${formatDate(startDate)} - ${formatDate(endDate)}`, {
      chat_id: chatId,
      message_id: messageId
    });
    
  } catch (error) {
    logger.error('Export generation error:', error);
    await bot.editMessageText('❌ Ошибка генерации файла экспорта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

function generateCSV(expenses) {
  const headers = ['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Проект'];
  const rows = [headers];
  
  expenses.forEach(expense => {
    rows.push([
      expense.expense_date,
      expense.description,
      expense.amount,
      expense.currency,
      expense.category,
      expense.project_name || 'Без проекта'
    ]);
  });
  
  return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
}

function formatDate(date) {
  return date.toISOString().split('T')[0].replace(/-/g, '.');
}

// Clear data handlers
async function handleClearDataConfirmation(chatId, messageId, user) {
  const bot = getBot();
  
  const warningText = `⚠️ ВНИМАНИЕ! Полная очистка данных
  
🗑️ Будут УДАЛЕНЫ:
• Все расходы
• Все проекты  
• Все кастомные категории
• История и статистика

❌ ВОССТАНОВИТЬ данные будет НЕВОЗМОЖНО!

Вы уверены, что хотите продолжить?`;

  await bot.editMessageText(warningText, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '❌ ДА, УДАЛИТЬ ВСЁ', callback_data: 'confirm_clear_data' }
        ],
        [
          { text: '✅ Отмена', callback_data: 'cancel_clear_data' }
        ]
      ]
    }
  });
}

async function handleConfirmClearData(chatId, messageId, user) {
  const bot = getBot();
  
  try {
    // Show processing message
    await bot.editMessageText('🗑️ Удаляем данные...', {
      chat_id: chatId,
      message_id: messageId
    });
    
    // Delete all user data
    await clearAllUserData(user.id);
    
    await bot.editMessageText(`✅ Все данные удалены!
    
📊 Ваш аккаунт очищен:
• Удалены все расходы
• Удалены все проекты
• Удалены кастомные категории
• Очищена история

💡 Можете начать заново с создания проекта.`, {
      chat_id: chatId,
      message_id: messageId
    });
    
  } catch (error) {
    logger.error('Error clearing user data:', error);
    await bot.editMessageText('❌ Ошибка удаления данных. Попробуйте позже.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleCancelClearData(chatId, messageId, user) {
  const bot = getBot();
  
  await bot.editMessageText('⚙️ Настройки', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: getSettingsKeyboard(user.is_premium)
  });
}

async function clearAllUserData(userId) {
  // Delete in order due to foreign key constraints
  
  // 1. Delete expenses first
  await supabase
    .from('expenses')
    .delete()
    .eq('user_id', userId);
  
  // 2. Delete custom categories
  await supabase
    .from('custom_categories')
    .delete()
    .eq('user_id', userId);
  
  // 3. Delete projects
  await supabase
    .from('projects')
    .delete()
    .eq('owner_id', userId);
  
  // 4. Reset user settings (keep user record but reset data)
  await supabase
    .from('users')
    .update({
      primary_currency: 'RUB', // Reset to default
      google_sheets_url: null,
      settings: null
    })
    .eq('id', userId);
    
  logger.info(`All data cleared for user ${userId}`);
}

// Income handlers

async function handleSaveIncome(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  const incomeData = tempIncomes.get(tempId);

  if (!incomeData) {
    await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    // Save income to database
    const savedIncome = await incomeService.create(incomeData);

    // Try to add to Google Sheets (don't fail if this fails)
    let sheetsSuccess = false;
    try {
      await googleSheetsService.addIncomeToSheet(savedIncome, incomeData.project_id);
      sheetsSuccess = true;
    } catch (sheetsError) {
      logger.warn('Google Sheets sync failed but income saved:', sheetsError.message);
    }

    // Get project name for confirmation
    const project = await projectService.findById(incomeData.project_id);

    const successText = `✅ Доход сохранён!

💰 ${incomeData.description}: +${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📋 Проект: ${project.name}
${sheetsSuccess ? '📊 Добавлено в Google Sheets' : '📊 Синхронизация с Google Sheets: ошибка (данные сохранены)'}

📈 Посмотреть статистику: /stats`;

    await bot.editMessageText(successText, {
      chat_id: chatId,
      message_id: messageId
    });

    // Clean up temp data
    tempIncomes.delete(tempId);

  } catch (error) {
    logger.error('Save income error:', error);
    await bot.editMessageText('❌ Ошибка при сохранении дохода. Попробуйте позже.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleCancelIncome(chatId, messageId, data) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  
  // Clean up temp data
  tempIncomes.delete(tempId);

  await bot.editMessageText('❌ Добавление дохода отменено.', {
    chat_id: chatId,
    message_id: messageId
  });
}

async function handleEditIncomeCategory(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  const incomeData = tempIncomes.get(tempId);

  if (!incomeData) {
    await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  await bot.editMessageText('📂 Выберите категорию дохода:', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: getIncomeCategorySelectionKeyboard(tempId)
  });
}

async function handleEditIncomeAmount(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  const incomeData = tempIncomes.get(tempId);

  if (!incomeData) {
    await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  await bot.editMessageText('💰 Введите новую сумму дохода:', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Назад', callback_data: `back_to_income_confirmation:${tempId}` }]]
    }
  });

  stateManager.setState(chatId, STATE_TYPES.EDITING_INCOME_AMOUNT, { tempId });
}

async function handleEditIncomeDescription(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  const incomeData = tempIncomes.get(tempId);

  if (!incomeData) {
    await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  await bot.editMessageText('📝 Введите новое описание дохода:', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [[{ text: '🔙 Назад', callback_data: `back_to_income_confirmation:${tempId}` }]]
    }
  });

  stateManager.setState(chatId, STATE_TYPES.EDITING_INCOME_DESCRIPTION, { tempId });
}

async function handleEditIncomeProject(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  const incomeData = tempIncomes.get(tempId);

  if (!incomeData) {
    await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  if (!user.is_premium) {
    await bot.editMessageText('💎 Изменение проекта доступно только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Назад', callback_data: `back_to_income_confirmation:${tempId}` }]]
      }
    });
    return;
  }

  try {
    const projects = await projectService.findByUserId(user.id);
    if (projects.length === 0) {
      await bot.editMessageText('📋 У вас нет проектов. Создайте проект в настройках.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Назад', callback_data: `back_to_income_confirmation:${tempId}` }]]
        }
      });
      return;
    }

    await bot.editMessageText('📋 Выберите проект для дохода:', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getIncomeProjectSelectionKeyboard(tempId, projects)
    });

  } catch (error) {
    logger.error('Error loading projects for income:', error);
    await bot.editMessageText('❌ Ошибка при загрузке проектов.', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Назад', callback_data: `back_to_income_confirmation:${tempId}` }]]
      }
    });
  }
}

async function handleSetIncomeCategory(chatId, messageId, data, user) {
  const bot = getBot();
  
  try {
    const [, tempId, categoryIndexStr] = data.split(':');
    const categoryIndex = parseInt(categoryIndexStr);
    const incomeData = tempIncomes.get(tempId);

    if (!incomeData) {
      await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Get category by index from INCOME_CATEGORIES
    const { INCOME_CATEGORIES } = require('../../config/constants');
    const selectedCategory = INCOME_CATEGORIES[categoryIndex];
    
    if (!selectedCategory) {
      throw new Error('Invalid category index');
    }

    // Extract category name without emoji
    const categoryName = selectedCategory.split(' ').slice(1).join(' ');
    incomeData.category = categoryName;
    tempIncomes.set(tempId, incomeData);

    // Show updated confirmation
    const project = await projectService.findById(incomeData.project_id);
    
    const confirmationText = `💰 Подтвердите доход:

📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

    await bot.editMessageText(confirmationText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getIncomeConfirmationKeyboard(tempId, user.is_premium)
    });
  } catch (error) {
    logger.error('Error setting income category:', error);
    await bot.editMessageText('❌ Ошибка выбора категории.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleSetIncomeProject(chatId, messageId, data, user) {
  const bot = getBot();
  const [, tempId, projectIndexStr] = data.split(':');
  const projectIndex = parseInt(projectIndexStr);
  const incomeData = tempIncomes.get(tempId);

  if (!incomeData) {
    await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    // Get all user's projects to find by index
    const projects = await projectService.findByUserId(user.id);
    const project = projects[projectIndex];
    
    if (!project) {
      await bot.editMessageText('❌ Проект не найден.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    incomeData.project_id = project.id;
    tempIncomes.set(tempId, incomeData);

    // Show updated confirmation
    const confirmationText = `💰 Подтвердите доход:

📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

    await bot.editMessageText(confirmationText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getIncomeConfirmationKeyboard(tempId, user.is_premium)
    });

  } catch (error) {
    logger.error('Error setting income project:', error);
    await bot.editMessageText('❌ Ошибка при выборе проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleBackToIncomeConfirmation(chatId, messageId, data, user) {
  const bot = getBot();
  const tempId = data.split(':')[1];
  const incomeData = tempIncomes.get(tempId);

  if (!incomeData) {
    await bot.editMessageText('❌ Данные дохода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    const project = await projectService.findById(incomeData.project_id);
    
    const confirmationText = `💰 Подтвердите доход:

📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

    await bot.editMessageText(confirmationText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getIncomeConfirmationKeyboard(tempId, user.is_premium)
    });

  } catch (error) {
    logger.error('Error showing income confirmation:', error);
    await bot.editMessageText('❌ Ошибка при отображении подтверждения.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Project management handlers
async function handleDeleteProject(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];
  
  try {
    // Get project info first
    const project = await projectService.findById(projectId);
    if (!project) {
      await bot.editMessageText('❌ Проект не найден.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Check ownership
    if (project.owner_id !== user.id) {
      await bot.editMessageText('❌ Вы можете удалять только свои проекты.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Check if it's the last project
    const userProjects = await projectService.findByUserId(user.id);
    if (userProjects.length <= 1) {
      await bot.editMessageText('❌ Нельзя удалить единственный проект. Создайте другой проект сначала.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Show confirmation
    await bot.editMessageText(
      `⚠️ Удаление проекта "${project.name}"\n\n` +
      `❗ ВНИМАНИЕ: Будут удалены:\n` +
      `• Все расходы и доходы проекта\n` +
      `• Связь с Google таблицей\n\n` +
      `Это действие нельзя отменить!`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🗑️ Да, удалить', callback_data: `confirm_delete_project:${projectId}` },
              { text: '❌ Отмена', callback_data: 'back_to_projects' }
            ]
          ]
        }
      }
    );
  } catch (error) {
    logger.error('Delete project error:', error);
    await bot.editMessageText('❌ Ошибка при удалении проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleConfirmDeleteProject(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];
  
  try {
    const project = await projectService.findById(projectId);
    if (!project) {
      await bot.editMessageText('❌ Проект не найден.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Check ownership
    if (project.owner_id !== user.id) {
      await bot.editMessageText('❌ Недостаточно прав.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Delete the project (this will cascade delete expenses and incomes)
    await projectService.delete(projectId);

    // If deleted project was active, activate another one
    if (project.is_active) {
      const remainingProjects = await projectService.findByUserId(user.id);
      if (remainingProjects.length > 0) {
        await projectService.update(remainingProjects[0].id, { is_active: true });
      }
    }

    await bot.editMessageText(
      `✅ Проект "${project.name}" успешно удален!\n\n` +
      `📊 Все связанные данные также удалены.`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 К управлению проектами', callback_data: 'back_to_projects' }
          ]]
        }
      }
    );
  } catch (error) {
    logger.error('Confirm delete project error:', error);
    await bot.editMessageText('❌ Ошибка при удалении проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleEditProjectName(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];
  
  try {
    const project = await projectService.findById(projectId);
    if (!project) {
      await bot.editMessageText('❌ Проект не найден.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Check ownership
    if (project.owner_id !== user.id) {
      await bot.editMessageText('❌ Вы можете редактировать только свои проекты.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Set state for name editing
    stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_NAME_EDIT, { 
      projectId,
      messageId,
      currentName: project.name 
    });

    await bot.editMessageText(
      `✏️ Редактирование проекта\n\n` +
      `Текущее название: "${project.name}"\n\n` +
      `📝 Отправьте новое название проекта:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Отмена', callback_data: 'back_to_projects' }
          ]]
        }
      }
    );
  } catch (error) {
    logger.error('Edit project name error:', error);
    await bot.editMessageText('❌ Ошибка при редактировании проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleBackToProjects(chatId, messageId, user) {
  const { handleProjects } = require('./commands');
  const bot = getBot();
  
  try {
    // Create a fake message object for handleProjects function
    const fakeMsg = {
      chat: { id: chatId },
      user: user
    };
    
    // Delete the callback message first
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (e) {
      // Ignore if message can't be deleted
    }
    
    // Call the projects command handler
    await handleProjects(fakeMsg);
  } catch (error) {
    logger.error('Error handling back to projects:', error);
    await bot.editMessageText('❌ Ошибка загрузки проектов.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Project creation handlers for different Google Sheets options
async function handleCreateProjectWithExistingSheet(chatId, messageId, user) {
  const bot = getBot();
  
  try {
    stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_NAME_EXISTING_SHEET, { messageId });
    
    await bot.editMessageText(
      '📋 Создание проекта с новым листом\n\n' +
      '📊 Проект будет создан как новый лист в существующей Google таблице.\n\n' +
      '📝 Отправьте название проекта:\n\n' +
      '💡 Пример: "Отпуск в Турции" или "Рабочие расходы"',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Отмена', callback_data: 'cancel_project_creation' }
          ]]
        }
      }
    );
  } catch (error) {
    logger.error('Error handling create project with existing sheet:', error);
    await bot.editMessageText('❌ Ошибка создания проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleCreateProjectWithNewSheet(chatId, messageId, user) {
  const bot = getBot();
  
  try {
    stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_NAME_NEW_SHEET, { messageId });
    
    await bot.editMessageText(
      '📋 Создание проекта с отдельной таблицей\n\n' +
      '📊 Для проекта будет создана отдельная Google таблица.\n\n' +
      '📝 Отправьте название проекта:\n\n' +
      '💡 Пример: "Отпуск в Турции" или "Рабочие расходы"',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Отмена', callback_data: 'cancel_project_creation' }
          ]]
        }
      }
    );
  } catch (error) {
    logger.error('Error handling create project with new sheet:', error);
    await bot.editMessageText('❌ Ошибка создания проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleCancelProjectCreation(chatId, messageId, user) {
  const bot = getBot();
  
  try {
    stateManager.clearState(chatId);
    
    await bot.editMessageText(
      '❌ Создание проекта отменено.',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 К управлению проектами', callback_data: 'back_to_projects' }
          ]]
        }
      }
    );
  } catch (error) {
    logger.error('Error cancelling project creation:', error);
    await bot.editMessageText('❌ Ошибка отмены создания проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

module.exports = {
  handleCallback
};