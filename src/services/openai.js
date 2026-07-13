const OpenAI = require('openai');
const FormData = require('form-data');
const axios = require('axios');
const { EXPENSE_PARSING_PROMPT, ANALYTICS_PROMPT } = require('../config/constants');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 30000
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientOpenAIError(error) {
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
  return (
    error?.status === 408 ||
    error?.status === 409 ||
    error?.status === 429 ||
    (error?.status >= 500 && error?.status < 600) ||
    error?.code === 'ECONNRESET' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ENOTFOUND' ||
    error?.name === 'APIConnectionError' ||
    error?.name === 'APIConnectionTimeoutError' ||
    message.includes('premature close') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('timeout')
  );
}

function friendlyOpenAIError(error, fallback = 'AI временно недоступен. Попробуйте ещё раз через минуту.') {
  if (isTransientOpenAIError(error)) {
    return fallback;
  }
  return 'Не удалось обработать запись. Попробуйте написать чуть проще.';
}

function detectCurrency(text, primaryCurrency = 'RUB') {
  const normalized = String(text || '').toLowerCase();
  if (/(евро|eur|€)/i.test(normalized)) return 'EUR';
  if (/(доллар|долларов|бакс|usd|\$)/i.test(normalized)) return 'USD';
  if (/(грив|грн|uah|₴)/i.test(normalized)) return 'UAH';
  if (/(фунт|gbp|£)/i.test(normalized)) return 'GBP';
  if (/(тенге|kzt|₸)/i.test(normalized)) return 'KZT';
  if (/(руб|рубл|rur|rub|₽)/i.test(normalized)) return 'RUB';
  return primaryCurrency;
}

function parseAmountFromText(text) {
  const amountMatch = String(text || '').match(/(?:^|[^\d])(\d+(?:[\s\u00A0]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?:[^\d]|$)/);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/[\s\u00A0]/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    amount,
    raw: amountMatch[1]
  };
}

function detectTransactionType(text) {
  const normalized = String(text || '').toLowerCase();
  if (/(получил|получила|пришло|зачисл|доход|зарплат|оплатили|перевели|продал|продала)/i.test(normalized)) {
    return 'income';
  }
  return 'expense';
}

function cleanupSimpleDescription(text, amountRaw) {
  let description = String(text || '')
    .replace(amountRaw, ' ')
    .replace(/\b(рублей|рубля|рубль|руб|rub|rur|евро|eur|долларов|доллара|доллар|usd|баксов|бакс|гривен|гривны|гривна|грн|uah|фунтов|фунт|gbp|тенге|kzt)\b/gi, ' ')
    .replace(/[€$₽₴£₸]/g, ' ')
    .replace(/\b(потратил|потратила|купил|купила|оплатил|оплатила|расход|трата|на|за|получил|получила|пришло)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description) description = 'Расход';
  return description.charAt(0).toUpperCase() + description.slice(1);
}

function parseSimpleTransactionFallback(userInput, userContext = {}) {
  const amountInfo = parseAmountFromText(userInput);
  if (!amountInfo) return null;

  const primaryCurrency = userContext.primaryCurrency || 'RUB';
  const type = detectTransactionType(userInput);
  const description = cleanupSimpleDescription(userInput, amountInfo.raw);

  return {
    type,
    amount: amountInfo.amount,
    currency: detectCurrency(userInput, primaryCurrency),
    description,
    category: null,
    project: userContext.defaultProjectName || null
  };
}

