const { userService, projectService, expenseService, customCategoryService } = require('../../services/supabase');
const openaiService = require('../../services/openai');
const googleSheetsService = require('../../services/googleSheets');
const analyticsService = require('../../services/analytics');
const { getExpenseConfirmationKeyboard } = require('../keyboards/inline');
const { getMainMenuKeyboard, getCurrencyKeyboard } = require('../keyboards/reply');
const { SUPPORTED_CURRENCIES } = require('../../config/constants');
const { getBot } = require('../../utils/bot');
const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
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
    // Check if user has active state
    const userState = stateManager.getState(chatId);
    if (userState) {
      await handleStateInput(msg, userState);
      return;
    }

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
    // Try to find project by keywords first, then fallback to active project
    const detectedProject = await projectService.findProjectByKeywords(user.id, text);
    const activeProject = detectedProject;

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

    await bot.sendMessage(chatId, '🤖 Обрабатываю ваш расход...');

    // Parse expense with AI
    const parsedExpense = await openaiService.parseExpense(text);

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

// Handle input when user is in a state
async function handleStateInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  
  try {
    switch (userState.type) {
      case STATE_TYPES.WAITING_EXPENSE_DESCRIPTION:
        await handleDescriptionInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_CUSTOM_CATEGORY:
        await handleCustomCategoryInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_NAME:
        await handleProjectNameInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_KEYWORDS:
        await handleProjectKeywordsInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_GOOGLE_SHEETS_LINK:
        await handleGoogleSheetsLinkInput(msg, userState);
        break;
        
      default:
        logger.warn(`Unknown state type: ${userState.type}`);
        stateManager.clearState(chatId);
    }
  } catch (error) {
    logger.error('Error handling state input:', error);
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте еще раз.');
  }
}

// Handle description input for expense
async function handleDescriptionInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { tempId, messageId } = userState.data;
  
  if (text.length < 1) {
    await bot.sendMessage(chatId, '❌ Описание не может быть пустым.');
    return;
  }
  
  if (text.length > 100) {
    await bot.sendMessage(chatId, '❌ Описание слишком длинное (максимум 100 символов).');
    return;
  }
  
  // Update expense data
  const expenseData = tempExpenses.get(tempId);
  if (expenseData) {
    expenseData.description = text;
    tempExpenses.set(tempId, expenseData);
    
    // Update the confirmation message
    const confirmationText = `💰 Подтвердите расход:

📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}

✅ Описание обновлено!`;
    
    await bot.editMessageText(confirmationText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getExpenseConfirmationKeyboard(tempId)
    });
  } else {
    await bot.sendMessage(chatId, '❌ Данные расхода устарели.');
  }
  
  // Clear state
  stateManager.clearState(chatId);
}

// Placeholder functions for other state types
async function handleCustomCategoryInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { tempId, messageId } = userState.data;
  
  // Validate format: emoji + space + name
  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})\s+(.+)$/u;
  const match = text.match(emojiRegex);
  
  if (!match) {
    await bot.sendMessage(chatId, '❌ Неверный формат!\n\n📝 Нужно: эмодзи + пробел + название\n\n✅ Пример: "🎮 Игры"');
    return;
  }
  
  const emoji = match[1];
  const name = match[2].trim();
  
  if (name.length < 2 || name.length > 20) {
    await bot.sendMessage(chatId, '❌ Название должно быть от 2 до 20 символов!');
    return;
  }
  
  try {
    // Check if category already exists
    const existing = await customCategoryService.findByUserIdAndName(user.id, name);
    if (existing) {
      await bot.sendMessage(chatId, `❌ Категория "${name}" уже существует!`);
      return;
    }
    
    // Create new category
    const category = await customCategoryService.create({
      user_id: user.id,
      name: name,
      emoji: emoji
    });
    
    // Update expense with new category
    const expenseData = tempExpenses.get(tempId);
    if (expenseData) {
      expenseData.category = name;
      tempExpenses.set(tempId, expenseData);
      
      // Update the confirmation message
      const confirmationText = `💰 Подтвердите расход:

📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${emoji} ${expenseData.category}

✅ Категория "${name}" создана!`;
      
      const { getCategorySelectionKeyboard, getExpenseConfirmationKeyboard } = require('../keyboards/inline');
      
      await bot.editMessageText(confirmationText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getExpenseConfirmationKeyboard(tempId)
      });
    } else {
      await bot.sendMessage(chatId, `✅ Категория "${emoji} ${name}" создана!\n\n❌ Данные расхода устарели.`);
    }
    
  } catch (error) {
    logger.error('Error creating custom category:', error);
    if (error.code === '23505') { // Unique constraint violation
      await bot.sendMessage(chatId, `❌ Категория "${name}" уже существует!`);
    } else {
      await bot.sendMessage(chatId, '❌ Ошибка создания категории. Попробуйте позже.');
    }
  }
  
  // Clear state
  stateManager.clearState(chatId);
}

