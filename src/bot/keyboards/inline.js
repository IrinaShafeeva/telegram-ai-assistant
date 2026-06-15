const { DEFAULT_CATEGORIES, INCOME_CATEGORIES } = require('../../config/constants');

function getExpenseConfirmationKeyboard(expenseId) {
  const keyboard = [
    [
      { text: '✏️ Категория', callback_data: `edit_category:${expenseId}` },
      { text: '📋 Проект', callback_data: `edit_project:${expenseId}` }
    ]
  ];

  // Add amount, currency, description row
  keyboard.push([
    { text: '💰 Сумма', callback_data: `edit_amount:${expenseId}` },
    { text: '💱 Валюта', callback_data: `edit_currency:${expenseId}` },
    { text: '📝 Описание', callback_data: `edit_description:${expenseId}` }
  ]);

  // Save and Cancel buttons at the bottom
  keyboard.push([
    { text: '✅ Сохранить', callback_data: `save_expense:${expenseId}` },
    { text: '❌ Отменить', callback_data: `cancel_expense:${expenseId}` }
  ]);

  return { inline_keyboard: keyboard };
}

function getIncomeConfirmationKeyboard(incomeId) {
  const keyboard = [
    [
      { text: '✏️ Категория', callback_data: `edit_income_category:${incomeId}` },
      { text: '📋 Проект', callback_data: `edit_income_project:${incomeId}` }
    ]
  ];

  // Add amount, currency, description row
  keyboard.push([
    { text: '💰 Сумма', callback_data: `edit_income_amount:${incomeId}` },
    { text: '💱 Валюта', callback_data: `edit_income_currency:${incomeId}` },
    { text: '📝 Описание', callback_data: `edit_income_description:${incomeId}` }
  ]);

  // Save and Cancel buttons at the bottom
  keyboard.push([
    { text: '✅ Сохранить', callback_data: `save_income:${incomeId}` },
    { text: '❌ Отменить', callback_data: `cancel_income:${incomeId}` }
  ]);

  return { inline_keyboard: keyboard };
}

function getCategorySelectionKeyboard(expenseId, customCategories = []) {
  const categories = [...DEFAULT_CATEGORIES, ...customCategories.map(c => `${c.emoji} ${c.name}`)];
  const keyboard = [];
  
  // Split categories into rows of 2
  for (let i = 0; i < categories.length; i += 2) {
    const row = [];
    row.push({ 
      text: categories[i], 
      callback_data: `set_category:${expenseId}:${i}` 
    });
    
    if (categories[i + 1]) {
      row.push({ 
        text: categories[i + 1], 
        callback_data: `set_category:${expenseId}:${i + 1}` 
      });
    }
    keyboard.push(row);
  }
  
  keyboard.push([{ 
    text: '➕ Своя категория', 
    callback_data: `custom_category:${expenseId}` 
  }]);
  
  // Add back button
  keyboard.push([{ 
    text: '⬅️ Назад', 
    callback_data: `back_to_confirmation:${expenseId}` 
  }]);
  
  return { inline_keyboard: keyboard };
}

function getIncomeCategorySelectionKeyboard(incomeId) {
  const keyboard = [];
  
  // Split categories into rows of 2
  for (let i = 0; i < INCOME_CATEGORIES.length; i += 2) {
    const row = [];
    row.push({ 
      text: INCOME_CATEGORIES[i], 
      callback_data: `set_income_category:${incomeId}:${i}` 
    });
    
    if (INCOME_CATEGORIES[i + 1]) {
      row.push({ 
        text: INCOME_CATEGORIES[i + 1], 
        callback_data: `set_income_category:${incomeId}:${i + 1}` 
      });
    }
    keyboard.push(row);
  }
  
  // Add back button
  keyboard.push([{ 
    text: '⬅️ Назад', 
    callback_data: `back_to_income_confirmation:${incomeId}` 
  }]);
  
  return { inline_keyboard: keyboard };
}

function getIncomeProjectSelectionKeyboard(incomeId, projects, currentProjectId = null) {
  const keyboard = [];

  projects.forEach((project, index) => {
    const isCurrent = currentProjectId && project.id === currentProjectId;
    keyboard.push([{
      text: `${isCurrent ? '✅ ' : ''}${project.name}`,
      callback_data: `set_income_project:${incomeId}:${index}`
    }]);
  });

  // Add back button
  keyboard.push([{
    text: '⬅️ Назад',
    callback_data: `back_to_income_confirmation:${incomeId}`
  }]);

  return { inline_keyboard: keyboard };
}

function getProjectSelectionKeyboardForExpense(expenseId, projects, currentProjectId = null) {
  const keyboard = [];

  projects.forEach((project, index) => {
    const isCurrent = currentProjectId && project.id === currentProjectId;
    keyboard.push([{
      text: `${isCurrent ? '✅ ' : ''}${project.name}`,
      callback_data: `set_project:${expenseId}:${index}`
    }]);
  });

  // Add back button
  keyboard.push([{
    text: '⬅️ Назад',
    callback_data: `back_to_confirmation:${expenseId}`
  }]);

  return { inline_keyboard: keyboard };
}

