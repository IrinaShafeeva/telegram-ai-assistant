const FOOD_KEYWORDS = [
  'еда', 'продукт', 'продукты', 'мясо', 'курица', 'рыба', 'говядина', 'свинина',
  'фарш', 'колбас', 'сыр', 'молоко', 'йогурт', 'кефир', 'творог', 'яйца',
  'хлеб', 'булк', 'выпеч', 'кофе', 'чай', 'кафе', 'ресторан', 'обед', 'ужин',
  'завтрак', 'овощ', 'фрукт', 'ягод', 'салат', 'суп', 'пицц', 'бургер',
  'доставка еды', 'слад', 'шоколад'
];

const TRANSPORT_KEYWORDS = ['такси', 'транспорт', 'метро', 'автобус', 'бензин', 'топливо', 'парков'];
const HEALTH_KEYWORDS = ['аптека', 'лекар', 'врач', 'клиник', 'медиц', 'анализ'];
const HOME_KEYWORDS = ['дом', 'быт', 'хоз', 'уборк', 'ремонт', 'мебел'];

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е');
}

function keywordMatch(text, keywords) {
  const normalized = normalizeText(text);
  return keywords.some(keyword => normalized.includes(normalizeText(keyword)));
}

function normalizeCategoryFromText(text, currentCategory = null) {
  if (keywordMatch(text, FOOD_KEYWORDS)) return 'Еда';
  if (keywordMatch(text, TRANSPORT_KEYWORDS)) return 'Транспорт';
  if (keywordMatch(text, HEALTH_KEYWORDS)) return 'Здоровье';
  if (keywordMatch(text, HOME_KEYWORDS)) return 'Дом и быт';
  return currentCategory;
}

function hasExplicitCurrencyMarker(text, currency = null) {
  const normalized = normalizeText(text);
  const markers = {
    RUB: ['руб', 'рубл', '₽', 'rub', 'rur'],
    EUR: ['евро', 'eur', '€'],
    USD: ['доллар', 'долларов', 'бакс', 'usd', '$'],
    UAH: ['грив', 'грн', 'uah', '₴'],
    GBP: ['фунт', 'gbp', '£'],
    KZT: ['тенге', 'kzt', '₸']
  };

  if (currency && markers[currency]) {
    return markers[currency].some(marker => normalized.includes(normalizeText(marker)));
  }

  return Object.values(markers)
    .flat()
    .some(marker => normalized.includes(normalizeText(marker)));
}

function hasExplicitTransactionSeparator(text) {
  const value = String(text || '');
  if (/[\n;]/.test(value)) return true;
  if (/\b(потом|затем|еще|ещё)\b/i.test(value)) return true;
  const amountCount = (value.match(/\d+(?:[.,]\d+)?/g) || []).length;
  return amountCount >= 2;
}

function shouldCollapseAiSplit(originalText, transactions) {
  if (!Array.isArray(transactions) || transactions.length <= 1) return false;
  if (hasExplicitTransactionSeparator(originalText)) return false;

  const normalized = normalizeText(originalText);
  if (!/\sи\s/.test(normalized)) return false;

  const amountCount = (normalized.match(/\d+(?:[.,]\d+)?/g) || []).length;
  return amountCount <= 1;
}

function collapseSplitTransactions(originalText, transactions, userContext = {}) {
  if (!shouldCollapseAiSplit(originalText, transactions)) return transactions;

  const first = transactions[0] || {};
  const amountMatch = String(originalText || '').match(/\d+(?:[.,]\d+)?/);
  const amount = amountMatch ? parseFloat(amountMatch[0].replace(',', '.')) : first.amount;
  const description = String(originalText || first.description || 'Расход')
    .replace(amountMatch?.[0] || '', ' ')
    .replace(/\b(рублей|рубля|рубль|руб|евро|долларов|доллара|доллар|гривен|гривна|грн|eur|usd|rub|uah)\b/gi, ' ')
    .replace(/[€$₽₴£₸]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [{
    ...first,
    type: first.type || 'expense',
    amount,
    currency: first.currency || userContext.primaryCurrency || null,
    description: description ? description.charAt(0).toUpperCase() + description.slice(1) : (first.description || 'Расход'),
    category: normalizeCategoryFromText(originalText, first.category),
    project: first.project || userContext.defaultProjectName || null
  }];
}

module.exports = {
  normalizeCategoryFromText,
  hasExplicitCurrencyMarker,
  collapseSplitTransactions
};
