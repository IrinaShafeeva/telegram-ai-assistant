const { DEFAULT_CATEGORIES, INCOME_CATEGORIES } = require('../../config/constants');

function getExpenseConfirmationKeyboard(expenseId, isPremium = false) {
  const keyboard = [
    [
      { text: '✅ Сохранить', callback_data: `save_expense:${expenseId}` },
      { text: '✏️ Категория', callback_data: `edit_category:${expenseId}` }
    ],
    [
      { text: '💰 Сумма', callback_data: `edit_amount:${expenseId}` },
      { text: '📝 Описание', callback_data: `edit_description:${expenseId}` }
    ]
  ];

  // Add project editing only for PRO users
  if (isPremium) {
    keyboard.push([
      { text: '📋 Проект', callback_data: `edit_project:${expenseId}` }
    ]);
  }

  keyboard.push([
    { text: '❌ Отменить', callback_data: `cancel_expense:${expenseId}` }
  ]);

  return { inline_keyboard: keyboard };
}

function getIncomeConfirmationKeyboard(incomeId, isPremium = false) {
  const keyboard = [
    [
      { text: '✅ Сохранить', callback_data: `save_income:${incomeId}` },
      { text: '✏️ Категория', callback_data: `edit_income_category:${incomeId}` }
    ],
    [
      { text: '💰 Сумма', callback_data: `edit_income_amount:${incomeId}` },
      { text: '📝 Описание', callback_data: `edit_income_description:${incomeId}` }
    ]
  ];

  // Add project editing only for PRO users
  if (isPremium) {
    keyboard.push([
      { text: '📋 Проект', callback_data: `edit_income_project:${incomeId}` }
    ]);
  }

  keyboard.push([
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
  
  // Add "Custom category" button for PRO users
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

function getIncomeProjectSelectionKeyboard(incomeId, projects) {
  const keyboard = [];
  
  projects.forEach((project, index) => {
    keyboard.push([{ 
      text: `${project.name}${project.is_active ? ' ✅' : ''}`, 
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

function getProjectSelectionKeyboardForExpense(expenseId, projects) {
  const keyboard = [];
  
  projects.forEach((project, index) => {
    keyboard.push([{ 
      text: `${project.name}${project.is_active ? ' ✅' : ''}`, 
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

function getProjectSelectionKeyboard(projects, action = 'switch', isPremium = false) {
  const keyboard = [];
  
  if (action === 'manage') {
    // Management interface with action buttons for each project
    projects.forEach(project => {
      // Project name row
      keyboard.push([{ 
        text: `📁 ${project.name}${project.is_active ? ' ▶️' : ''}`, 
        callback_data: `project_info:${project.id}` 
      }]);
      
      // Action buttons row
      const actionRow = [];
      
      if (!project.is_active) {
        actionRow.push({ 
          text: '▶️ Активировать', 
          callback_data: `activate_project:${project.id}` 
        });
      }
      
      actionRow.push({ 
        text: '✏️ Изменить', 
        callback_data: `edit_project_name:${project.id}` 
      });
      
      // Can't delete if it's the last project
      if (projects.length > 1) {
        actionRow.push({ 
          text: '🗑️ Удалить', 
          callback_data: `delete_project:${project.id}` 
        });
      }
      
      keyboard.push(actionRow);
      keyboard.push([{ text: '──────────', callback_data: 'noop' }]); // Separator
    });
    
    // Remove last separator
    if (keyboard.length > 0) keyboard.pop();
    
  } else {
    // Simple switch interface
    projects.forEach(project => {
      keyboard.push([{ 
        text: `${project.name}${project.is_active ? ' ✅' : ''}`, 
        callback_data: `${action}_project:${project.id}` 
      }]);
    });
  }
  
  // Add "New project" button for PRO users or if no projects exist
  if ((action === 'switch' || action === 'manage') && (isPremium || projects.length === 0)) {
    keyboard.push([{ 
      text: '➕ Новый проект', 
      callback_data: 'create_project' 
    }]);
  }
  
  return { inline_keyboard: keyboard };
}


function getSettingsKeyboard(isPremium = false) {
  const keyboard = [
    [{ text: '💱 Валюта', callback_data: 'settings:currency' }],
    [{ text: '📊 Экспорт данных', callback_data: 'settings:export' }]
  ];
  
  if (isPremium) {
    keyboard.push([{ text: '📂 Мои категории', callback_data: 'settings:categories' }]);
  } else {
    keyboard.push([{ text: '💎 Обновить до PRO', callback_data: 'upgrade:info' }]);
  }
  
  // Add clear data button for all users
  keyboard.push([{ text: '🗑️ Очистить все данные', callback_data: 'settings:clear_data' }]);
  
  return { inline_keyboard: keyboard };
}

function getUpgradeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '💎 1 месяц (250 ⭐)', callback_data: 'upgrade:pro_month' }
      ],
      [
        { text: '💎 6 месяцев (1200 ⭐) 🔥', callback_data: 'upgrade:pro_6months' },
        { text: '💎 1 год (2000 ⭐) 🔥🔥', callback_data: 'upgrade:pro_year' }
      ],
      [
        { text: '📋 Сравнить планы', callback_data: 'upgrade:compare' }
      ],
      [
        { text: '❓ Вопросы', callback_data: 'upgrade:faq' }
      ]
    ]
  };
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

module.exports = {
  getExpenseConfirmationKeyboard,
  getIncomeConfirmationKeyboard,
  getCategorySelectionKeyboard,
  getIncomeCategorySelectionKeyboard,
  getIncomeProjectSelectionKeyboard,
  getAmountSelectionKeyboard,
  getProjectSelectionKeyboard,
  getProjectSelectionKeyboardForExpense,
  getSettingsKeyboard,
  getUpgradeKeyboard,
  getConfirmationKeyboard,
  getPaginationKeyboard,
  getExportFormatKeyboard,
  getExportPeriodKeyboard
};