const { userService, projectService, projectMemberService, expenseService, customCategoryService, incomeService, supabase } = require('../../services/supabase');
const googleSheetsService = require('../../services/googleSheets');
// Import temp storage from messages handler
const messagesHandler = require('./messages');
// Access temp storage
const { tempExpenses, tempIncomes } = messagesHandler;
const {
  getCategorySelectionKeyboard,
  getIncomeCategorySelectionKeyboard,
  getIncomeProjectSelectionKeyboard,
  getIncomeConfirmationKeyboard,
  getAmountSelectionKeyboard,
  getExpenseConfirmationKeyboard,
  getProjectSelectionKeyboardForExpense,
  getProjectSelectionForTransactionKeyboard,
  getUpgradeKeyboard,
  getExportFormatKeyboard,
  getExportPeriodKeyboard,
  getSettingsKeyboard,
  getCurrencySelectionKeyboard
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

  // Debug logging
  logger.info(`🔘 Callback received: ${data} from user ${user?.id}`);
  logger.info(`🔘 DEBUG: Starting callback processing for: ${data}`);

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
    } else if (data.startsWith('edit_currency:')) {
      await handleEditCurrency(chatId, messageId, data, user);
    } else if (data.startsWith('edit_income_currency:')) {
      await handleEditIncomeCurrency(chatId, messageId, data, user);
    } else if (data.startsWith('set_currency:')) {
      await handleSetTransactionCurrency(chatId, messageId, data, user);
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
    } else if (data === 'create_project_existing_sheet') {
      logger.info(`🔘 DEBUG: About to enter create_project_existing_sheet block`);
      logger.info(`🔘 MATCH: create_project_existing_sheet - about to execute`);
      logger.info(`🔘 User ${user.id} clicked: create_project_existing_sheet`);
      logger.info(`🔘 About to call handleCreateProjectWithExistingSheet with chatId=${chatId}, messageId=${messageId}`);
      try {
        await handleCreateProjectWithExistingSheet(chatId, messageId, user);
        logger.info(`🔘 handleCreateProjectWithExistingSheet completed successfully`);
      } catch (error) {
        logger.error(`🔘 Error in handleCreateProjectWithExistingSheet:`, error);
        logger.error(`🔘 Error stack:`, error.stack);
      }
    } else if (data === 'create_project_new_sheet') {
      logger.info(`🔘 MATCH: create_project_new_sheet - about to execute`);
      logger.info(`🔘 User ${user.id} clicked: create_project_new_sheet`);
      logger.info(`🔘 About to call handleCreateProjectWithNewSheet`);
      try {
        await handleCreateProjectWithNewSheet(chatId, messageId, user);
        logger.info(`🔘 handleCreateProjectWithNewSheet completed`);
      } catch (error) {
        logger.error(`🔘 Error in handleCreateProjectWithNewSheet:`, error);
      }
    } else if (data === 'cancel_project_creation') {
      logger.info(`🔘 User ${user.id} clicked: cancel_project_creation`);
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
    } else if (data.startsWith('edit_cat_keywords:')) {
      await handleEditCategoryKeywords(chatId, messageId, data, user);
    } else if (data.startsWith('remove_emoji:')) {
      await handleRemoveEmoji(chatId, messageId, data, user);
    } else if (data === 'skip_emoji') {
      await handleSkipEmoji(chatId, messageId, user);
    } else if (data === 'categories') {
      await handleCategoriesCallback(chatId, messageId, user);
    } else if (data.startsWith('proj_sel:')) {
      await handleProjectSelectionForTransaction(callbackQuery, data);
    } else if (data.startsWith('cancel_trans:')) {
      await handleCancelTransaction(chatId, messageId, data);
    } else if (data.startsWith('export_format:')) {
      await handleExportFormat(chatId, messageId, data, user);
    } else if (data.startsWith('export_period:')) {
      await handleExportPeriod(chatId, messageId, data, user);
    } else if (data === 'confirm_clear_data') {
      await handleConfirmClearData(chatId, messageId, user);
    } else if (data === 'cancel_clear_data') {
      await handleCancelClearData(chatId, messageId, user);
    } else if (data.startsWith('sync_project:')) {
      await handleSyncProject(chatId, messageId, data, user);
    } else if (data === 'cancel_sync') {
      await handleCancelSync(chatId, messageId);
    } else if (data.startsWith('connect_sheet_to_project:')) {
      await handleConnectSheetToProject(chatId, messageId, data, user);
    } else if (data === 'cancel_connect_sheet') {
      await handleCancelConnectSheet(chatId, messageId);
    } else if (data.startsWith('select_project_for_connect:')) {
      await handleSelectProjectForConnect(chatId, messageId, data, user);
    } else if (data === 'cancel_connect') {
      await handleCancelConnect(chatId, messageId);
    } else if (data === 'noop') {
      // Pagination placeholder - answer callback query to remove loading state
      await bot.answerCallbackQuery(callbackQuery.id, { text: '' });
      return;
    } else if (data.startsWith('create_project')) {
      await handleCreateProject(chatId, user);
    } else if (data.startsWith('upgrade:')) {
      await handleUpgradeAction(chatId, messageId, data);
    } else if (data.startsWith('settings:')) {
      await handleSettingsAction(chatId, messageId, data, user);
    } else if (data.startsWith('switch_project:')) {
      await handleSwitchProject(chatId, messageId, data, user);
    } else if (data.startsWith('delete_project:')) {
      await handleDeleteProject(chatId, messageId, data, user);
    } else if (data.startsWith('manage_project:')) {
      await handleEditProject(chatId, messageId, data, user);
    } else if (data.startsWith('edit_project_name:')) {
      await handleEditProjectName(chatId, messageId, data, user);
    } else if (data.startsWith('edit_project_keywords:')) {
      await handleEditProjectKeywords(chatId, messageId, data, user);
    } else if (data.startsWith('confirm_delete_project:')) {
      await handleConfirmDeleteProject(chatId, messageId, data, user);
    } else if (data === 'back_to_projects') {
      await handleBackToProjects(chatId, messageId, user);
    } else if (data.startsWith('manage_team:')) {
      await handleManageTeam(chatId, messageId, data, user);
    } else if (data === 'make_collaborative') {
      await handleMakeCollaborative(chatId, messageId, user);
    } else if (data === 'invite_member') {
      await handleInviteMember(chatId, messageId, user);
    } else if (data === 'manage_members') {
      await handleManageMembers(chatId, messageId, user);
    } else if (data.startsWith('make_collab:')) {
      await handleMakeProjectCollaborative(chatId, messageId, data, user);
    } else if (data.startsWith('invite_to:')) {
      await handleInviteToProject(chatId, messageId, data, user);
    } else if (data.startsWith('show_members:')) {
      await handleShowMembers(chatId, messageId, data, user);
    } else if (data.startsWith('kick_member:')) {
      await handleKickMember(chatId, messageId, data, user);
    } else if (data === 'back_to_team') {
      await handleBackToTeam(chatId, messageId, user);
    } else {
      logger.warn('Unknown callback data:', data);
    }
    
    logger.info(`🔘 Callback handling completed for: ${data}`);
  } catch (error) {
    logger.error('Callback handling error:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
  }
}

