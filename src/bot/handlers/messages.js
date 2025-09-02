const { userService, projectService, expenseService } = require('../../services/supabase');
const openaiService = require('../../services/openai');
const googleSheetsService = require('../../services/googleSheets');
const patternsService = require('../../services/patterns');
const analyticsService = require('../../services/analytics');
const { getExpenseConfirmationKeyboard } = require('../keyboards/inline');
const { getMainMenuKeyboard, getCurrencyKeyboard } = require('../keyboards/reply');
const { SUPPORTED_CURRENCIES } = require('../../config/constants');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Store temporary expense data
const tempExpenses = new Map();

async function handleText(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = msg.text;
  const bot = getBot();

  // Skip if it's a command
  if (text.startsWith('/')) return;

  try {
    // Handle currency selection during onboarding
    if (text.includes('🇷🇺') || text.includes('🇺🇸') || text.includes('🇪🇺') || 
        SUPPORTED_CURRENCIES.some(curr => text.includes(curr))) {
      await handleCurrencySelection(msg);
      return;
    }

    // Handle main menu buttons
    if (text === '📊 Статистика') {
      return require('./commands').handleStats(msg);
    }
    if (text === '📋 Проекты') {
      return require('./commands').handleProjects(msg);
    }
    if (text === '⚙️ Настройки') {
      return require('./commands').handleSettings(msg);
    }
    if (text === '💎 PRO план') {
      return require('./commands').handleUpgrade(msg);
    }
    if (text === 'ℹ️ Помощь') {
      return require('./commands').handleHelp(msg);
    }

    // Check if it's an analytics question
    if (await isAnalyticsQuestion(text)) {
      await handleAnalyticsQuestion(msg);
      return;
    }

    // Try to parse as expense
    await handleExpenseText(msg);
  } catch (error) {
    logger.error('Text handling error:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
  }
}

async function handleCurrencySelection(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = msg.text;
  const bot = getBot();

  try {
    // Extract currency code  
    let currency = user.primary_currency || 'RUB';
    for (const curr of SUPPORTED_CURRENCIES) {
      if (text.includes(curr)) {
        currency = curr;
        break;
      }
    }

    // Update user's primary currency
    await userService.update(user.id, { primary_currency: currency });

    await bot.sendMessage(chatId, 
      `✅ Основная валюта установлена: ${currency}\n\nТеперь создадим ваш первый проект для отслеживания расходов.`,
      { reply_markup: { remove_keyboard: true } }
    );

    // Auto-create first project
    await createFirstProject(chatId, user, currency);
  } catch (error) {
    logger.error('Currency selection error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка установки валюты.');
  }
}

async function createFirstProject(chatId, user, currency) {
  const bot = getBot();
  try {
    // Create first project
    const project = await projectService.create({
      owner_id: user.id,
      name: 'Личные траты',
      description: 'Мой первый проект для отслеживания расходов',
      is_active: true
    });

    await bot.sendMessage(chatId, 
      `🎉 Проект "Личные траты" создан!

📊 Для подключения Google таблицы:

1️⃣ Создайте таблицу в Google Sheets
2️⃣ Используйте команду: /connect [ID_таблицы]

✨ Попробуйте добавить первую трату:
• Голосом: "Потратил 200 рублей на кофе"
• Текстом: "кофе 200р"

Бот автоматически определит категорию и предложит сохранить.`,
      { reply_markup: getMainMenuKeyboard() }
    );

  } catch (error) {
    logger.error('First project creation error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка создания проекта. Попробуйте /start');
  }
}

async function handleExpenseText(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = msg.text;
  const bot = getBot();

  try {
    // Get user's active project
    const projects = await projectService.findByUserId(user.id);
    const activeProject = projects.find(p => p.is_active) || projects[0];

    if (!activeProject) {
      await bot.sendMessage(chatId, 
        '📋 Сначала создайте проект для отслеживания расходов.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '➕ Создать проект', callback_data: 'create_project' }
            ]]
          }
        }
      );
      return;
    }

    // Get user patterns for smart suggestions
    const userPatterns = await patternsService.getUserPatterns(user.id);

    await bot.sendMessage(chatId, '🤖 Обрабатываю ваш расход...');

    // Parse expense with AI
    const parsedExpense = await openaiService.parseExpense(text, userPatterns);

    // Apply smart defaults if category not detected
    if (!parsedExpense.category) {
      const suggestion = await openaiService.generateSmartSuggestions(parsedExpense.description, userPatterns);
      if (suggestion) {
        parsedExpense.category = suggestion.category;
        if (!parsedExpense.currency) {
          parsedExpense.currency = suggestion.currency;
        }
        if (!parsedExpense.amount || parsedExpense.amount === 0) {
          parsedExpense.amount = suggestion.amount;
        }
      }
    }

    // Use user's primary currency if not specified
    if (!parsedExpense.currency) {
      parsedExpense.currency = user.primary_currency;
    }

    // Generate temporary expense ID for confirmation
    const tempId = uuidv4();
    const expenseData = {
      user_id: user.id,
      project_id: activeProject.id,
      amount: parsedExpense.amount,
      currency: parsedExpense.currency,
      category: parsedExpense.category || 'Прочее',
      description: parsedExpense.description,
      expense_date: new Date().toISOString().split('T')[0]
    };

    // Store temporarily
    tempExpenses.set(tempId, expenseData);

    // Show confirmation
    const confirmationText = `💰 Подтвердите расход:

📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${activeProject.name}

Всё верно?`;

    await bot.sendMessage(chatId, confirmationText, {
      reply_markup: getExpenseConfirmationKeyboard(tempId)
    });

    // Auto-expire temp expense after 5 minutes
    setTimeout(() => {
      tempExpenses.delete(tempId);
    }, 5 * 60 * 1000);

  } catch (error) {
    logger.error('Expense text processing error:', error);
    await bot.sendMessage(chatId, 
      `❌ ${error.message || 'Не удалось обработать расход. Попробуйте написать яснее.'}\n\n💡 Пример: "кофе 200 рублей"`
    );
  }
}