async function handleProjectNameInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  
  if (text.length < 2 || text.length > 50) {
    await bot.sendMessage(chatId, '❌ Название проекта должно быть от 2 до 50 символов!');
    return;
  }
  
  try {
    // Check if project name already exists for this user
    const existingProjects = await projectService.findByUserId(user.id);
    const nameExists = existingProjects.some(p => 
      p.name.toLowerCase() === text.toLowerCase()
    );
    
    if (nameExists) {
      await bot.sendMessage(chatId, `❌ Проект "${text}" уже существует!`);
      return;
    }
    
    // Ask for keywords
    stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_KEYWORDS, { projectName: text });
    
    await bot.sendMessage(chatId, 
      `📝 Отлично! Проект "${text}" почти готов.\n\n🔍 Теперь укажите ключевые слова через запятую, чтобы я автоматически определял расходы для этого проекта:\n\n💡 Например: "маша, машенька, дочка, ребенок" или "работа, офис, командировка"\n\n✅ Если не нужны ключевые слова, отправьте "-"`
    );
    
  } catch (error) {
    logger.error('Error in project creation step:', error);
    await bot.sendMessage(chatId, '❌ Ошибка. Попробуйте позже.');
    stateManager.clearState(chatId);
  }
}

// Handle project keywords input
async function handleProjectKeywordsInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { projectName } = userState.data;
  
  try {
    let keywords = null;
    
    if (text !== '-' && text.length > 0) {
      // Validate keywords (allow letters, spaces, commas, and common punctuation)
      if (!/^[a-zA-Zа-яА-Я0-9\s,.-]+$/.test(text)) {
        await bot.sendMessage(chatId, '❌ Ключевые слова могут содержать только буквы, цифры, пробелы и запятые!');
        return;
      }
      
      keywords = text;
    }
    
    // Create project with keywords
    const projectData = {
      owner_id: user.id,
      name: projectName,
      description: `Проект "${projectName}" для отслеживания расходов`,
      is_active: false // New projects are inactive by default
    };
    
    // Add keywords only if provided and DB supports it
    if (keywords) {
      projectData.keywords = keywords;
    }
    
    const newProject = await projectService.create(projectData);
    
    const keywordsText = keywords ? 
      `\n🔍 Ключевые слова: ${keywords}\n\n✨ Теперь при упоминании этих слов расходы будут автоматически попадать в этот проект!` : 
      `\n📝 Без ключевых слов - расходы попадут в проект только при ручном переключении.`;
    
    // Check if user has any Google Sheets connected and create worksheet automatically
    let sheetText = '';
    try {
      const userProjects = await projectService.findByUserId(user.id);
      const connectedProject = userProjects.find(p => p.google_sheet_id);
      
      if (connectedProject && connectedProject.google_sheet_id) {
        const googleSheetsService = require('../../services/googleSheets');
        await googleSheetsService.createWorksheet(connectedProject.google_sheet_id, projectName);
        
        // Update new project with same Google Sheets ID to share the spreadsheet
        await projectService.update(newProject.id, {
          google_sheet_id: connectedProject.google_sheet_id
        });
        
        sheetText = `\n\n📊 Автоматически создан лист "${projectName}" в вашей Google таблице!`;
      }
    } catch (error) {
      logger.error('Error creating worksheet for project:', error);
      // Don't fail project creation if worksheet creation fails
    }
    
    await bot.sendMessage(chatId, 
      `✅ Проект "${projectName}" создан!${keywordsText}${sheetText}\n\n📋 Переключитесь на него через /projects если хотите использовать.`
    );
    
  } catch (error) {
    logger.error('Error creating project with keywords:', error);
    await bot.sendMessage(chatId, '❌ Ошибка создания проекта. Попробуйте позже.');
  }
  
  // Clear state
  stateManager.clearState(chatId);
}

// Handle Google Sheets link input
async function handleGoogleSheetsLinkInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  
  try {
    // Extract Google Sheets ID from URL
    const urlRegex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = text.match(urlRegex);
    
    if (!match) {
      await bot.sendMessage(chatId, 
        '❌ Неверный формат ссылки!\n\n✅ Пример правильной ссылки:\nhttps://docs.google.com/spreadsheets/d/1A2B3C.../edit\n\nПожалуйста, отправьте правильную ссылку на таблицу.'
      );
      return;
    }
    
    const sheetId = match[1];
    
    // Get user's active project
    const projects = await projectService.findByUserId(user.id);
    const activeProject = projects.find(p => p.is_active) || projects[0];
    
    if (!activeProject) {
      await bot.sendMessage(chatId, '❌ Сначала создайте проект для подключения таблицы.');
      stateManager.clearState(chatId);
      return;
    }
    
    // Update project with Google Sheets ID
    await projectService.update(activeProject.id, {
      google_sheet_id: sheetId
    });
    
    await bot.sendMessage(chatId, 
      `✅ Google таблица подключена к проекту "${activeProject.name}"!\n\n📊 Теперь ваши расходы будут синхронизироваться с таблицей.\n\n💡 Используйте кнопку "📊 Экспорт данных" в настройках для синхронизации.`
    );
    
  } catch (error) {
    logger.error('Error connecting Google Sheets:', error);
    await bot.sendMessage(chatId, '❌ Ошибка подключения таблицы. Убедитесь, что предоставили доступ к таблице.');
  }
  
  // Clear state
  stateManager.clearState(chatId);
}

// Export temp expenses store for callback handlers
module.exports = {
  handleText,
  tempExpenses,
  handleCurrencySelection,
  createFirstProject,
  handleExpenseText
};