function getAmountSelectionKeyboard(expenseId) {
  return {
    inline_keyboard: [
      [
        { text: '✏️ Ввести сумму', callback_data: `custom_amount:${expenseId}` }
      ],
      [
        { text: '⬅️ Назад', callback_data: `back_to_confirmation:${expenseId}` }
      ]
    ]
  };
}

function getProjectSelectionKeyboard(projects, action = 'switch') {
  const keyboard = [];
  
  if (action === 'manage') {
    // Management interface with action buttons for each project
    projects.forEach(project => {
      // Project name row
      keyboard.push([{ 
        text: `📁 ${project.name}`, 
        callback_data: `project_info:${project.id}` 
      }]);
      
      // Action buttons row
      const actionRow = [];

      actionRow.push({
        text: '✏️ Изменить',
        callback_data: `manage_project:${project.id}`
      });

      actionRow.push({
        text: '👥 Команда',
        callback_data: `manage_team:${project.id}`
      });

      // Can't delete if it's the last project
      if (projects.length > 1) {
        actionRow.push({
          text: '🗑️ Удалить',
          callback_data: `delete_project:${project.id}`
        });
      }
      
      keyboard.push(actionRow);
    });
    
  } else {
    // Simple switch interface
    projects.forEach(project => {
      keyboard.push([{ 
        text: `${project.name}`, 
        callback_data: `${action}_project:${project.id}` 
      }]);
    });
  }
  
  if (action === 'switch' || action === 'manage') {
    keyboard.push([{ 
      text: '➕ Новый проект', 
      callback_data: 'create_project' 
    }]);
  }
  
  return { inline_keyboard: keyboard };
}


function getSettingsKeyboard() {
  const keyboard = [
    [{ text: '💱 Валюта', callback_data: 'settings:currency' }],
    [{ text: '📂 Мои категории', callback_data: 'settings:categories' }]
  ];

  keyboard.push([{ text: '🗑️ Очистить все данные', callback_data: 'settings:clear_data' }]);
  
  return { inline_keyboard: keyboard };
}

function getConfirmationKeyboard(action, itemId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Да', callback_data: `confirm:${action}:${itemId}` },
        { text: '❌ Нет', callback_data: `cancel:${action}:${itemId}` }
      ]
    ]
  };
}

function getPaginationKeyboard(currentPage, totalPages, action, ...params) {
  const keyboard = [];
  const row = [];
  
  if (currentPage > 1) {
    row.push({ 
      text: '⬅️', 
      callback_data: `${action}:${currentPage - 1}:${params.join(':')}` 
    });
  }
  
  row.push({ 
    text: `${currentPage}/${totalPages}`, 
    callback_data: 'noop' 
  });
  
  if (currentPage < totalPages) {
    row.push({ 
      text: '➡️', 
      callback_data: `${action}:${currentPage + 1}:${params.join(':')}` 
    });
  }
  
  keyboard.push(row);
  return { inline_keyboard: keyboard };
}

function getExportFormatKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Excel (.xlsx)', callback_data: 'export_format:xlsx' },
        { text: '📄 CSV', callback_data: 'export_format:csv' }
      ],
      [
        { text: '⬅️ Назад к настройкам', callback_data: 'settings:main' }
      ]
    ]
  };
}

function getExportPeriodKeyboard(format) {
  return {
    inline_keyboard: [
      [
        { text: '📅 Сегодня', callback_data: `export_period:${format}:today` }
      ],
      [
        { text: '📅 Последние 7 дней', callback_data: `export_period:${format}:week` }
      ],
      [
        { text: '📅 Последние 30 дней', callback_data: `export_period:${format}:month` }
      ],
      [
        { text: '📅 Указать период', callback_data: `export_period:${format}:custom` }
      ],
      [
        { text: '⬅️ Назад к форматам', callback_data: 'settings:export' }
      ]
    ]
  };
}