async function isAnalyticsQuestion(text) {
  const lowerText = text.toLowerCase();
  
  // Strong analytics indicators (questions, not expenses)
  const strongIndicators = [
    'сколько потрат', 'сколько трат', 'сколько на', 'сколько за',
    'проанализируй', 'анализ', 'статистика', 'аналитика',
    'где потратил', 'на что потратил', 'больше всего трачу',
    'отчет', 'итого', 'общая сумма', 'средний чек'
  ];
  
  // Check for strong indicators first
  if (strongIndicators.some(indicator => lowerText.includes(indicator))) {
    return true;
  }
  
  // Question patterns with money keywords
  const hasQuestionWord = ['сколько', 'где', 'когда', 'как много', 'что'].some(q => lowerText.includes(q));
  const hasMoneyContext = ['потрат', 'трат', 'расход', 'деньг', 'рубл', 'евро', 'доллар'].some(m => lowerText.includes(m));
  
  return hasQuestionWord && hasMoneyContext;
}

async function handleAnalyticsQuestion(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const question = msg.text;
  const bot = getBot();

  try {
    await bot.sendMessage(chatId, '🧠 Анализирую ваши расходы...');
    
    const analysis = await analyticsService.askAIAnalytics(user.id, question);
    await bot.sendMessage(chatId, analysis);
    
  } catch (error) {
    logger.error('Analytics question error:', error);
    await bot.sendMessage(chatId, `❌ ${error.message || 'Не удалось проанализировать расходы.'}`);
  }
}

// Export temp expenses store for callback handlers
module.exports = {
  handleText,
  tempExpenses,
  handleCurrencySelection,
  createFirstProject,
  handleExpenseText
};