const { userService, projectService, expenseService, customCategoryService } = require('../../services/supabase');
const googleSheetsService = require('../../services/googleSheets');
const { tempExpenses } = require('./messages');
const { 
  getCategorySelectionKeyboard, 
  getAmountSelectionKeyboard,
  getExpenseConfirmationKeyboard,
  getProjectSelectionKeyboardForExpense,
  getUpgradeKeyboard
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
    } else if (data.startsWith('set_amount:')) {
      await handleSetAmount(chatId, messageId, data, user);
    } else if (data.startsWith('cancel_expense:')) {
      await handleCancelExpense(chatId, messageId, data);
    } else if (data.startsWith('back_to_confirmation:')) {
      await handleBackToConfirmation(chatId, messageId, data);
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
    } else if (data.startsWith('custom_category:')) {
      await handleCustomCategory(chatId, messageId, data, user);
    } else if (data.startsWith('custom_amount:')) {
      await handleCustomAmount(chatId, messageId, data, user);
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
    const savedExpense = await expenseService.create(expenseData);

    // Try to add to Google Sheets (don't fail if this fails)
    let sheetsSuccess = false;
    try {
      await googleSheetsService.addExpenseToSheet(savedExpense, expenseData.project_id);
      sheetsSuccess = true;
    } catch (sheetsError) {
      logger.warn('Google Sheets sync failed but expense saved:', sheetsError.message);
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

async function handleEditCategory(chatId, messageId, data, user) {
  const tempId = data.split(':')[1];
  const expenseData = tempExpenses.get(tempId);

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

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

async function handleEditProject(chatId, messageId, data, user) {
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
  const projectId = parts[2];
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
    // Get project info
    const project = await projectService.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Update expense data
    expenseData.project_id = projectId;
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
      reply_markup: getExpenseConfirmationKeyboard(tempId)
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
  const category = parts.slice(2).join(':'); // Join back all parts after tempId
  const expenseData = tempExpenses.get(tempId);

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  // Update category
  expenseData.category = category;
  tempExpenses.set(tempId, expenseData);

  await handleBackToConfirmation(chatId, messageId, `back_to_confirmation:${tempId}`);
}

async function handleSetAmount(chatId, messageId, data, user) {
  const parts = data.split(':');
  const tempId = parts[1];
  const amount = parts[2];
  const expenseData = tempExpenses.get(tempId);

  if (!expenseData) {
    await bot.editMessageText('❌ Данные расхода устарели.', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }

  // Update amount
  expenseData.amount = parseFloat(amount);
  tempExpenses.set(tempId, expenseData);

  await handleBackToConfirmation(chatId, messageId, `back_to_confirmation:${tempId}`);
}

async function handleBackToConfirmation(chatId, messageId, data) {
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
    reply_markup: getExpenseConfirmationKeyboard(tempId)
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
      // For additional projects (PRO only), ask for name
      if (userData.is_premium) {
        stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_NAME, {});
        
        await bot.sendMessage(chatId, 
          '📋 Создание нового проекта\n\nОтправьте название проекта:\n\n📝 Пример: "Отпуск в Турции" или "Рабочие расходы"'
        );
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
        await bot.editMessageText('📊 Экспорт данных:\n\n🚧 Функция в разработке. Используйте Google Sheets для экспорта.', {
          chat_id: chatId,
          message_id: messageId
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
  
  await bot.editMessageText('✏️ Введение своей суммы:\n\n🚧 Функция в разработке.\nПока используйте готовые варианты или редактируйте расход после создания.', {
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

module.exports = {
  handleCallback
};