async function handleSaveExpense(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  logger.info(`💾 handleSaveExpense called with data: ${data}, extracted tempId: ${tempId}`);
  logger.info(`💾 Available tempExpenses keys: ${Array.from(tempExpenses.keys()).join(', ')}`);

  const expenseData = tempExpenses.get(tempId);
  logger.info(`💾 Found expenseData: ${expenseData ? 'YES' : 'NO'}`);

  if (!expenseData) {
    logger.error(`💾 No expenseData found for tempId: ${tempId}`);
    await bot.editMessageText('❌ Данные расхода устарели. Попробуйте еще раз.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  try {
    // Check monthly records limit for FREE users
    const canCreate = await userService.checkMonthlyRecordsLimit(user.id);
    if (!canCreate) {
      await bot.editMessageText(
        `⛔ Лимит записей исчерпан (100 записей в месяц).\n\n💎 В PRO плане: неограниченные записи.`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[
            { text: '💎 Обновить до PRO', callback_data: 'upgrade:info' }
          ]] }
        }
      );
      return;
    }

    // Create a copy without project_name (which is only for display, not database storage)
    const { project_name, ...dbExpenseData } = expenseData;

    // Save expense to database
    logger.info(`💾 Saving expense to database: ${dbExpenseData.description} - ${dbExpenseData.amount} ${dbExpenseData.currency}`);
    const savedExpense = await expenseService.create(dbExpenseData);
    logger.info(`✅ Expense saved with ID: ${savedExpense.id}`);

    // Get project name for confirmation
    const project = await projectService.findById(expenseData.project_id);

    // Try to add to Google Sheets only if project has google_sheet_id
    let sheetsSuccess = false;
    if (project.google_sheet_id) {
      logger.info(`🔄 Starting Google Sheets sync for project: ${expenseData.project_id}`);
      try {
        await googleSheetsService.addExpenseToSheet(savedExpense, expenseData.project_id);
        sheetsSuccess = true;
        logger.info(`✅ Google Sheets sync successful`);
      } catch (sheetsError) {
        logger.warn('Google Sheets sync failed but expense saved:', sheetsError.message);
        logger.error('Google Sheets sync error details:', sheetsError);
      }
    }

    const successText = `✅ Расход сохранён!

💰 ${expenseData.description}: -${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📋 Проект: ${project.name}
${project.google_sheet_id ? (sheetsSuccess ? '📊 Добавлено в Google Sheets' : '📊 Синхронизация с Google Sheets: ошибка (данные сохранены)') : ''}`;

    try {
      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId
      });
    } catch (telegramError) {
      // Ignore "message not modified" errors - data is already saved
      if (telegramError.code === 'ETELEGRAM' &&
          telegramError.response?.body?.description?.includes('message is not modified')) {
        logger.info('Message not modified (Telegram API) - expense already saved successfully');
      } else {
        logger.error('Telegram API error while updating message:', telegramError);
        // Try to send new message as fallback
        try {
          await bot.sendMessage(chatId, successText);
        } catch (fallbackError) {
          logger.error('Failed to send fallback message:', fallbackError);
        }
      }
    }

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
  logger.info(`🔧 handleEditProject called with tempId: ${tempId}`);
  logger.info(`💾 tempExpenses has keys: ${Array.from(tempExpenses.keys()).join(', ')}`);

  const expenseData = tempExpenses.get(tempId);
  logger.info(`💾 Found expenseData: ${expenseData ? 'YES' : 'NO'}`);
  logger.info(`👤 User is premium: ${user.is_premium}`);

  const bot = getBot();

  if (!user.is_premium) {
    logger.info(`🚫 User ${user.id} is not premium, showing premium message`);
    await bot.editMessageText('💎 Проекты доступны только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `back_to_confirmation:${tempId}` }]] }
    });
    return;
  }

  if (!expenseData) {
    logger.info(`❌ No expenseData found for tempId: ${tempId}`);
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

  // Clear any active states
  stateManager.clearState(chatId);

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

    // For FREE users, only allow 1 owned project
    const ownedProjects = userProjects.filter(p => p.user_role === 'owner');
    if (!userData.is_premium && ownedProjects.length >= 1) {
      await bot.sendMessage(chatId,
        `⛔ Лимит проектов исчерпан!\n\n🆓 FREE план: 1 проект (у вас уже ${ownedProjects.length})\n💎 PRO план: неограниченные проекты`,
        { reply_markup: getUpgradeKeyboard() }
      );
      return;
    }

    // For first project, redirect to currency selection
    if (userProjects.length === 0) {
      const { getCurrencySelectionKeyboard } = require('../keyboards/inline');

      await bot.sendMessage(chatId,
        `💱 Для создания первого проекта сначала выберите валюту:`,
        { reply_markup: getCurrencySelectionKeyboard('initial', 'onboarding') }
      );
      return;
    } else {
      // For additional projects (PRO only), check if user has existing Google Sheets
      if (userData.is_premium) {
        const projectsWithSheets = userProjects.filter(p => p.google_sheet_id);
        
        if (projectsWithSheets.length > 0) {
          // User has existing Google Sheets - offer choice
          await bot.sendMessage(chatId, 
            '📋 Создание нового проекта\n\n' +
            '📊 У вас уже есть подключенные Google таблицы. Выберите опцию:\n\n' +
            '💡 Новый лист - создаст лист в существующей таблице\n' +
            '📄 Отдельная таблица - создаст новую Google таблицу для проекта',
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
          stateManager.clearState(chatId);
          stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_NAME_SIMPLE, {});
          
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
    case 'boosty':
      await bot.editMessageText(
        `💎 **Подписка через Boosty.to
🇷🇺 Для пользователей из России

**Цена:** 399 ₽ в месяц

**Как подписаться:1. Перейдите по ссылке: https://boosty.to/loomiq/purchase/3568312?ssource=DIRECT&share=subscription_link
2. Оформите месячную подписку
3. Оплатите удобным способом (карты РФ)
4. Пришлите скриншот об оплате в поддержку @loomiq_support
5. PRO статус активируется в течение часа!

✨ Принимаем карты РФ и другие способы оплаты`, {
        chat_id: chatId,
        message_id: messageId
      });
      break;

    case 'patreon':
      await bot.editMessageText(
        `💎 **Подписка через Patreon
🌍 Для международных пользователей

**Цена:** $4 в месяц

**Как подписаться:1. Перейдите по ссылке: https://www.patreon.com/14834277/join
2. Оформите месячную подписку
3. Оплатите через PayPal или карту
4. Пришлите скриншот об оплате в поддержку @loomiq_support
5. PRO статус активируется в течение часа!

✨ Принимаем PayPal, Visa, Mastercard`, {
        chat_id: chatId,
        message_id: messageId
      });
      break;
      
    case 'compare':
      const compareText = `📊 Сравнение планов:

🆓 FREE:
✅ 1 проект
✅ 100 записей/месяц
✅ 5 AI вопросов/день
✅ 1 синхронизация/день
✅ Базовые категории
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
A: Напишите @loomiq_support

Q: Есть ли бесплатный пробный период?
A: Да, 7 дней бесплатно при первом платеже

Q: Сохранятся ли данные при отмене?
A: Да, все данные останутся, но с ограничениями FREE плана

Q: Можно ли оплатить картой РФ?
A: Да, поддерживаются все основные платежные системы

Другие вопросы: @loomiq_support`;

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

    case 'info':
    case 'pro':
      // Redirect to main upgrade message with full info and buttons
      const { handleUpgrade } = require('./commands');
      const upgradeMessage = {
        chat: { id: chatId },
        user: { id: chatId } // Will be populated by middleware
      };

      // Delete current message and send new upgrade message
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (error) {
        // If delete fails, just edit the message
      }

      await handleUpgrade(upgradeMessage);
      break;

    default:
      // Unknown upgrade action, show main upgrade info
      await bot.editMessageText(
        '💎 Информация о PRO подписке недоступна. Используйте команду /upgrade',
        {
          chat_id: chatId,
          message_id: messageId
        }
      );
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
            
            const keyboard = [];

            // Always show create button first
            keyboard.push([
              { text: '➕ Создать категорию', callback_data: 'add_custom_category' }
            ]);

            // Add manage button if categories exist
            if (categories.length > 0) {
              keyboard.push([
                { text: '📝 Управлять', callback_data: 'manage_categories' }
              ]);
            }

            // Add back button
            keyboard.push([
              { text: '⬅️ Назад к настройкам', callback_data: 'settings:main' }
            ]);

            await bot.editMessageText(message, {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: { inline_keyboard: keyboard }
            });
          } catch (error) {
            logger.error('Error loading categories:', error);
            await bot.editMessageText('❌ Ошибка загрузки категорий.', {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: {
                inline_keyboard: [[
                  { text: '⬅️ Назад к настройкам', callback_data: 'settings:main' }
                ]]
              }
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
    
    // Check if user already has projects
    const userProjects = await projectService.findByUserId(user.id);

    if (userProjects.length === 0) {
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

📊 Для подключения Google таблицы используйте команду: /connect`,
        { reply_markup: getMainMenuKeyboard() }
      );
    } else {
      await bot.editMessageText(
        `✅ Валюта установлена: ${currencyNames[currency]} (${currency})`,
        { chat_id: chatId, message_id: messageId }
      );

      const { getMainMenuKeyboard } = require('../keyboards/reply');
      await bot.sendMessage(chatId,
        `💎 Валюта обновлена!`,
        { reply_markup: getMainMenuKeyboard() }
      );
    }
    
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

    // Show keywords if they exist
    const keywordsText = category.keywords
      ? `🔍 Ключевые слова: \`${category.keywords}\``
      : '🔍 Ключевые слова: _не заданы_';

    const message = `✏️ Редактирование категории

${category.emoji || '📁'} **${category.name}${keywordsText}

Выберите действие:`;

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Изменить название', callback_data: `edit_cat_name:${categoryId}` }],
          [{ text: '🎨 Изменить эмодзи', callback_data: `edit_cat_emoji:${categoryId}` }],
          [{ text: '🔍 Изменить ключевые слова', callback_data: `edit_cat_keywords:${categoryId}` }],
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

Текущее название: **${category.name}
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

Категория: **${category.name}Текущий эмодзи: ${category.emoji || '📁 (по умолчанию)'}

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

📁 **${categoryName}
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

async function handleEditCategoryKeywords(chatId, messageId, data, user) {
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

    stateManager.setState(chatId, STATE_TYPES.WAITING_CATEGORY_KEYWORDS_EDIT, {
      categoryId,
      currentKeywords: category.keywords
    });

    const currentKeywords = category.keywords ? `\`${category.keywords}\`` : '_не заданы_';

    await bot.sendMessage(chatId, `🔍 Изменение ключевых слов категории

${category.emoji || '📁'} **${category.name}Текущие ключевые слова: ${currentKeywords}

📝 Отправьте новые ключевые слова через запятую:

💡 Примеры:
• собака, пес, корм, ветеринар
• кафе, ресторан, еда, пицца
• бензин, заправка, топливо

Отправьте **-** чтобы удалить ключевые слова`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: `edit_custom_category:${categoryId}` }]
        ]
      }
    });
  } catch (error) {
    logger.error('Error in handleEditCategoryKeywords:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при загрузке категории.');
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
    // Get user's expenses and incomes for the period
    const [expenses, incomes] = await Promise.all([
      expenseService.getExpensesForExport(user.id, startDate, endDate),
      incomeService.getIncomesForExport(user.id, startDate, endDate)
    ]);

    if (expenses.length === 0 && incomes.length === 0) {
      await bot.editMessageText('📊 Нет данных за выбранный период для экспорта.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
    
    let fileContent, fileName, mimeType;
    
    if (format === 'csv') {
      // Generate CSV
      const csvData = generateCSV(expenses, incomes);
      fileContent = Buffer.from(csvData, 'utf-8');
      fileName = `transactions_${formatDate(startDate)}_${formatDate(endDate)}.csv`;
      mimeType = 'text/csv';
    } else {
      // Generate Excel - for now, use CSV format as placeholder
      const csvData = generateCSV(expenses, incomes);
      fileContent = Buffer.from(csvData, 'utf-8');
      fileName = `transactions_${formatDate(startDate)}_${formatDate(endDate)}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    
    // Send file
    await bot.sendDocument(chatId, fileContent, {}, {
      filename: fileName,
      contentType: mimeType
    });
    
    // Update message
    const totalRecords = expenses.length + incomes.length;
    await bot.editMessageText(`✅ Экспорт готов!\n\n📊 Экспортировано: ${totalRecords} записей (${expenses.length} расходов, ${incomes.length} доходов)\n📅 Период: ${formatDate(startDate)} - ${formatDate(endDate)}`, {
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

function generateCSV(expenses, incomes) {
  const headers = ['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Проект', 'Тип'];
  const rows = [headers];

  // Add expenses (negative amounts)
  expenses.forEach(expense => {
    rows.push([
      expense.expense_date,
      expense.description,
      -Math.abs(expense.amount), // Negative for expenses
      expense.currency,
      expense.category,
      expense.project_name || 'Без проекта',
      'Расход'
    ]);
  });

  // Add incomes (positive amounts)
  incomes.forEach(income => {
    rows.push([
      income.income_date,
      income.description,
      Math.abs(income.amount), // Positive for incomes
      income.currency,
      income.category,
      income.project_name || 'Без проекта',
      'Доход'
    ]);
  });

  // Sort by date (newest first)
  const dataRows = rows.slice(1);
  dataRows.sort((a, b) => new Date(b[0]) - new Date(a[0]));

  return [headers, ...dataRows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
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
    // Check monthly records limit for FREE users
    const canCreate = await userService.checkMonthlyRecordsLimit(user.id);
    if (!canCreate) {
      await bot.editMessageText(
        `⛔ Лимит записей исчерпан (100 записей в месяц).\n\n💎 В PRO плане: неограниченные записи.`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[
            { text: '💎 Обновить до PRO', callback_data: 'upgrade:info' }
          ]] }
        }
      );
      return;
    }

    // Create a copy without project_name (which is only for display, not database storage)
    const { project_name, ...dbIncomeData } = incomeData;

    // Save income to database
    const savedIncome = await incomeService.create(dbIncomeData);

    // Get project name for confirmation
    const project = await projectService.findById(incomeData.project_id);

    // Try to add to Google Sheets only if project has google_sheet_id
    let sheetsSuccess = false;
    if (project.google_sheet_id) {
      try {
        await googleSheetsService.addIncomeToSheet(savedIncome, incomeData.project_id);
        sheetsSuccess = true;
      } catch (sheetsError) {
        logger.warn('Google Sheets sync failed but income saved:', sheetsError.message);
      }
    }

    const successText = `✅ Доход сохранён!

💰 ${incomeData.description}: +${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📋 Проект: ${project.name}
${project.google_sheet_id ? (sheetsSuccess ? '📊 Добавлено в Google Sheets' : '📊 Синхронизация с Google Sheets: ошибка (данные сохранены)') : ''}`;

    try {
      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId
      });
    } catch (telegramError) {
      // Ignore "message not modified" errors - data is already saved
      if (telegramError.code === 'ETELEGRAM' &&
          telegramError.response?.body?.description?.includes('message is not modified')) {
        logger.info('Message not modified (Telegram API) - income already saved successfully');
      } else {
        logger.error('Telegram API error while updating message:', telegramError);
        // Try to send new message as fallback
        try {
          await bot.sendMessage(chatId, successText);
        } catch (fallbackError) {
          logger.error('Failed to send fallback message:', fallbackError);
        }
      }
    }

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

  // Clear any active states
  stateManager.clearState(chatId);

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
      `❗ ВНИМАНИЕ: Будут безвозвратно удалены:\n` +
      `• ВСЕ расходы проекта\n` +
      `• ВСЕ доходы проекта\n` +
      `• Участники проекта (если есть)\n` +
      `• Связь с Google таблицей\n\n` +
      `⚠️ Это действие НЕЛЬЗЯ отменить!`,
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

    // Delete the project and all related data (expenses, incomes, members)
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
      `🗑️ Удалены:\n` +
      `• Проект\n` +
      `• Все расходы и доходы\n` +
      `• Все связанные данные`,
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
    
    let errorMessage = '❌ Ошибка при удалении проекта.';
    
    if (error.message.includes('foreign key constraint')) {
      errorMessage = '❌ Не удалось удалить проект из-за связанных данных. Обратитесь к администратору.';
    } else if (error.message.includes('Failed to delete project')) {
      errorMessage = `❌ ${error.message}`;
    }
    
    await bot.editMessageText(errorMessage, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[
          { text: '📋 К управлению проектами', callback_data: 'back_to_projects' }
        ]]
      }
    });
  }
}

async function handleEditProject(chatId, messageId, data, user) {
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

    // Show keywords if they exist
    const keywordsText = project.keywords
      ? `🔍 Ключевые слова: \`${project.keywords}\``
      : '🔍 Ключевые слова: _не заданы_';

    const message = `✏️ Редактирование проекта

📁 **${project.name}${keywordsText}

Выберите что редактировать:`;

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Изменить название', callback_data: `edit_project_name:${projectId}` }],
          [{ text: '🔍 Изменить ключевые слова', callback_data: `edit_project_keywords:${projectId}` }],
          [{ text: '🔙 Назад к проектам', callback_data: 'back_to_projects' }]
        ]
      }
    });

  } catch (error) {
    logger.error('Error in handleEditProject:', error);
    await bot.editMessageText('❌ Ошибка при загрузке проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleEditProjectKeywords(chatId, messageId, data, user) {
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

    stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_KEYWORDS_EDIT, {
      projectId,
      currentKeywords: project.keywords
    });

    const currentKeywords = project.keywords ? `\`${project.keywords}\`` : '_не заданы_';

    await bot.sendMessage(chatId, `🔍 Изменение ключевых слов проекта

📁 **${project.name}Текущие ключевые слова: ${currentKeywords}

📝 Отправьте новые ключевые слова через запятую:

💡 Примеры:
• отпуск, отдых, путешествие, гостиница
• магазин, продукты, еда, супермаркет
• кафе, ресторан, обед, ужин

Отправьте **-** чтобы удалить ключевые слова`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: `manage_project:${projectId}` }]
        ]
      }
    });
  } catch (error) {
    logger.error('Error in handleEditProjectKeywords:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при загрузке проекта.');
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

    // Clear any existing state and set state for name editing
    stateManager.clearState(chatId);
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
  logger.info(`🚀 FUNCTION START: handleCreateProjectWithExistingSheet called!`);
  logger.info(`🚀 Parameters: chatId=${chatId}, messageId=${messageId}, user=${user?.id}`);

  const bot = getBot();

  try {
    logger.info(`📝 Starting handleCreateProjectWithExistingSheet for user ${user.id}`);
    logger.info(`📝 ChatId: ${chatId}, MessageId: ${messageId}`);
    
    // Clear any existing state first
    stateManager.clearState(chatId);
    logger.info(`🔧 Setting state for user ${user.id}: WAITING_PROJECT_NAME_EXISTING_SHEET`);
    stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_NAME_EXISTING_SHEET, { messageId });
    logger.info(`🔧 State set successfully for user ${user.id}`);
    
    await bot.editMessageText(
      '📋 Создание проекта с дополнительным листом\n\n' +
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
    
    logger.info(`✅ Successfully updated message for existing sheet option`);
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
    logger.info(`📝 Starting handleCreateProjectWithNewSheet for user ${user.id}`);
    logger.info(`📝 ChatId: ${chatId}, MessageId: ${messageId}`);
    
    // Clear any existing state first
    stateManager.clearState(chatId);
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

async function handleEditCurrency(chatId, messageId, data, user) {
  const bot = getBot();
  const expenseId = data.split(':')[1];

  try {
    await bot.editMessageText(
      '💱 Выберите валюту:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getCurrencySelectionKeyboard(expenseId, 'expense')
      }
    );
  } catch (error) {
    logger.error('Error handling edit currency:', error);
  }
}

async function handleEditIncomeCurrency(chatId, messageId, data, user) {
  const bot = getBot();
  const incomeId = data.split(':')[1];

  try {
    await bot.editMessageText(
      '💱 Выберите валюту:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getCurrencySelectionKeyboard(incomeId, 'income')
      }
    );
  } catch (error) {
    logger.error('Error handling edit income currency:', error);
  }
}

