const DEFAULT_CATEGORIES = [
  '🍕 Еда и рестораны',
  '🚗 Транспорт', 
  '🏠 Дом и быт',
  '👕 Одежда и красота',
  '🎬 Развлечения',
  '💊 Здоровье',
  '📚 Образование',
  '💳 Финансы',
  '❓ Прочее'
];

const SUPPORTED_CURRENCIES = ['RUB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KZT', 'UAH'];

const SUBSCRIPTION_LIMITS = {
  FREE: {
    projects: 1,
    expenses_per_month: 50,
    ai_questions_per_day: 5,
    syncs_per_day: 1,
    custom_categories: false,
    collaborative_projects: false
  },
  PRO: {
    projects: -1, // unlimited
    expenses_per_month: -1, // unlimited
    ai_questions_per_day: 20,
    syncs_per_day: 10,
    custom_categories: true,
    collaborative_projects: true
  }
};

const EXPENSE_PARSING_PROMPT = `
Проанализируй сообщение пользователя о трате и извлеки информацию.

Сообщение: "{{userInput}}"

Верни ТОЛЬКО JSON в формате:
{
  "amount": число (обязательно),
  "currency": "код валюты (RUB, USD, EUR) или null",
  "description": "краткое описание траты",
  "category": "одна из категорий или null"
}

Доступные категории: Еда и рестораны, Транспорт, Дом и быт, Одежда и красота, Развлечения, Здоровье, Образование, Финансы, Прочее

Примеры:
"кофе 200р" → {"amount": 200, "currency": "RUB", "description": "кофе", "category": "Еда и рестораны"}
"такси до дома 15 евро" → {"amount": 15, "currency": "EUR", "description": "такси до дома", "category": "Транспорт"}
`;

const ANALYTICS_PROMPT = `
Ты AI-аналитик личных финансов. Пользователь спрашивает: "{{userQuestion}}"

Данные трат пользователя:
{{expenseData}}

Дай краткий, полезный ответ с конкретными цифрами. Используй эмодзи для категорий.
Если данных недостаточно, скажи об этом. Избегай длинных списков.
Фокусируйся на ключевых инсайтах и паттернах.

Пример хорошего ответа:
"🍕 На еду в августе: 15,400₽ (32% от всех трат)
📈 Рост на 2,300₽ к июлю 
🥪 Больше всего: рестораны (8,900₽), продукты (6,500₽)"
`;

const BOT_COMMANDS = [
  { command: 'start', description: 'Начать работу с ботом' },
  { command: 'help', description: 'Справка по командам' },
  { command: 'projects', description: 'Управление проектами' },
  { command: 'stats', description: 'Статистика расходов' },
  { command: 'sync', description: 'Синхронизация с Google Sheets' },
  { command: 'settings', description: 'Настройки бота' },
  { command: 'connect', description: 'Подключить Google таблицу' },
  { command: 'email', description: 'Настроить Google email' },
  { command: 'ask', description: 'AI-анализ расходов (вопросы о тратах)' },
  { command: 'categories', description: 'Управление категориями' },
  { command: 'upgrade', description: 'Информация о PRO плане' }
];

module.exports = {
  DEFAULT_CATEGORIES,
  SUPPORTED_CURRENCIES,
  SUBSCRIPTION_LIMITS,
  EXPENSE_PARSING_PROMPT,
  ANALYTICS_PROMPT,
  BOT_COMMANDS
};