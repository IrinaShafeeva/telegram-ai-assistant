function listRowKeyboard(listType, itemId) {
  return {
    inline_keyboard: [
      [
        { text: '✏️', callback_data: `fb:editpick:${listType}:${itemId}` },
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
      [{ text: '🧭 Недельные ориентиры', callback_data: 'fb:list:guides' }],
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

function plannedOccurrenceKeyboard(eventId, itemType) {
  const doneText = itemType === 'income' ? '✅ Пришло' : '✅ Оплачено';
  return {
    inline_keyboard: [
      [{ text: doneText, callback_data: `fb:occ:done:${eventId}` }],
      [
        { text: '⏰ Завтра', callback_data: `fb:occ:postpone:${eventId}:tomorrow` },
        { text: '+3 дня', callback_data: `fb:occ:postpone:${eventId}:3d` }
      ],
      [
        { text: '📅 Выбрать дату', callback_data: `fb:occ:postpone:${eventId}:date` },
        { text: 'След. месяц', callback_data: `fb:occ:postpone:${eventId}:next_month` }
      ]
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
      [{ text: 'Дальше →', callback_data: `fb:onb:next:${step}` }],
      [{ text: '👫 Пригласить партнёра', callback_data: 'fb:invite' }]
    ]
  };
}

function partnerPlanReviewKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✏️ Редактировать план', callback_data: 'fb:lists' }],
      [{ text: '📝 Заполнить / дополнить опросник', callback_data: 'fb:onb:start' }],
      [{ text: '👫 Пригласить партнёра', callback_data: 'fb:invite' }],
      [{ text: '📊 Реальность месяца', callback_data: 'fb:reality' }]
    ]
  };
}

function editFieldKeyboard(listType, itemId) {
  const rows = [
    [
      { text: '💰 Сумма', callback_data: `fb:editf:${listType}:${itemId}:amount` },
      { text: '📝 Название', callback_data: `fb:editf:${listType}:${itemId}:title` }
    ]
  ];
  if (listType !== 'debts') {
    rows.push([{ text: '📅 День месяца', callback_data: `fb:editf:${listType}:${itemId}:day` }]);
  }
  if (listType === 'guides') {
    rows.splice(1, 1, [{ text: '🏷 Категории', callback_data: `fb:editf:${listType}:${itemId}:categories` }]);
  }
  rows.push([{ text: '🔙 Назад', callback_data: `fb:list:${listType}` }]);
  return { inline_keyboard: rows };
}

function monthlyReviewKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Простроить план на месяц', callback_data: 'fb:onb:start' }],
      [{ text: '✏️ Редактировать план', callback_data: 'fb:lists' }],
      [{ text: '✅ План на месяц готов', callback_data: 'fb:month:done' }]
    ]
  };
}

module.exports = {
  listRowKeyboard,
  listsMenuKeyboard,
  listActionsKeyboard,
  plannedOccurrenceKeyboard,
  realityActionsKeyboard,
  updateBroadcastKeyboard,
  confirmDeleteKeyboard,
  onboardingSkipKeyboard,
  partnerPlanReviewKeyboard,
  editFieldKeyboard,
  monthlyReviewKeyboard
};