async function handleSetTransactionCurrency(chatId, messageId, data, user) {
  const bot = getBot();
  const [, expenseId, currency, type] = data.split(':');

  try {
    if (type === 'income') {
      const incomeData = tempIncomes.get(expenseId);
      if (incomeData) {
        incomeData.currency = currency;
        tempIncomes.set(expenseId, incomeData);

        await bot.editMessageText(
          `💰 ${incomeData.description || 'Доход'}\n💵 Сумма: ${incomeData.amount} ${incomeData.currency}\n📁 Проект: ${incomeData.project_name || 'Не указан'}\n🗂 Категория: ${incomeData.category}\n\nЧто хотите изменить?`,
          {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: getIncomeConfirmationKeyboard(expenseId, user.is_premium)
          }
        );
      }
    } else {
      const expenseData = tempExpenses.get(expenseId);
      if (expenseData) {
        expenseData.currency = currency;
        tempExpenses.set(expenseId, expenseData);

        await bot.editMessageText(
          `💸 ${expenseData.description || 'Расход'}\n💵 Сумма: ${expenseData.amount} ${expenseData.currency}\n📁 Проект: ${expenseData.project_name || 'Не указан'}\n🗂 Категория: ${expenseData.category}\n\nЧто хотите изменить?`,
          {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: getExpenseConfirmationKeyboard(expenseId, user.is_premium)
          }
        );
      }
    }
  } catch (error) {
    logger.error('Error handling set currency:', error);
  }
}

