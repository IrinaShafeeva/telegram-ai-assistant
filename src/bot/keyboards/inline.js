const { DEFAULT_CATEGORIES } = require('../../config/constants');

function getExpenseConfirmationKeyboard(expenseId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Сохранить', callback_data: `save_expense:${expenseId}` },
        { text: '✏️ Категория', callback_data: `edit_category:${expenseId}` }
      ],
      [
        { text: '💰 Сумма', callback_data: `edit_amount:${expenseId}` },
        { text: '📝 Описание', callback_data: `edit_description:${expenseId}` }
      ],
      [
        { text: '❌ Отменить', callback_data: `cancel_expense:${expenseId}` }
      ]
    ]
  };
}

function getCategorySelectionKeyboard(expenseId, customCategories = []) {
  const categories = [...DEFAULT_CATEGORIES, ...customCategories.map(c => `${c.emoji} ${c.name}`)];
  const keyboard = [];
  
  // Split categories into rows of 2
  for (let i = 0; i < categories.length; i += 2) {
    const row = [];
    row.push({ 
      text: categories[i], 
      callback_data: `set_category:${expenseId}:${categories[i].split(' ').slice(1).join(' ')}` 
    });
    
    if (categories[i + 1]) {
      row.push({ 
        text: categories[i + 1], 
        callback_data: `set_category:${expenseId}:${categories[i + 1].split(' ').slice(1).join(' ')}` 
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

function getAmountSelectionKeyboard(expenseId) {
  return {
    inline_keyboard: [
      [
        { text: '100', callback_data: `set_amount:${expenseId}:100` },
        { text: '200', callback_data: `set_amount:${expenseId}:200` },
        { text: '500', callback_data: `set_amount:${expenseId}:500` }
      ],
      [
        { text: '1000', callback_data: `set_amount:${expenseId}:1000` },
        { text: '2000', callback_data: `set_amount:${expenseId}:2000` },
        { text: '5000', callback_data: `set_amount:${expenseId}:5000` }
      ],
      [
        { text: '✏️ Ввести свою', callback_data: `custom_amount:${expenseId}` }
      ],
      [
        { text: '⬅️ Назад', callback_data: `back_to_confirmation:${expenseId}` }
      ]
    ]
  };
}

function getProjectSelectionKeyboard(projects, action = 'switch', isPremium = false) {
  const keyboard = [];
  
  projects.forEach(project => {
    keyboard.push([{ 
      text: `${project.name}${project.is_active ? ' ✅' : ''}`, 
      callback_data: `${action}_project:${project.id}` 
    }]);
  });
  
  // Only show "New project" button for PRO users or if no projects exist
  if (action === 'switch' && (isPremium || projects.length === 0)) {
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

module.exports = {
  getExpenseConfirmationKeyboard,
  getCategorySelectionKeyboard,
  getAmountSelectionKeyboard,
  getProjectSelectionKeyboard,
  getSettingsKeyboard,
  getUpgradeKeyboard,
  getConfirmationKeyboard,
  getPaginationKeyboard
};