async function createChatCompletionWithRetry(params, label) {
  const attempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await openai.chat.completions.create(params);
    } catch (error) {
      lastError = error;
      if (!isTransientOpenAIError(error) || attempt === attempts) break;
      const delayMs = 500 * attempt;
      logger.warn(`${label} transient OpenAI error, retry ${attempt}/${attempts}: ${error.message}`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

class OpenAIService {
  async transcribeVoice(audioBuffer, mimeType = 'audio/ogg') {
    try {
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'voice.ogg',
        contentType: mimeType,
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'ru');

      const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
      });

      return response.data.text;
    } catch (error) {
      logger.error('Voice transcription failed:', error);
      throw new Error('Не удалось распознать голосовое сообщение');
    }
  }

  async parseExpense(userInput) {
    try {
      let prompt = EXPENSE_PARSING_PROMPT.replace('{{userInput}}', userInput);

      const completion = await createChatCompletionWithRetry({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Ты помощник по анализу трат. Возвращай только валидный JSON без дополнительных комментариев.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      }, 'parseExpense');

      const result = completion.choices[0].message.content.trim();
      
      // Remove markdown code blocks if present
      const cleanResult = result.replace(/```json\n?|\n?```/g, '');
      
      try {
        const parsed = JSON.parse(cleanResult);
        
        // Validate required fields
        if (!parsed.amount || isNaN(parsed.amount)) {
          throw new Error('Invalid amount');
        }
        
        // Clean and validate data
        return {
          amount: parseFloat(parsed.amount),
          currency: parsed.currency || null,
          description: parsed.description || 'Расход',
          category: parsed.category || null
        };
      } catch (parseError) {
        logger.error('Failed to parse OpenAI response:', result);
        throw new Error('Не удалось понять сумму расхода. Попробуйте написать яснее.');
      }
    } catch (error) {
      logger.error('Expense parsing failed:', error);
      if (isTransientOpenAIError(error)) {
        const fallback = parseSimpleTransactionFallback(userInput);
        if (fallback && fallback.type === 'expense') {
          logger.warn(`Using simple fallback parser for expense: ${JSON.stringify(fallback)}`);
          return {
            amount: fallback.amount,
            currency: fallback.currency,
            description: fallback.description,
            category: fallback.category
          };
        }
      }
      throw new Error(friendlyOpenAIError(error, 'AI временно не ответил. Попробуйте отправить запись ещё раз через минуту.'));
    }
  }

  async parseTransaction(userInput, userContext = {}) {
    try {
      const { categories = [], projects = [], primaryCurrency = 'RUB', defaultProjectName } = userContext;
      // Project used when no keyword matches. Configurable per user
      // (users.default_project_id); falls back to the personal project name.
      const defaultProject = (defaultProjectName && defaultProjectName.trim())
        ? defaultProjectName.trim()
        : 'Личные траты';

      // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ КОНТЕКСТА
      logger.info(`🧠 AI parsing transaction: "${userInput}"`);
      logger.info(`📊 User context - Projects: ${JSON.stringify(projects)}`);
      logger.info(`📂 User context - Categories: ${JSON.stringify(categories)}`);

      // Форматируем пользовательский контекст для промпта
      let contextPrompt = '';
      if (projects.length > 0 || categories.length > 0) {
        contextPrompt = `
ПОЛЬЗОВАТЕЛЬСКИЙ КОНТЕКСТ (высший приоритет при выборе):

`;
        if (projects.length > 0) {
          contextPrompt += `ПОЛЬЗОВАТЕЛЬСКИЕ ПРОЕКТЫ:
${projects.map(p => `- ${p.name}: ${p.keywords}`).join('\n')}

`;
        }

        if (categories.length > 0) {
          contextPrompt += `ПОЛЬЗОВАТЕЛЬСКИЕ КАТЕГОРИИ:
${categories.map(c => `- ${c.name}: ${c.keywords}`).join('\n')}

`;
        }
      }

      logger.info(`📝 Context prompt for AI:\n${contextPrompt}`);

      const prompt = `
Определи транзакции из текста пользователя и извлеки информацию.

Текст: "${userInput}"

${contextPrompt}ВАЖНО: Если в тексте несколько транзакций (разделены переносами строк, точками с запятой, или перечислены через запятую) - верни массив транзакций.
Если одна транзакция - верни массив с одним элементом.

Верни JSON в точном формате:
[
  {
    "type": "income" | "expense",
    "amount": число,
    "currency": "RUB" | "USD" | "EUR" | null,
    "description": "описание транзакции",
    "category": "категория" | null,
    "project": "проект" | null
  }
]

Правила категоризации:
1. СНАЧАЛА ищи совпадения в пользовательских категориях и проектах по ключевым словам
2. Учитывай падежи, синонимы, контекст при поиске ключевых слов
3. Если не найдешь совпадения - используй стандартные категории
4. type: "income" для доходов, "expense" для расходов
5. amount: только число без валюты
6. currency: определи из контекста или используй "${primaryCurrency}" по умолчанию
7. description: краткое описание на русском
8. category: ТОЧНОЕ название из пользовательских или стандартных категорий
9. project: Если есть прямое совпадение с ключевыми словами - название проекта, иначе используй дефолтный проект ("${defaultProject}")
10. Кэшбэк, возврат, refund, компенсация без явных слов "пришло/получил/зачислили" считай расходом, а не доходом.

ВАЖНО ДЛЯ ПРОЕКТОВ:
- Если в тексте есть ключевые слова конкретного проекта - назначай этот проект
- Если НЕТ совпадений с ключевыми словами проектов - используй дефолтный проект "${defaultProject}" из списка
- Дефолтный проект пользователя: "${defaultProject}"
- НЕ оставляй project как null
- Для записей про кэшбэк/возврат/компенсацию используй дефолтный проект "${defaultProject}", если в тексте явно не написано название другого проекта

РАСПОЗНАВАНИЕ ВАЛЮТ (учитывай все варианты написания и склонения):
- RUB: рубль, рублей, рублям, рублями, рублях, руб, р, ₽
- USD: доллар, долларов, долларам, долларами, долларах, бакс, $
- EUR: евро, €
- UAH: гривна, гривен, гривны, гривнам, гривнами, гривнах, грн, ₴
- GBP: фунт, фунтов, фунтам, фунтами, фунтах, £
- KZT: тенге, ₸

ВАЖНО: Обращай особое внимание на украинские гривны - "гривен", "гривна", "гривны" = UAH

Стандартные категории для fallback:
Доходы: Зарплата, Фриланс, Продажи, Прочие доходы
Расходы: Еда, Транспорт, Развлечения, Здоровье, Покупки, Прочее

Примеры:
Если в контексте проекты: [{"name": "Личные расходы"}, {"name": "RentaCar"}]
"Получил зарплату 50000" → {"type": "income", "amount": 50000, "currency": "RUB", "description": "Зарплата", "category": "Зарплата", "project": "Личные расходы"}
"Потратил 200 на кофе" → {"type": "expense", "amount": 200, "currency": "RUB", "description": "Кофе", "category": "Еда", "project": "Личные расходы"}
"Обед в ресторане 1500" (нет совпадений, используем дефолтный) → {"type": "expense", "amount": 1500, "currency": "RUB", "description": "Обед в ресторане", "category": "Еда", "project": "Личные расходы"}

Если в контексте проекты: [{"name": "Личные траты"}, {"name": "Работа"}]
"135 гривен продукты" → {"type": "expense", "amount": 135, "currency": "UAH", "description": "Продукты", "category": "Еда", "project": "Личные траты"}
"50 долларов такси" → {"type": "expense", "amount": 50, "currency": "USD", "description": "Такси", "category": "Транспорт", "project": "Личные траты"}

"Расходы на аренду машины 5000" (если "RentaCar" имеет ключевые слова "аренда, машина") → {"type": "expense", "amount": 5000, "currency": "RUB", "description": "Аренда машины", "category": "Транспорт", "project": "RentaCar"}
`;

      const completion = await createChatCompletionWithRetry({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Ты помощник по анализу финансовых транзакций. Возвращай только валидный JSON без дополнительных комментариев.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000
      }, 'parseTransaction');

      const result = completion.choices[0].message.content.trim();
      logger.info(`🤖 AI raw response: ${result}`);

      // Remove markdown code blocks if present
      const cleanResult = result.replace(/```json\n?|\n?```/g, '');

      try {
        const parsed = JSON.parse(cleanResult);
        logger.info(`✅ AI parsed result: ${JSON.stringify(parsed)}`);

        // Ensure we have an array
        const transactions = Array.isArray(parsed) ? parsed : [parsed];

        // Validate and process each transaction
        const processedTransactions = transactions.map((transaction, index) => {
          if (!transaction.amount || isNaN(transaction.amount)) {
            throw new Error(`Invalid amount in transaction ${index + 1}`);
          }

          if (!['income', 'expense'].includes(transaction.type)) {
            throw new Error(`Invalid transaction type in transaction ${index + 1}`);
          }

          return {
            type: transaction.type,
            amount: parseFloat(transaction.amount),
            currency: transaction.currency || null,
            description: transaction.description || (transaction.type === 'income' ? 'Доход' : 'Расход'),
            category: transaction.category || null,
            project: transaction.project || null
          };
        });

        logger.info(`🎯 Final AI result (${processedTransactions.length} transactions): ${JSON.stringify(processedTransactions)}`);

        // For backward compatibility, return single transaction if only one
        return processedTransactions.length === 1 ? processedTransactions[0] : processedTransactions;
        
      } catch (parseError) {
        logger.error('JSON parsing failed:', parseError, 'Raw result:', cleanResult);
        throw new Error('parsing');
      }

    } catch (error) {
      logger.error('Transaction parsing failed:', error);
      if (error?.message === 'parsing') {
        throw new Error('Не удалось понять запись. Попробуйте написать проще, например: "кофе 15 евро".');
      }
      if (isTransientOpenAIError(error)) {
        const fallback = parseSimpleTransactionFallback(userInput, userContext);
        if (fallback) {
          logger.warn(`Using simple fallback parser for transaction: ${JSON.stringify(fallback)}`);
          return fallback;
        }
      }
      throw new Error(friendlyOpenAIError(error, 'AI временно не ответил. Попробуйте отправить запись ещё раз через минуту.'));
    }
  }

  async analyzeExpenses(userQuestion, expensesData, userId) {
    try {
      // Prepare expense data for context
      const expenseContext = expensesData.map(exp => 
        `${exp.expense_date}: ${exp.description} - ${exp.amount} ${exp.currency} (${exp.category})`
      ).join('\n');

      const prompt = ANALYTICS_PROMPT
        .replace('{{userQuestion}}', userQuestion)
        .replace('{{expenseData}}', expenseContext || 'Нет данных о расходах');

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Ты AI-аналитик личных финансов. Давай краткие, полезные ответы с конкретными цифрами и инсайтами. Используй эмодзи для категорий.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      return completion.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Expense analysis failed:', error);
      throw new Error('Не удалось проанализировать расходы. Попробуйте позже.');
    }
  }

  async analyzeExpensesWithData(userQuestion, analyticsData, userId) {
    try {
      const categoryList = analyticsData.categoryBreakdown
        .map(cat => `${cat.category}: ${cat.formatted} (${cat.percentage}%)`)
        .join('\n');
      
      const monthlyList = analyticsData.monthlyBreakdown
        .map(month => `${month.month}: ${month.formatted}`)
        .join('\n');

      const prompt = `Пользователь спрашивает: "${userQuestion}"

ТОЧНЫЕ ДАННЫЕ (уже рассчитанные):
💰 Общая сумма: ${analyticsData.totalAmount}
📊 Количество трат: ${analyticsData.totalExpenses}
🏆 Топ категория: ${analyticsData.topCategory}
📈 Среднее в день: ${analyticsData.averagePerDay}

📋 По категориям:
${categoryList}

📅 По месяцам:
${monthlyList}

ВАЖНО: 
- Используй ТОЛЬКО эти точные цифры, не выдумывай другие
- Все суммы уже в валюте ${analyticsData.primaryCurrency}
- Проценты уже рассчитаны правильно
- Топ категория определена корректно: "${analyticsData.topCategory}"

Дай краткий полезный ответ с конкретными цифрами. Используй эмодзи для категорий.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Ты AI-аналитик личных финансов. Используй ТОЛЬКО предоставленные точные данные. Не выдумывай цифры.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2, // Lower temperature for more accurate responses
        max_tokens: 500
      });

      return completion.choices[0].message.content.trim();

    } catch (error) {
      logger.error('OpenAI analytics with data failed:', error);
      throw new Error('Не удалось проанализировать расходы. Попробуйте позже.');
    }
  }

  async analyzeExpensesWithFlexibleData(userQuestion, analyticsData, userId) {
    try {
      const categoryList = analyticsData.categoryBreakdown
        .map(cat => `${cat.category}: ${cat.formatted} (${cat.percentage}%)`).join('\\n');
      
      const monthlyList = analyticsData.monthlyBreakdown
        .map(month => `${month.month}: ${month.formatted}`).join('\\n');

      // Prepare detailed expense list for specific queries
      const expensesList = analyticsData.detailedExpenses
        .slice(0, 100) // Limit to avoid token overflow
        .map(exp => `${exp.date}: ${exp.description} - ${exp.amount} ${exp.currency} (${exp.category})`)
        .join('\\n');

      const prompt = `Пользователь спрашивает: "${userQuestion}"

АГРЕГИРОВАННЫЕ ДАННЫЕ (уже точно рассчитанные):
💰 Общая сумма: ${analyticsData.totalAmount}
📊 Количество трат: ${analyticsData.totalExpenses}  
🏆 Топ категория: ${analyticsData.topCategory}
📈 Среднее в день: ${analyticsData.averagePerDay}

📋 По категориям:
${categoryList}

📅 По месяцам:
${monthlyList}

ДЕТАЛЬНЫЕ ТРАТЫ (для поиска по описанию, местам, датам):
${expensesList}

ИНСТРУКЦИИ:
1. Если вопрос о суммах/статистике - используй ТОЛЬКО агрегированные данные
2. Если нужно найти траты по описанию/месту - ищи в детальных тратах  
3. ВАЖНО: Ищи по ТОЧНОМУ описанию! "вкусняшки" ≠ "еда", смотри описания трат!
4. Все суммы уже в валюте ${analyticsData.primaryCurrency}
5. НЕ выдумывай цифры, используй только предоставленные данные
6. При поиске по ключевому слову (например "вкусняшки") ищи ИМЕННО это слово в описаниях

Дай точный ответ с конкретными цифрами. Используй эмодзи для категорий.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Ты AI-аналитик личных финансов. Используй агрегированные данные для статистики, детальные данные для поиска по описаниям. НЕ выдумывай цифры.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 600
      });

      return completion.choices[0].message.content.trim();

    } catch (error) {
      logger.error('OpenAI flexible analytics failed:', error);
      throw new Error('Не удалось проанализировать расходы. Попробуйте позже.');
    }
  }

  async categorizeExpense(description, availableCategories) {
    try {
      const prompt = `
Определи наиболее подходящую категорию для покупки: "${description}"

Доступные категории:
${availableCategories.join('\n')}

Верни только название категории без эмодзи, точно как в списке.
Если не уверен, выбери "Прочее".
      `;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Ты помощник по категоризации расходов. Возвращай только название категории.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 50
      });

      const result = completion.choices[0].message.content.trim();
      
      // Find matching category (case-insensitive)
      const matchedCategory = availableCategories.find(cat => 
        cat.toLowerCase().includes(result.toLowerCase()) || 
        result.toLowerCase().includes(cat.toLowerCase())
      );

      return matchedCategory || 'Прочее';
    } catch (error) {
      logger.error('Expense categorization failed:', error);
      return 'Прочее';
    }
  }

  async analyzeFinancialData(userQuestion, financialData, userId) {
    try {
      // Prepare financial summary
      const incomeSummary = financialData.incomeCategories
        .map(cat => `${cat.category}: ${cat.formatted} (${cat.percentage}%)`)
        .join('\n');
      
      const expenseSummary = financialData.expenseCategories
        .map(cat => `${cat.category}: ${cat.formatted} (${cat.percentage}%)`)
        .join('\n');

      const incomeMonthly = financialData.incomeMonthly
        .map(month => `${month.month}: ${month.formatted}`)
        .join('\n');
        
      const expenseMonthly = financialData.expenseMonthly
        .map(month => `${month.month}: ${month.formatted}`)
        .join('\n');

      // Prepare detailed transactions (limit to avoid token overflow)
      const allTransactions = [
        ...financialData.detailedIncomes.map(t => ({ ...t, type: 'income' })),
        ...financialData.detailedExpenses.map(t => ({ ...t, type: 'expense' }))
      ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 100);

      const transactionsList = allTransactions
        .map(t => `${t.date}: ${t.description} - ${t.type === 'income' ? '+' : '-'}${t.amount} ${t.currency} (${t.category})`)
        .join('\n');

      const prompt = `Пользователь спрашивает: "${userQuestion}"

ФИНАНСОВАЯ СВОДКА (уже рассчитанная):
💰 Общие доходы: ${financialData.totalIncome}
💸 Общие расходы: ${financialData.totalExpenses}
💵 Прибыль/убыток: ${financialData.profit}
📈 Количество доходов: ${financialData.incomeCount}
📊 Количество расходов: ${financialData.expenseCount}
🏆 Топ категория доходов: ${financialData.topIncomeCategory}
🏆 Топ категория расходов: ${financialData.topExpenseCategory}
📅 Средний доход в день: ${financialData.averageIncomePerDay}
📅 Средний расход в день: ${financialData.averageExpensePerDay}

📋 ДОХОДЫ ПО КАТЕГОРИЯМ:
${incomeSummary || 'Нет данных'}

💸 РАСХОДЫ ПО КАТЕГОРИЯМ:
${expenseSummary || 'Нет данных'}

📅 ДОХОДЫ ПО МЕСЯЦАМ:
${incomeMonthly || 'Нет данных'}

📅 РАСХОДЫ ПО МЕСЯЦАМ:
${expenseMonthly || 'Нет данных'}

ДЕТАЛЬНЫЕ ТРАНЗАКЦИИ (для поиска по описанию/датам):
${transactionsList}

ИНСТРУКЦИИ:
1. Если вопрос о суммах/статистике - используй ТОЛЬКО агрегированные данные выше
2. Если нужно найти транзакции по описанию/датам - ищи в детальных транзакциях
3. Если просят "покажи последние записи/транзакции" - покажи список из детальных транзакций в формате:
   "Ваши последние X транзакций:
   1. ДАТА: описание - сумма ВАЛЮТА (категория)
   2. ДАТА: описание - сумма ВАЛЮТА (категория)
   ..."
4. Все суммы уже в валюте ${financialData.primaryCurrency}
5. НЕ выдумывай цифры, используй только предоставленные данные
6. Отвечай на вопросы о доходах, расходах, прибыли, балансе
7. При анализе рентабельности сравнивай доходы с расходами
8. Давай финансовые рекомендации на основе данных

Дай точный ответ с конкретными цифрами. Используй эмодзи для категорий.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Ты AI-аналитик личных финансов. Анализируй доходы, расходы, прибыль и финансовое здоровье. Используй ТОЛЬКО предоставленные точные данные. НЕ выдумывай цифры.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 700
      });

      return completion.choices[0].message.content.trim();

    } catch (error) {
      logger.error('Financial data analysis failed:', error);
      throw new Error('Не удалось проанализировать финансовые данные. Попробуйте позже.');
    }
  }

  async generateResponse(prompt) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 50
      });

      return completion.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Response generation failed:', error);
      throw new Error('Не удалось получить ответ от AI');
    }
  }

}

module.exports = new OpenAIService();