async function handleSyncProject(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];

  try {
    // Check sync limit for users without unlimited access
    const hasUnlimited = await userService.hasUnlimitedAccess(user.id);
    if (!hasUnlimited) {
      const syncLimit = 3;
      if (user.daily_syncs_used >= syncLimit) {
        await bot.editMessageText(
          `📊 Лимит синхронизаций исчерпан (${syncLimit}/день)\n\n💎 Обновитесь до PRO для неограниченных синхронизаций`,
          {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: [[
                { text: '❌ Закрыть', callback_data: 'cancel_sync' }
              ]]
            }
          }
        );
        return;
      }
    }

    // Get project info
    const project = await projectService.findById(projectId);
    if (!project) {
      await bot.editMessageText('❌ Проект не найден', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    if (!project.google_sheet_id) {
      await bot.editMessageText('❌ Проект не подключен к Google Sheets', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Show loading message
    await bot.editMessageText(
      `🔄 Синхронизация проекта "${project.name}"...\n\nПодождите, загружаем данные из Google Sheets.`,
      {
        chat_id: chatId,
        message_id: messageId
      }
    );

    // Perform sync
    const googleSheetsService = require('../../services/googleSheets');
    const result = await googleSheetsService.syncFromGoogleSheets(user.id, projectId);

    // Update daily sync counter for non-premium users
    if (!user.is_premium) {
      await userService.update(user.id, {
        daily_syncs_used: (user.daily_syncs_used || 0) + 1
      });
    }

    // Show result
    let resultText = `✅ **Синхронизация завершена!**\n\n`;
    resultText += `📋 Проект: ${project.name}\n`;
    resultText += `📊 Загружено записей: ${result.imported}\n`;

    if (result.errors && result.errors.length > 0) {
      resultText += `⚠️ Ошибок: ${result.errors.length}\n\n`;
      if (result.errors.length <= 3) {
        resultText += `**Ошибки:**\n${result.errors.join('\n')}`;
      } else {
        resultText += `**Первые ошибки:**\n${result.errors.slice(0, 3).join('\n')}\n...и ещё ${result.errors.length - 3}`;
      }
    }

    await bot.editMessageText(resultText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Готово', callback_data: 'cancel_sync' }
        ]]
      }
    });

  } catch (error) {
    logger.error('Error in handleSyncProject:', error);
    await bot.editMessageText(
      `❌ **Ошибка синхронизации**\n\n${error.message || 'Неизвестная ошибка'}`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Закрыть', callback_data: 'cancel_sync' }
          ]]
        }
      }
    );
  }
}