function getCurrencySelectionKeyboard(expenseId, type = 'expense') {
  const currencies = [
    { symbol: '₽', code: 'RUB', name: 'Рубли', flag: '🇷🇺' },
    { symbol: '$', code: 'USD', name: 'Доллары', flag: '🇺🇸' },
    { symbol: '€', code: 'EUR', name: 'Евро', flag: '🇪🇺' },
    { symbol: '£', code: 'GBP', name: 'Фунты', flag: '🇬🇧' },
    { symbol: '₸', code: 'KZT', name: 'Тенге', flag: '🇰🇿' },
    { symbol: '₴', code: 'UAH', name: 'Гривны', flag: '🇺🇦' }
  ];

  const keyboard = [];

  // Split currencies into rows of 2
  for (let i = 0; i < currencies.length; i += 2) {
    const row = [];

    // For onboarding, use different callback format
    const callbackFormat = type === 'onboarding' ? 'set_currency_' : 'set_currency:';
    const callbackData1 = type === 'onboarding'
      ? `${callbackFormat}${currencies[i].code}`
      : `${callbackFormat}${expenseId}:${currencies[i].code}:${type}`;

    row.push({
      text: `${currencies[i].flag} ${currencies[i].name} (${currencies[i].code})`,
      callback_data: callbackData1
    });

    if (currencies[i + 1]) {
      const callbackData2 = type === 'onboarding'
        ? `${callbackFormat}${currencies[i + 1].code}`
        : `${callbackFormat}${expenseId}:${currencies[i + 1].code}:${type}`;

      row.push({
        text: `${currencies[i + 1].flag} ${currencies[i + 1].name} (${currencies[i + 1].code})`,
        callback_data: callbackData2
      });
    }
    keyboard.push(row);
  }

  // Add "Set as default" button (only for transaction editing, not onboarding)
  if (type !== 'onboarding') {
    keyboard.push([{
      text: '💾 Сохранить как основную валюту',
      callback_data: `set_default_currency:${expenseId}:${type}`
    }]);

    // Add back button
    keyboard.push([{
      text: '⬅️ Назад',
      callback_data: type === 'income' ? `back_to_income_confirmation:${expenseId}` : `back_to_confirmation:${expenseId}`
    }]);
  }

  return { inline_keyboard: keyboard };
}

function getProjectSelectionForTransactionKeyboard(projects, transactionId, transactionType = 'expense') {
  const keyboard = [];

  projects.forEach((project, index) => {
    keyboard.push([{
      text: `📋 ${project.name}`,
      callback_data: `proj_sel:${index}:${transactionId}:${transactionType}`
    }]);
  });

  // Add cancel button
  keyboard.push([{
    text: '❌ Отмена',
    callback_data: `cancel_trans:${transactionId}`
  }]);

  return { inline_keyboard: keyboard };
}

function getRecentTransactionsKeyboard(transactions) {
  const keyboard = [];

  transactions.forEach((transaction, index) => {
    const emoji = transaction.type === 'expense' ? '📤' : '📥';
    const date = new Date(transaction.expense_date || transaction.income_date).toLocaleDateString('ru-RU');
    const amount = `${transaction.amount} ${transaction.currency}`;
    const description = transaction.description.length > 20
      ? transaction.description.substring(0, 20) + '...'
      : transaction.description;

    const buttonText = `${emoji} ${date} | ${description} | ${amount}`;

    keyboard.push([{
      text: buttonText,
      callback_data: `edit_transaction:${transaction.type}:${transaction.id}`
    }]);
  });

  // Add cancel button
  keyboard.push([{
    text: '❌ Отмена',
    callback_data: 'cancel_edit'
  }]);

  return { inline_keyboard: keyboard };
}

function getTransactionEditKeyboard(transactionId, transactionType) {
  return {
    inline_keyboard: [
      [
        { text: '✏️ Сумма', callback_data: `edit_amount:${transactionType}:${transactionId}` },
        { text: '📝 Описание', callback_data: `edit_description:${transactionType}:${transactionId}` }
      ],
      [
        { text: '🏷️ Категория', callback_data: `edit_category:${transactionType}:${transactionId}` },
        { text: '📂 Проект', callback_data: `edit_project:${transactionType}:${transactionId}` }
      ],
      [
        { text: '🗑️ Удалить', callback_data: `delete_transaction:${transactionType}:${transactionId}` }
      ],
      [
        { text: '❌ Отмена', callback_data: 'cancel_edit' }
      ]
    ]
  };
}

module.exports = {
  getExpenseConfirmationKeyboard,
  getIncomeConfirmationKeyboard,
  getCategorySelectionKeyboard,
  getIncomeCategorySelectionKeyboard,
  getIncomeProjectSelectionKeyboard,
  getAmountSelectionKeyboard,
  getProjectSelectionKeyboard,
  getProjectSelectionKeyboardForExpense,
  getProjectSelectionForTransactionKeyboard,
  getSettingsKeyboard,
  getConfirmationKeyboard,
  getPaginationKeyboard,
  getExportFormatKeyboard,
  getExportPeriodKeyboard,
  getCurrencySelectionKeyboard,
  getRecentTransactionsKeyboard,
  getTransactionEditKeyboard,
  getAnalyticsProjectSelectionKeyboard
};

function getAnalyticsProjectSelectionKeyboard(projects, questionId) {
  const keyboard = [];

  // Add "All projects" button first
  keyboard.push([{ text: '📊 Все проекты', callback_data: `analytics_project:all:${questionId}` }]);

  // Add individual project buttons (max 2 per row) - use index instead of UUID
  for (let i = 0; i < projects.length; i += 2) {
    const row = [];
    row.push({
      text: `📋 ${projects[i].name}`,
      callback_data: `analytics_project:${i}:${questionId}`
    });

    if (i + 1 < projects.length) {
      row.push({
        text: `📋 ${projects[i + 1].name}`,
        callback_data: `analytics_project:${i + 1}:${questionId}`
      });
    }

    keyboard.push(row);
  }

  return { inline_keyboard: keyboard };
}
