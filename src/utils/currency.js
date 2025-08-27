const CURRENCY_SYMBOLS = {
  'RUB': '₽',
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'CNY': '¥',
  'KZT': '₸',
  'UAH': '₴'
};

const CURRENCY_NAMES = {
  'RUB': 'Российский рубль',
  'USD': 'Доллар США',
  'EUR': 'Евро',
  'GBP': 'Британский фунт',
  'JPY': 'Японская йена',
  'CNY': 'Китайский юань',
  'KZT': 'Казахстанский тенге',
  'UAH': 'Украинская гривна'
};

function formatCurrency(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formattedAmount = new Intl.NumberFormat('ru-RU').format(amount);
  
  // For some currencies, symbol goes before amount
  if (currency === 'USD' || currency === 'GBP' || currency === 'EUR') {
    return `${symbol}${formattedAmount}`;
  }
  
  // For others, symbol goes after
  return `${formattedAmount} ${symbol}`;
}

function formatMultiCurrencyAmount(expenses) {
  const grouped = expenses.reduce((acc, expense) => {
    acc[expense.currency] = (acc[expense.currency] || 0) + parseFloat(expense.amount);
    return acc;
  }, {});
  
  return Object.entries(grouped)
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(', ');
}

function getCurrencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] || currency;
}

function getCurrencyName(currency) {
  return CURRENCY_NAMES[currency] || currency;
}

function parseCurrencyFromText(text) {
  const textLower = text.toLowerCase();
  
  // Check for currency symbols
  if (textLower.includes('₽') || textLower.includes('руб')) return 'RUB';
  if (textLower.includes('$') || textLower.includes('долл')) return 'USD';
  if (textLower.includes('€') || textLower.includes('евро')) return 'EUR';
  if (textLower.includes('£') || textLower.includes('фунт')) return 'GBP';
  if (textLower.includes('¥') || textLower.includes('йен') || textLower.includes('юан')) {
    // Need more context to distinguish JPY from CNY
    return textLower.includes('юан') ? 'CNY' : 'JPY';
  }
  if (textLower.includes('₸') || textLower.includes('тенге')) return 'KZT';
  if (textLower.includes('₴') || textLower.includes('грив')) return 'UAH';
  
  return null;
}

function validateCurrency(currency) {
  return Object.keys(CURRENCY_SYMBOLS).includes(currency);
}

module.exports = {
  formatCurrency,
  formatMultiCurrencyAmount,
  getCurrencySymbol,
  getCurrencyName,
  parseCurrencyFromText,
  validateCurrency,
  CURRENCY_SYMBOLS,
  CURRENCY_NAMES
};