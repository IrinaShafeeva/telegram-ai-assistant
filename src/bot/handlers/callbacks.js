const { userService, projectService, expenseService } = require('../../services/supabase');
const googleSheetsService = require('../../services/googleSheets');
const patternsService = require('../../services/patterns');
const { tempExpenses } = require('./messages');
const { 
  getCategorySelectionKeyboard, 
  getAmountSelectionKeyboard,
  getExpenseConfirmationKeyboard,
  getUpgradeKeyboard
} = require('../keyboards/inline');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');

async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const user = callbackQuery.from;
  const bot = getBot();

  try {
    await bot.answerCallbackQuery(callbackQuery.id);

    // Route callback to appropriate handler
    if (data.startsWith('save_expense:')) {
      await handleSaveExpense(chatId, messageId, data, user);
    } else if (data.startsWith('edit_category:')) {
      await handleEditCategory(chatId, messageId, data, user);
    } else if (data.startsWith('edit_amount:')) {
      await handleEditAmount(chatId, messageId, data, user);
    } else if (data.startsWith('edit_description:')) {
      await handleEditDescription(chatId, messageId, data, user);
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
    } else if (data.startsWith('stats:')) {
      await handleStatsAction(chatId, messageId, data, user);
    } else if (data.startsWith('settings:')) {
      await handleSettingsAction(chatId, messageId, data, user);
    } else if (data.startsWith('switch_project:')) {
      await handleSwitchProject(chatId, messageId, data, user);
    } else if (data.startsWith('custom_category:')) {
      await handleCustomCategory(chatId, messageId, data, user);
    } else if (data.startsWith('custom_amount:')) {
      await handleCustomAmount(chatId, messageId, data, user);
    } else if (data === 'noop') {
      // Do nothing - pagination placeholder
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

    // Add to Google Sheets
    await googleSheetsService.addExpenseToSheet(savedExpense, expenseData.project_id);

    // Update user patterns for smart defaults
    await patternsService.updateUserPatterns(
      user.id, 
      expenseData.description, 
      expenseData.category,
      expenseData.amount,
      expenseData.currency
    );

    // Get project name for confirmation
    const project = await projectService.findById(expenseData.project_id);

    const successText = `✅ Расход сохранён!

💰 ${expenseData.description}: -${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📋 Проект: ${project.name}
📊 Добавлено в Google Sheets

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

  // TODO: Get user's custom categories if PRO
  const customCategories = [];

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
  
  await bot.editMessageText('📝 Отправьте новое описание расхода:', {
    chat_id: chatId,
    message_id: messageId
  });

  // TODO: Set up state to wait for description input
  // This would require implementing a state machine or using session storage
}

async function handleSetCategory(chatId, messageId, data, user) {
  const [, tempId, category] = data.split(':');
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
  const [, tempId, amount] = data.split(':');
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

    // For PRO users, create additional projects
    const projectName = userProjects.length === 0 ? 'Личные расходы' : `Проект ${userProjects.length + 1}`;
    
    const newProject = await projectService.create({
      owner_id: user.id,
      name: projectName,
      description: 'Проект для отслеживания расходов',
      is_active: false // New projects are inactive by default
    });

    await bot.sendMessage(chatId, 
      `✅ Проект "${projectName}" создан!\n\n📋 Переключитесь на него через /projects если хотите использовать.\n\n✨ Или продолжайте добавлять расходы в текущий проект.`
    );
  } catch (error) {
    logger.error('Create project error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка создания проекта. Попробуйте позже.');
  }
}

async function handleUpgradeAction(chatId, messageId, data) {
  const action = data.split(':')[1];

  switch (action) {
    case 'pro':
      // Send Telegram Stars invoice
      try {
        const invoice = {
          title: '💎 Expense Tracker PRO',
          description: '🚀 Получите неограниченные проекты, 20 AI вопросов/день, командную работу и кастомные категории!',
          payload: 'expense_tracker_pro_monthly',
          provider_token: '', // Empty for Telegram Stars
          currency: 'XTR', // Telegram Stars currency
          prices: [{ label: 'PRO план (1 месяц)', amount: 100 }], // 100 Stars = ~$1-2
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
          `💎 Счет на оплату отправлен!\n\n⭐ Стоимость: 100 Telegram Stars\n💰 Примерно: $1-2\n\n✨ После оплаты PRO активируется автоматически!`,
          { chat_id: chatId, message_id: messageId }
        );
      } catch (error) {
        logger.error('Invoice creation error:', error);
        await bot.editMessageText(
          `💎 Оплата PRO плана\n\n⭐ Стоимость: 100 Telegram Stars (~$1-2)\n\n🚧 Временно недоступно. Используйте команду /devpro для тестирования PRO функций.\n\nОбратитесь в поддержку: @support_bot`,
          { chat_id: chatId, message_id: messageId }
        );
      }
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

// Stats handlers
async function handleStatsAction(chatId, messageId, data, user) {
  const bot = getBot();
  const parts = data.split(':');
  const action = parts[1];
  
  try {
    const projects = await projectService.findByUserId(user.id);
    const activeProject = projects.find(p => p.is_active) || projects[0];
    
    if (!activeProject) {
      await bot.editMessageText('📊 Сначала создайте проект для отслеживания расходов.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    if (action === 'detailed') {
      // Detailed analytics
      await bot.editMessageText(`📊 Детальная аналитика по проекту "${activeProject.name}":\n\n🚧 Функция в разработке. Скоро будет доступна!`, {
        chat_id: chatId,
        message_id: messageId
      });
    } else if (action === 'last3months') {
      // Last 3 months stats
      await bot.editMessageText(`📊 Статистика за последние 3 месяца:\n\n🚧 Функция в разработке. Скоро будет доступна!`, {
        chat_id: chatId,
        message_id: messageId
      });
    } else if (action === 'year') {
      // Yearly stats
      const year = parts[2];
      await bot.editMessageText(`📊 Статистика за ${year} год:\n\n🚧 Функция в разработке. Скоро будет доступна!`, {
        chat_id: chatId,
        message_id: messageId
      });
    } else {
      // Monthly stats
      const month = parts[1];
      const year = parts[2];
      await bot.editMessageText(`📊 Статистика за ${month}/${year}:\n\n🚧 Функция в разработке. Скоро будет доступна!`, {
        chat_id: chatId,
        message_id: messageId
      });
    }
  } catch (error) {
    logger.error('Stats action error:', error);
    await bot.editMessageText('❌ Ошибка загрузки статистики.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Settings handlers
async function handleSettingsAction(chatId, messageId, data, user) {
  const bot = getBot();
  const action = data.split(':')[1];
  
  try {
    switch (action) {
      case 'currency':
        await bot.editMessageText('💱 Выбор валюты:\n\n🚧 Функция в разработке. Пока используется валюта из расходов.', {
          chat_id: chatId,
          message_id: messageId
        });
        break;
        
      case 'language':
        await bot.editMessageText('🌐 Выбор языка:\n\n🚧 Функция в разработке. Пока поддерживается русский язык.', {
          chat_id: chatId,
          message_id: messageId
        });
        break;
        
      case 'export':
        await bot.editMessageText('📊 Экспорт данных:\n\n🚧 Функция в разработке. Используйте Google Sheets для экспорта.', {
          chat_id: chatId,
          message_id: messageId
        });
        break;
        
      case 'notifications':
        await bot.editMessageText('🔔 Настройки уведомлений:\n\n🚧 Функция в разработке.', {
          chat_id: chatId,
          message_id: messageId
        });
        break;
        
      case 'delete_account':
        await bot.editMessageText('🗑 Удаление аккаунта:\n\n⚠️ Это действие удалит все ваши данные!\n\n🚧 Функция в разработке. Обратитесь в поддержку.', {
          chat_id: chatId,
          message_id: messageId
        });
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
  const userData = await userService.findById(user.id);
  
  if (!userData.is_premium) {
    await bot.editMessageText('💎 Кастомные категории доступны только в PRO плане!', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getUpgradeKeyboard()
    });
    return;
  }
  
  await bot.editMessageText('➕ Создание своей категории:\n\n🚧 Функция в разработке.', {
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

module.exports = {
  handleCallback
};