function getMainMenuKeyboard() {
  return {
    keyboard: [
      ['📋 Проекты', '💎 PRO план'],
      ['⚙️ Настройки', 'ℹ️ Помощь']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

function getCurrencyKeyboard() {
  return {
    keyboard: [
      ['RUB 🇷🇺', 'USD 🇺🇸', 'EUR 🇪🇺'],
      ['GBP 🇬🇧', 'JPY 🇯🇵', 'CNY 🇨🇳'],
      ['KZT 🇰🇿', 'UAH 🇺🇦']
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function getLanguageKeyboard() {
  return {
    keyboard: [
      ['🇷🇺 Русский', '🇺🇸 English'],
      ['🇰🇿 Қазақша', '🇺🇦 Українська']
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function getQuickAmountKeyboard() {
  return {
    keyboard: [
      ['100', '200', '500'],
      ['1000', '2000', '5000'],
      ['✏️ Ввести свою сумму']
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function getCancelKeyboard() {
  return {
    keyboard: [['❌ Отменить']],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

module.exports = {
  getMainMenuKeyboard,
  getCurrencyKeyboard,
  getLanguageKeyboard,
  getQuickAmountKeyboard,
  getCancelKeyboard
};