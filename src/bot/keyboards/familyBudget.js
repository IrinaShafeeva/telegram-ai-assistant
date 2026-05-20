function listRowKeyboard(listType, itemId) {
  return {
    inline_keyboard: [
      [
        { text: '✏️', callback_data: `fb:edit:${listType}:${itemId}` },
        { text: '🗑', callback_data: `fb:del:${listType}:${itemId}` }
      ]
    ]
  };
}

function listsMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📤 Обязательные платежи', callback_data: 'fb:list:payments' }],
      [{ text: '📥 Ожидаемые доходы', callback_data: 'fb:list:incomes' }],
      [{ text: '🏦 Долги', callback_data: 'fb:list:debts' }],
      [{ text: '🔙 Закрыть', callback_data: 'fb:close' }]
    ]
  };
}

function listActionsKeyboard(listType) {
  return {
    inline_keyboard: [
      [{ text: '➕ Добавить', callback_data: `fb:add:${listType}` }],
      [{ text: '🔙 К спискам', callback_data: 'fb:lists' }]
    ]
  };
}

function realityActionsKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '💫 Добавить плавающий доход', callback_data: 'fb:float:add' }],
      [{ text: '➕ Пополнить долг', callback_data: 'fb:debt:topup' }],
      [{ text: '👫 Пригласить партнёра', callback_data: 'fb:invite' }],
      [{ text: '📝 Мои списки', callback_data: 'fb:lists' }]
    ]
  };
}

function updateBroadcastKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '👨‍👩‍👧 Создать семейный бюджет', callback_data: 'fb:create' }],
      [{ text: 'Может быть позже', callback_data: 'fb:update:later' }]
    ]
  };
}

function confirmDeleteKeyboard(listType, itemId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Да', callback_data: `fb:delok:${listType}:${itemId}` },
        { text: '❌ Нет', callback_data: `fb:delno:${listType}:${itemId}` }
      ]
    ]
  };
}

function onboardingSkipKeyboard(step) {
  return {
    inline_keyboard: [
      [{ text: '⏭ Пропустить шаг', callback_data: `fb:onb:skip:${step}` }],
      [{ text: '➕ Добавить ещё', callback_data: `fb:onb:more:${step}` }],
      [{ text: 'Дальше →', callback_data: `fb:onb:next:${step}` }]
    ]
  };
}

module.exports = {
  listRowKeyboard,
  listsMenuKeyboard,
  listActionsKeyboard,
  realityActionsKeyboard,
  updateBroadcastKeyboard,
  confirmDeleteKeyboard,
  onboardingSkipKeyboard
};
