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
  // Get user data
  const userData = await userService.findById(user.id);
  const userProjects = await projectService.findByUserId(user.id);

  // Check project limits for FREE users
  if (!userData.is_premium && userProjects.length >= 1) {
    await bot.sendMessage(chatId, 
      '⛔ Лимит проектов исчерпан!\n\n🆓 FREE план: 1 проект\n💎 PRO план: неограниченные проекты',
      { reply_markup: getUpgradeKeyboard() }
    );
    return;
  }

  await bot.sendMessage(chatId, '🚧 Создание проектов будет добавлено в следующем обновлении.');
}

async function handleUpgradeAction(chatId, messageId, data) {
  const action = data.split(':')[1];

  switch (action) {
    case 'pro':
      await bot.editMessageText(
        '💎 Оплата PRO плана\n\n🚧 Интеграция с платежной системой будет добавлена в следующем обновлении.\n\nПока что свяжитесь с поддержкой: @support_bot',
        { chat_id: chatId, message_id: messageId }
      );
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

module.exports = {
  handleCallback
};