async function handleCancelSync(chatId, messageId) {
  const bot = getBot();

  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // If can't delete, just edit the message
    await bot.editMessageText('❌ Синхронизация отменена', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleConnectSheetToProject(chatId, messageId, data, user) {
  const bot = getBot();
  const parts = data.split(':');
  const projectId = parts[1];
  const sheetId = parts[2];

  try {
    // Get project info
    const project = await projectService.findById(projectId);
    if (!project) {
      await bot.editMessageText('❌ Проект не найден', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Update project with Google Sheets ID
    await projectService.update(projectId, {
      google_sheet_id: sheetId
    });

    // Delete the selection message
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (e) {
      // Ignore if can't delete
    }

    // Clear state and handle connection
    stateManager.clearState(chatId);

    // Import the handleGoogleSheetsConnected function
    const { handleGoogleSheetsConnected } = require('./messages');
    await handleGoogleSheetsConnected(chatId, user.id, project, sheetId);

  } catch (error) {
    logger.error('Error connecting sheet to project:', error);
    await bot.editMessageText(
      '❌ Ошибка подключения таблицы к проекту',
      {
        chat_id: chatId,
        message_id: messageId
      }
    );
  }
}

async function handleCancelConnectSheet(chatId, messageId) {
  const bot = getBot();

  try {
    stateManager.clearState(chatId);
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // If can't delete, just edit the message
    await bot.editMessageText('❌ Подключение отменено', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleSelectProjectForConnect(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];

  try {
    // Get project info
    const project = await projectService.findById(projectId);
    if (!project) {
      await bot.editMessageText('❌ Проект не найден', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Show instructions for this specific project
    const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
    stateManager.setState(chatId, STATE_TYPES.WAITING_GOOGLE_SHEETS_LINK, { selectedProjectId: projectId });

    await bot.editMessageText(
      `🔗 **Подключение к проекту "${project.name}"**\n\n` +
      `**Пошаговая инструкция:**\n\n` +
      `1️⃣ Откройте Google Sheets и создайте новую таблицу\n` +
      `2️⃣ Нажмите **"Настроить доступ"** → **"Предоставить доступ"**\n` +
      `3️⃣ Добавьте email: **exp-trck@ai-assistant-sheets.iam.gserviceaccount.com**\n` +
      `4️⃣ Установите права: **"Редактор"**\n` +
      `5️⃣ Скопируйте ссылку на таблицу и отправьте мне\n\n` +
      `📝 **Пример ссылки:**\n` +
      `https://docs.google.com/spreadsheets/d/1A2B3C.../edit\n\n` +
      `✨ Просто отправьте ссылку следующим сообщением!`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Отмена', callback_data: 'cancel_connect' }
          ]]
        }
      }
    );

  } catch (error) {
    logger.error('Error in handleSelectProjectForConnect:', error);
    await bot.editMessageText('❌ Ошибка при выборе проекта', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleCancelConnect(chatId, messageId) {
  const bot = getBot();

  try {
    stateManager.clearState(chatId);
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // If can't delete, just edit the message
    await bot.editMessageText('❌ Подключение отменено', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Import shared transaction mapping
const { shortTransactionMap } = require('../../utils/transactionMap');

async function handleProjectSelectionForTransaction(callbackQuery, data) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const user = callbackQuery.user;
  const bot = getBot();
  const [, projectIndex, shortTransactionId, transactionType] = data.split(':');

  try {
    logger.info(`Project selection: projectIndex=${projectIndex}, shortTransactionId=${shortTransactionId}, transactionType=${transactionType}`);
    logger.info(`Available mappings: ${Array.from(shortTransactionMap.keys()).join(', ')}`);

    // Get stored transaction data using full ID from mapping
    const mappedData = shortTransactionMap.get(shortTransactionId);
    if (!mappedData) {
      logger.error(`No mapping found for shortTransactionId: ${shortTransactionId}`);
      await bot.editMessageText('❌ Данные транзакции истекли. Попробуйте еще раз.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    const { fullTransactionId, projects } = mappedData;

    let transactionData;
    if (transactionType === 'income') {
      transactionData = tempIncomes.get(fullTransactionId);
    } else {
      transactionData = tempExpenses.get(fullTransactionId);
    }

    if (!transactionData) {
      await bot.editMessageText('❌ Данные транзакции истекли. Попробуйте еще раз.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Get selected project by index
    const project = projects[parseInt(projectIndex)];
    if (!project) {
      await bot.editMessageText('❌ Проект не найден.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Update transaction data with project
    transactionData.project_id = project.id;
    transactionData.project_name = project.name;
    logger.info(`📋 Updated transaction data with project: ${project.name} (ID: ${project.id})`);
    logger.info(`📋 Will use fullTransactionId for confirmation keyboard: ${fullTransactionId}`);

    // Clean up mapping
    shortTransactionMap.delete(shortTransactionId);

    // Show confirmation with all data
    const { getExpenseConfirmationKeyboard, getIncomeConfirmationKeyboard } = require('../keyboards/inline');

    if (transactionType === 'income') {
      const confirmationText = `💰 Подтвердите доход:

📝 Описание: ${transactionData.description}
💵 Сумма: ${transactionData.amount} ${transactionData.currency}
📂 Категория: ${transactionData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

      await bot.editMessageText(confirmationText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getIncomeConfirmationKeyboard(fullTransactionId, user.is_premium)
      });
    } else {
      const confirmationText = `💰 Подтвердите расход:

📝 Описание: ${transactionData.description}
💵 Сумма: ${transactionData.amount} ${transactionData.currency}
📂 Категория: ${transactionData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

      await bot.editMessageText(confirmationText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getExpenseConfirmationKeyboard(fullTransactionId, user.is_premium)
      });
    }

  } catch (error) {
    logger.error('Error selecting project for transaction:', error);
    await bot.editMessageText('❌ Ошибка выбора проекта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleCancelTransaction(chatId, messageId, data) {
  const bot = getBot();
  const shortTransactionId = data.split(':')[1];

  // Get full ID from mapping and clean up
  const mappedData = shortTransactionMap.get(shortTransactionId);
  if (mappedData) {
    const { fullTransactionId } = mappedData;
    // Clean up temporary data
    tempExpenses.delete(fullTransactionId);
    tempIncomes.delete(fullTransactionId);
    shortTransactionMap.delete(shortTransactionId);
  }

  await bot.editMessageText('❌ Транзакция отменена.', {
    chat_id: chatId,
    message_id: messageId
  });
}

// Team collaboration handlers
async function handleMakeCollaborative(chatId, messageId, user) {
  const bot = getBot();

  try {
    const projects = await projectService.findByUserId(user.id);
    const ownedProjects = projects.filter(p => p.user_role === 'owner' && !p.is_collaborative);

    if (ownedProjects.length === 0) {
      await bot.editMessageText(
        '📂 У вас нет проектов для превращения в командные.\n\n' +
        'Создайте проект или все ваши проекты уже командные.',
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_team' }]]
          }
        }
      );
      return;
    }

    const keyboard = ownedProjects.map(project => ([{
      text: `📁 ${project.name}`,
      callback_data: `make_collab:${project.id}`
    }]));

    keyboard.push([{ text: '🔙 Назад', callback_data: 'back_to_team' }]);

    await bot.editMessageText(
      'Выберите проект для превращения в командный:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  } catch (error) {
    logger.error('Error in handleMakeCollaborative:', error);
    await bot.editMessageText('❌ Ошибка загрузки проектов', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleMakeProjectCollaborative(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];

  try {
    const project = await projectService.makeCollaborative(projectId, user.id);

    await bot.editMessageText(
      `✅ Проект "${project.name}" теперь командный!\n\n` +
      '👤 Теперь вы можете приглашать участников в этот проект.',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '👤 Пригласить участника', callback_data: 'invite_member' }],
            [{ text: '🔙 К командной работе', callback_data: 'back_to_team' }]
          ]
        }
      }
    );
  } catch (error) {
    logger.error('Error making project collaborative:', error);
    await bot.editMessageText(`❌ ${error.message}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'make_collaborative' }]]
      }
    });
  }
}

async function handleInviteMember(chatId, messageId, user) {
  const bot = getBot();

  try {
    const projects = await projectService.findByUserId(user.id);
    const collaborativeProjects = projects.filter(p => p.is_collaborative && p.user_role === 'owner');

    if (collaborativeProjects.length === 0) {
      await bot.editMessageText(
        '📂 У вас нет командных проектов.\n\n' +
        'Сначала сделайте проект командным.',
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_team' }]]
          }
        }
      );
      return;
    }

    const keyboard = collaborativeProjects.map(project => ([{
      text: `📁 ${project.name}`,
      callback_data: `invite_to:${project.id}`
    }]));

    keyboard.push([{ text: '🔙 Назад', callback_data: 'back_to_team' }]);

    await bot.editMessageText(
      'Выберите проект для приглашения участника:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  } catch (error) {
    logger.error('Error in handleInviteMember:', error);
    await bot.editMessageText('❌ Ошибка загрузки проектов', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleInviteToProject(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];

  try {
    const project = await projectService.findById(projectId);

    await bot.editMessageText(
      `👤 Приглашение в проект "${project.name}"\n\n` +
      '🔤 Отправьте username участника (без @)\n' +
      '📨 Или перешлите любое сообщение от этого пользователя\n\n' +
      '💡 Примеры:\n' +
      '• ivan_petrov\n' +
      '• @username (с @)\n' +
      '• Форвард сообщения',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'invite_member' }]]
        }
      }
    );

    // Set state for username input
    stateManager.setState(chatId, 'WAITING_INVITE_USERNAME', { projectId, messageId });

  } catch (error) {
    logger.error('Error in handleInviteToProject:', error);
    await bot.editMessageText(`❌ ${error.message}`, {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleManageMembers(chatId, messageId, user) {
  const bot = getBot();

  try {
    const projects = await projectService.findByUserId(user.id);
    const collaborativeProjects = projects.filter(p => p.is_collaborative && p.user_role === 'owner');

    if (collaborativeProjects.length === 0) {
      await bot.editMessageText(
        '📂 У вас нет командных проектов.',
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_to_team' }]]
          }
        }
      );
      return;
    }

    const keyboard = collaborativeProjects.map(project => ([{
      text: `📁 ${project.name}`,
      callback_data: `show_members:${project.id}`
    }]));

    keyboard.push([{ text: '🔙 Назад', callback_data: 'back_to_team' }]);

    await bot.editMessageText(
      'Выберите проект для управления участниками:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  } catch (error) {
    logger.error('Error in handleManageMembers:', error);
    await bot.editMessageText('❌ Ошибка загрузки проектов', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleShowMembers(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];

  try {
    const project = await projectService.findById(projectId);
    const members = await projectService.getMembers(projectId);

    let message = `👥 Участники проекта "${project.name}"\n\n`;
    message += `👑 Владелец: @${user.username || user.first_name}\n\n`;

    if (members.length > 0) {
      message += 'Участники:\n';
      for (const member of members) {
        const username = member.user?.username ? `@${member.user.username}` : member.user?.first_name || 'Пользователь';
        message += `• ${username}\n`;
      }
    } else {
      message += 'Пока нет участников.';
    }

    const keyboard = [];

    // Add kick buttons for each member
    for (const member of members) {
      const username = member.user?.username || member.user?.first_name || 'Пользователь';
      keyboard.push([{
        text: `🚫 Исключить ${username}`,
        callback_data: `kick_member:${projectId}:${member.user_id}`
      }]);
    }

    keyboard.push([{ text: '🔙 Назад', callback_data: 'manage_members' }]);

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    logger.error('Error in handleShowMembers:', error);
    await bot.editMessageText(`❌ ${error.message}`, {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function handleKickMember(chatId, messageId, data, user) {
  const bot = getBot();
  const [, projectId, userId] = data.split(':');

  try {
    await projectMemberService.kick(projectId, parseInt(userId), user.id);

    // Refresh the members list
    await handleShowMembers(chatId, messageId, `show_members:${projectId}`, user);

  } catch (error) {
    logger.error('Error in handleKickMember:', error);
    await bot.editMessageText(`❌ ${error.message}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Назад', callback_data: `show_members:${projectId}` }]]
      }
    });
  }
}

async function handleBackToTeam(chatId, messageId, user) {
  const commands = require('./commands');

  // Clear any existing state
  stateManager.clearState(chatId);

  // Call handleTeam with a mock message object
  const mockMsg = {
    chat: { id: chatId },
    user: user
  };

  await commands.handleTeam(mockMsg);

  // Delete the callback message
  const bot = getBot();
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (error) {
    // Ignore if can't delete
  }
}

// Handle team management for specific project
async function handleManageTeam(chatId, messageId, data, user) {
  const bot = getBot();
  const projectId = data.split(':')[1];

  try {
    const project = await projectService.findById(projectId);

    if (!project) {
      await bot.editMessageText('❌ Проект не найден', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    // Check if user is owner
    if (project.owner_id !== user.id) {
      await bot.editMessageText('❌ Только владелец проекта может управлять командой', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    const keyboard = [];

    if (project.is_collaborative) {
      // Project is already collaborative - show team management options
      keyboard.push([
        { text: '👤 Пригласить участника', callback_data: `invite_to:${projectId}` }
      ]);
      keyboard.push([
        { text: '👥 Управление участниками', callback_data: `show_members:${projectId}` }
      ]);
    } else {
      // Project is not collaborative - offer to make it collaborative
      keyboard.push([
        { text: '🔄 Сделать проект командным', callback_data: `make_collab:${projectId}` }
      ]);
    }

    keyboard.push([
      { text: '🔙 Назад к проектам', callback_data: 'back_to_projects' }
    ]);

    const statusText = project.is_collaborative ? 'командный' : 'личный';
    await bot.editMessageText(
      `👥 Управление командой\n\n` +
      `📁 Проект: ${project.name}\n` +
      `📊 Статус: ${statusText}\n\n` +
      `Выберите действие:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard }
      }
    );

  } catch (error) {
    logger.error('Error in handleManageTeam:', error);
    await bot.editMessageText('❌ Ошибка управления командой', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

module.exports = {
  handleCallback
};