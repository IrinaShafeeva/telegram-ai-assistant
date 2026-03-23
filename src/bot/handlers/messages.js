const { userService, projectService, projectMemberService, expenseService, customCategoryService, incomeService } = require('../../services/supabase');
const openaiService = require('../../services/openai');
const googleSheetsService = require('../../services/googleSheets');
const analyticsService = require('../../services/analytics');
const userContextService = require('../../services/userContext');
const { getExpenseConfirmationKeyboard, getIncomeConfirmationKeyboard, getUpgradeKeyboard } = require('../keyboards/inline');
const { getMainMenuKeyboard, getCurrencyKeyboard } = require('../keyboards/reply');
const { SUPPORTED_CURRENCIES } = require('../../config/constants');
const { getBot } = require('../../utils/bot');
const { stateManager, STATE_TYPES } = require('../../utils/stateManager');
const { shortTransactionMap } = require('../../utils/transactionMap');
const logger = require('../../utils/logger');
const { generateShortId } = require('../../utils/shortId');
const { isAnalyticsQuestion } = require('../../utils/intentClassifier');

// Function to detect currency based on language and text content
function detectCurrencyByLanguage(text, languageCode) {
  const textLower = text.toLowerCase();

  // Check for specific currency mentions in text
  if (textLower.includes('руб') || textLower.includes('рубл')) return 'RUB';
  if (textLower.includes('долл') || textLower.includes('usd') || textLower.includes('$')) return 'USD';
  if (textLower.includes('евро') || textLower.includes('eur') || textLower.includes('€')) return 'EUR';

  // Fallback to language-based detection
  if (languageCode === 'ru' || !languageCode) return 'RUB';
  if (languageCode === 'en') return 'USD';
  if (languageCode === 'de' || languageCode === 'fr' || languageCode === 'es' || languageCode === 'it') return 'EUR';

  // Default fallback
  return 'USD';
}

// Store temporary expense data
const tempExpenses = new Map();
// Store temporary income data
const tempIncomes = new Map();
// Store analytics questions cache (question by ID)
const analyticsQuestionsCache = new Map();

async function handleText(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const text = msg.text;
  const bot = getBot();

  // Skip if it's a command
  if (text.startsWith('/')) return;

  try {
    // Check if user wants to edit transactions (priority over states)
    const editRequestResult = isEditRequest(text);
    if (editRequestResult) {
      stateManager.clearState(chatId); // Clear any active state
      const { handleEdit } = require('./commands');
      await handleEdit(msg, null, editRequestResult.limit);
      return;
    }

    // Check if user has active state
    const userState = stateManager.getState(chatId);
    logger.info(`🔍 Checking user state for ${chatId}: ${userState ? userState.type : 'NO_STATE'}`);
    if (userState) {
      // Special case: if user is editing project name but input looks like a transaction, clear state and process as transaction
      if (userState.type === 'WAITING_PROJECT_NAME_EDIT' && /\d/.test(text)) {
        logger.info(`🔄 User in project edit state but input "${text}" looks like transaction, clearing state`);
        stateManager.clearState(chatId);
        // Continue to transaction processing below
      } else {
        logger.info(`🎯 Found state: ${userState.type}, calling handleStateInput for message: "${text}"`);
        await handleStateInput(msg, userState);
        return;
      }
    }

    // Handle currency selection during onboarding
    if (text.includes('🇷🇺') || text.includes('🇺🇸') || text.includes('🇪🇺') || 
        SUPPORTED_CURRENCIES.some(curr => text.includes(curr))) {
      await handleCurrencySelection(msg);
      return;
    }

    // Handle main menu buttons - clear any existing state first
    if (text === '📋 Проекты') {
      stateManager.clearState(chatId);
      return require('./commands').handleProjects(msg);
    }
    if (text === '⚙️ Настройки') {
      stateManager.clearState(chatId);
      return require('./commands').handleSettings(msg);
    }
    if (text === '💎 PRO план') {
      stateManager.clearState(chatId);
      return require('./commands').handleUpgrade(msg);
    }
    if (text === 'ℹ️ Помощь') {
      stateManager.clearState(chatId);
      return require('./commands').handleHelp(msg);
    }

    // Handle sync command
    if (text.toLowerCase() === 'синк' || text.toLowerCase() === 'sync') {
      await handleSyncCommand(msg);
      return;
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
    let currency = user.primary_currency || detectCurrencyByLanguage(text, user.language_code);
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
2️⃣ Используйте команду: /connect

✨ Попробуйте добавить первую трату:
• Голосом: "Потратил 15 евро на кофе"
• Текстом: "кофе 15€"

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
    // Get user context for AI (custom categories and projects with keywords)
    const userContext = await userContextService.getUserContext(user.id);

    // Parse transaction(s) first to determine if it's income or expense
    const processingMessage = await bot.sendMessage(chatId, '🤖 Обрабатываю транзакцию(и)...');
    const parsedResult = await openaiService.parseTransaction(text, userContext);

    // Handle multiple transactions
    if (Array.isArray(parsedResult)) {
      await handleMultipleTransactions(chatId, processingMessage.message_id, parsedResult, userContext, user, text);
      return;
    }

    // Handle single transaction (backward compatibility)
    const parsedTransaction = parsedResult;

    // Apply user's default currency if no currency was detected or if OpenAI defaulted to RUB but user has different preference
    const originalCurrency = parsedTransaction.currency;
    const userPrimaryCurrency = userContext.primaryCurrency || user.primary_currency || 'RUB';

    if (!parsedTransaction.currency || (parsedTransaction.currency === 'RUB' && userPrimaryCurrency !== 'RUB')) {
      parsedTransaction.currency = userPrimaryCurrency;
      logger.info(`💱 Using user default currency: ${parsedTransaction.currency} (was: ${originalCurrency || 'null'})`);
    }

    // Get user's projects (all of them, AI will choose the right one)
    const projects = await projectService.findByUserId(user.id);
    const defaultProject = projects[0]; // fallback project

    if (!defaultProject) {
      await bot.editMessageText('📋 Сначала создайте проект для отслеживания транзакций.', {
        chat_id: chatId,
        message_id: processingMessage.message_id,
        reply_markup: {
          inline_keyboard: [[
            { text: '➕ Создать проект', callback_data: 'create_project' }
          ]]
        }
      });
      return;
    }

    // Find the correct project based on AI analysis
    let selectedProject = defaultProject; // default fallback
    if (parsedTransaction.project) {
      const foundProject = projects.find(p => p.name === parsedTransaction.project);
      if (foundProject) {
        selectedProject = foundProject;
        logger.info(`🎯 AI selected project: ${foundProject.name} for transaction: ${text}`);
      } else {
        logger.warn(`⚠️ AI suggested project "${parsedTransaction.project}" not found, using default: ${defaultProject.name}`);
      }
    }

    const tempId = generateShortId();


    if (parsedTransaction.type === 'income') {
      // Handle income transaction
      const tempId = generateShortId();
      const incomeData = {
        user_id: user.id,
        project_id: selectedProject.id,
        amount: parsedTransaction.amount,
        currency: parsedTransaction.currency,
        category: parsedTransaction.category || 'Прочие доходы',
        description: parsedTransaction.description,
        income_date: new Date().toISOString().split('T')[0],
        source_text: text
      };

      // Store temporarily for income
      tempIncomes.set(tempId, incomeData);

      // Show income confirmation
      const confirmationText = `💰 Подтвердите доход:

📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${selectedProject.name}

Всё верно?`;

      await bot.editMessageText(confirmationText, {
        chat_id: chatId,
        message_id: processingMessage.message_id,
        reply_markup: getIncomeConfirmationKeyboard(tempId, user.is_premium)
      });

      // Auto-expire temp income after 5 minutes
      setTimeout(() => {
        tempIncomes.delete(tempId);
      }, 5 * 60 * 1000);

    } else {
      // Handle expense transaction
      const tempId = generateShortId();
      const expenseData = {
        user_id: user.id,
        project_id: selectedProject.id,
        amount: parsedTransaction.amount,
        currency: parsedTransaction.currency,
        category: parsedTransaction.category || 'Прочее',
        description: parsedTransaction.description,
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
📋 Проект: ${selectedProject.name}

Всё верно?`;

      await bot.editMessageText(confirmationText, {
        chat_id: chatId,
        message_id: processingMessage.message_id,
        reply_markup: getExpenseConfirmationKeyboard(tempId, user.is_premium)
      });

      // Auto-expire temp expense after 5 minutes
      setTimeout(() => {
        tempExpenses.delete(tempId);
      }, 5 * 60 * 1000);
    }

  } catch (error) {
    logger.error('Expense text processing error:', error);
    await bot.sendMessage(chatId, 
      `❌ ${error.message || 'Не удалось обработать расход. Попробуйте написать яснее.'}\n\n💡 Пример: "кофе 15 евро"`
    );
  }
}

// Check if user wants to edit transactions
function isEditRequest(text) {
  const editKeywords = [
    'редактировать', 'отредактировать', 'исправить', 'изменить',
    'хочу редактировать', 'редактирование', 'поправить', 'исправление',
    'корректировка', 'edit'
  ];

  const lowerText = text.toLowerCase();
  const isEditKeyword = editKeywords.some(keyword => lowerText.includes(keyword));

  if (!isEditKeyword) {
    return false;
  }

  // Extract number from the request (default to 3)
  const numberMatch = text.match(/(\d+)/);
  const limit = numberMatch ? Math.min(parseInt(numberMatch[1]), 20) : 3; // Max 20 records

  return { limit };
}

async function handleAnalyticsQuestion(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const question = msg.text;
  const bot = getBot();

  try {
    // Get user's projects
    const projects = await projectService.findByUserId(user.id);

    if (!projects || projects.length === 0) {
      await bot.sendMessage(chatId, '❌ У вас нет проектов. Создайте проект для начала работы с аналитикой.');
      return;
    }

    // Generate short ID for the question and cache it with projects
    const questionId = generateShortId();
    analyticsQuestionsCache.set(questionId, { question, projects });

    // Clean up cache after 5 minutes
    setTimeout(() => {
      analyticsQuestionsCache.delete(questionId);
    }, 5 * 60 * 1000);

    // Show project selection keyboard
    const { getAnalyticsProjectSelectionKeyboard } = require('../keyboards/inline');
    const keyboard = getAnalyticsProjectSelectionKeyboard(projects, questionId);

    await bot.sendMessage(chatId, '📊 Выберите проект для аналитики:', { reply_markup: keyboard });

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
    logger.info(`🔄 Processing state: ${userState.type} for chatId: ${chatId}, text: "${text}"`);
    switch (userState.type) {
      case STATE_TYPES.WAITING_EXPENSE_DESCRIPTION:
        await handleDescriptionInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_CUSTOM_AMOUNT:
        await handleCustomAmountInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_CUSTOM_CATEGORY:
        await handleCustomCategoryInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_NAME:
        await handleProjectNameInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_NAME_SIMPLE:
        await handleProjectNameInputSimple(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_NAME_EDIT:
        await handleProjectNameEditInput(msg, userState);
        break;

      case STATE_TYPES.WAITING_PROJECT_KEYWORDS_EDIT:
        await handleProjectKeywordsEditInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_NAME_EXISTING_SHEET:
        await handleProjectNameInputForExistingSheet(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_NAME_NEW_SHEET:
        await handleProjectNameInputForNewSheet(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_PROJECT_KEYWORDS:
        await handleProjectKeywordsInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_GOOGLE_SHEETS_LINK:
        await handleGoogleSheetsLinkInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_CATEGORY_NAME:
        await handleCategoryNameInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_CATEGORY_EMOJI:
        await handleCategoryEmojiInput(msg, userState);
        break;

      case STATE_TYPES.WAITING_CATEGORY_KEYWORDS:
        await handleCategoryKeywordsInput(msg, userState);
        break;

      case STATE_TYPES.WAITING_CATEGORY_NAME_EDIT:
        await handleCategoryNameEditInput(msg, userState);
        break;
        
      case STATE_TYPES.WAITING_CATEGORY_EMOJI_EDIT:
        await handleCategoryEmojiEditInput(msg, userState);
        break;

      case STATE_TYPES.WAITING_CATEGORY_KEYWORDS_EDIT:
        await handleCategoryKeywordsEditInput(msg, userState);
        break;

      case STATE_TYPES.WAITING_CUSTOM_EXPORT_DATES:
        await handleCustomExportDatesInput(msg, userState);
        break;
        
      case STATE_TYPES.EDITING_INCOME_AMOUNT:
        await handleIncomeAmountEdit(msg, userState);
        break;
        
      case STATE_TYPES.EDITING_INCOME_DESCRIPTION:
        await handleIncomeDescriptionEdit(msg, userState);
        break;

      case STATE_TYPES.WAITING_INVITE_USERNAME:
        await handleInviteUsernameInput(msg, userState);
        break;

      case STATE_TYPES.WAITING_MEMBER_PROJECT_KEYWORDS:
        await handleMemberProjectKeywordsInput(msg, userState);
        break;

      case STATE_TYPES.EDITING_TRANSACTION_AMOUNT:
        await handleTransactionAmountEdit(msg, userState);
        break;

      case STATE_TYPES.EDITING_TRANSACTION_DESCRIPTION:
        await handleTransactionDescriptionEdit(msg, userState);
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
      reply_markup: getExpenseConfirmationKeyboard(tempId, msg.user.is_premium)
    });
  } else {
    await bot.sendMessage(chatId, '❌ Данные расхода устарели.');
  }
  
  // Clear state
  stateManager.clearState(chatId);
}

async function handleCustomAmountInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { tempId, messageId } = userState.data;
  
  // Parse amount
  const amount = parseFloat(text.replace(',', '.').replace(/[^\d.]/g, ''));
  
  if (isNaN(amount) || amount <= 0 || amount > 1000000) {
    await bot.sendMessage(chatId, '❌ Некорректная сумма!\n\n📝 Введите число от 1 до 1 000 000\n\n✅ Примеры: 250, 1500.50, 50');
    return;
  }
  
  // Update expense data
  const expenseData = tempExpenses.get(tempId);
  if (expenseData) {
    expenseData.amount = amount;
    tempExpenses.set(tempId, expenseData);
    
    // Get project name
    const project = await projectService.findById(expenseData.project_id);
    
    // Update the confirmation message
    const confirmationText = `💰 Подтвердите расход:

📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

✅ Сумма обновлена!`;
    
    await bot.editMessageText(confirmationText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getExpenseConfirmationKeyboard(tempId, msg.user.is_premium)
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
        reply_markup: getExpenseConfirmationKeyboard(tempId, user.is_premium)
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

// Handle simple project name input (without keywords)
async function handleProjectNameInputSimple(msg, userState) {
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
    
    // Ask for keywords instead of creating directly
    stateManager.setState(chatId, STATE_TYPES.WAITING_PROJECT_KEYWORDS, {
      projectName: text
    });

    await bot.sendMessage(chatId,
      `📝 Теперь добавьте ключевые слова для проекта "${text}"\n\n🔍 Ключевые слова помогут AI автоматически определять транзакции для этого проекта.\n\n💡 Примеры:\n• отпуск, отдых, путешествие, гостиница\n• магазин, продукты, еда, супермаркет\n• кафе, ресторан, обед, ужин\n\nОтправьте - если не хотите добавлять ключевые слова`
    );
    
  } catch (error) {
    logger.error('Error creating simple project:', error);
    await bot.sendMessage(chatId, '❌ Ошибка создания проекта. Попробуйте позже.');
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
        await bot.sendMessage(chatId, '❌ Ключевые слова могут содержать только буквы, цифры, пробелы и запятые!\n\n📝 Попробуйте ещё раз или отправьте "-" чтобы пропустить:');
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
    
    await bot.sendMessage(chatId, 
      `✅ Проект "${projectName}" создан!${keywordsText}\n\n📋 Переключитесь на него через /projects если хотите использовать.`
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
    let sheetId;
    const urlRegex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const urlMatch = text.match(urlRegex);
    const plainIdMatch = text.trim().match(/^([a-zA-Z0-9-_]{20,60})$/);

    if (urlMatch) {
      sheetId = urlMatch[1];
    } else if (plainIdMatch) {
      sheetId = plainIdMatch[1];
    } else {
      await bot.sendMessage(chatId,
        '❌ Неверный формат.\n\n✅ Принимаю:\n• Ссылку: https://docs.google.com/spreadsheets/d/1A2B3C.../edit\n• Или только ID таблицы (из ссылки, часть после /d/)'
      );
      return;
    }

    // Get the selected project from state
    const selectedProjectId = userState.data?.selectedProjectId;

    if (!selectedProjectId) {
      await bot.sendMessage(chatId, '❌ Проект не выбран. Попробуйте команду /connect еще раз.');
      stateManager.clearState(chatId);
      return;
    }

    // Get project info
    const project = await projectService.findById(selectedProjectId);
    if (!project) {
      await bot.sendMessage(chatId, '❌ Выбранный проект не найден.');
      stateManager.clearState(chatId);
      return;
    }

    // Validate access to the sheet BEFORE saving
    const connectResult = await googleSheetsService.connectToUserSheet(sheetId, user.email);
    if (!connectResult.success) {
      const serviceEmail = googleSheetsService.getServiceAccountEmail();
      const hint = serviceEmail
        ? `\n\n📋 Добавьте ${serviceEmail} как «Редактор» в настройках доступа к ВАШЕЙ таблице.\n\n⚠️ У каждого пользователя своя таблица — в каждой нужно добавить этот email.`
        : '';
      logger.warn(`Google Sheets connect failed for user ${user.id}, sheet ${sheetId}: ${connectResult.error}`);
      await bot.sendMessage(chatId,
        `❌ ${connectResult.error}${hint}\n\nПроверьте:\n1. Ссылка ведёт на вашу таблицу (не чужую)\n2. В настройках доступа таблицы добавлен email выше как «Редактор»`
      );
      stateManager.clearState(chatId);
      return;
    }

    // Update project with Google Sheets ID
    await projectService.update(selectedProjectId, {
      google_sheet_id: sheetId
    });

    // Connect to the selected project
    await handleGoogleSheetsConnected(chatId, user.id, project, sheetId);
    stateManager.clearState(chatId);
    
  } catch (error) {
    logger.error('Error connecting Google Sheets:', error);
    await bot.sendMessage(chatId, '❌ Ошибка подключения таблицы. Убедитесь, что предоставили доступ к таблице.');
  }
  
  // Clear state
  stateManager.clearState(chatId);
}

// Handle category name input
async function handleCategoryNameInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { messageId } = userState.data;

  if (!user.is_premium) {
    await bot.sendMessage(chatId, '💎 Создание кастомных категорий доступно только в PRO плане!');
    stateManager.clearState(chatId);
    return;
  }

  if (text.length > 50) {
    await bot.sendMessage(chatId, '❌ Название категории слишком длинное (максимум 50 символов).');
    return;
  }

  if (text.length < 2) {
    await bot.sendMessage(chatId, '❌ Название категории слишком короткое (минимум 2 символа).');
    return;
  }

  try {
    // Check if category name already exists
    const existing = await customCategoryService.findByUserIdAndName(user.id, text);
    if (existing) {
      await bot.sendMessage(chatId, '❌ Категория с таким названием уже существует.');
      return;
    }

    // Move to emoji selection
    stateManager.setState(chatId, STATE_TYPES.WAITING_CATEGORY_EMOJI, { 
      messageId,
      categoryName: text 
    });

    await bot.editMessageText(`🎨 Выбор эмодзи для категории

📁 Название: ${text}

🎯 Отправьте эмодзи для категории (один символ):

💡 Примеры: 🐕 🏠 🚗 🍔 💊 🎬 ✈️

Или нажмите "Пропустить" для создания без эмодзи.`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '➡️ Пропустить эмодзи', callback_data: 'skip_emoji' }],
          [{ text: '❌ Отмена', callback_data: 'manage_categories' }]
        ]
      }
    });
  } catch (error) {
    logger.error('Error handling category name input:', error);
    await bot.sendMessage(chatId, '❌ Ошибка. Попробуйте позже.');
    stateManager.clearState(chatId);
  }
}

// Handle category emoji input
async function handleCategoryEmojiInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { messageId, categoryName } = userState.data;

  if (!user.is_premium) {
    await bot.sendMessage(chatId, '💎 Создание кастомных категорий доступно только в PRO плане!');
    stateManager.clearState(chatId);
    return;
  }

  // Validate emoji (allow skipping with "-" or default emoji for long text)
  let emoji = text;
  if (text === '-' || text.length > 2) {
    emoji = '📝'; // Default emoji if skipped or invalid
  }

  try {
    // Ask for keywords instead of creating immediately
    logger.info(`🔧 Setting WAITING_CATEGORY_KEYWORDS state for chatId: ${chatId}, categoryName: ${categoryName}`);
    stateManager.setState(chatId, STATE_TYPES.WAITING_CATEGORY_KEYWORDS, {
      categoryName,
      emoji: emoji
    });

    await bot.sendMessage(chatId, `🔍 Ключевые слова для категории

${emoji} ${categoryName}

Укажите ключевые слова через запятую, чтобы я автоматически определял траты в эту категорию:

💡 Например: "кафе, ресторан, пицца, еда" или "автобус, такси, метро"

✅ Если не нужны ключевые слова, отправьте "-"`);
  } catch (error) {
    logger.error('Error creating category with emoji:', error);
    await bot.sendMessage(chatId, '❌ Ошибка создания категории.');
    stateManager.clearState(chatId);
  }
}

// Handle category name edit input
async function handleCategoryNameEditInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { messageId, categoryId, currentName } = userState.data;

  if (!user.is_premium) {
    await bot.sendMessage(chatId, '💎 Редактирование кастомных категорий доступно только в PRO плане!');
    stateManager.clearState(chatId);
    return;
  }

  if (text.length > 50) {
    await bot.sendMessage(chatId, '❌ Название категории слишком длинное (максимум 50 символов).');
    return;
  }

  if (text.length < 2) {
    await bot.sendMessage(chatId, '❌ Название категории слишком короткое (минимум 2 символа).');
    return;
  }

  if (text === currentName) {
    await bot.sendMessage(chatId, '❌ Новое название должно отличаться от текущего.');
    return;
  }

  try {
    // Check if category name already exists
    const existing = await customCategoryService.findByUserIdAndName(user.id, text);
    if (existing && existing.id !== categoryId) {
      await bot.sendMessage(chatId, '❌ Категория с таким названием уже существует.');
      return;
    }

    // Update category name
    await customCategoryService.update(categoryId, { name: text });

    await bot.editMessageText(`✅ Название категории изменено!

Старое: ${currentName}
Новое: ${text}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 К категории', callback_data: `edit_category:${categoryId}` }]]
      }
    });
  } catch (error) {
    logger.error('Error updating category name:', error);
    await bot.sendMessage(chatId, '❌ Ошибка обновления названия.');
  }

  stateManager.clearState(chatId);
}

// Handle category emoji edit input
async function handleCategoryEmojiEditInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { messageId, categoryId, currentEmoji } = userState.data;

  if (!user.is_premium) {
    await bot.sendMessage(chatId, '💎 Редактирование кастомных категорий доступно только в PRO плане!');
    stateManager.clearState(chatId);
    return;
  }

  // Validate emoji (should be 1-2 characters for emoji)
  if (text.length > 2) {
    await bot.sendMessage(chatId, '❌ Пожалуйста, отправьте только один эмодзи.');
    return;
  }

  if (text === currentEmoji) {
    await bot.sendMessage(chatId, '❌ Новый эмодзи должен отличаться от текущего.');
    return;
  }

  try {
    // Update category emoji
    await customCategoryService.update(categoryId, { emoji: text });

    await bot.editMessageText(`✅ Эмодзи категории изменен!

Старый: ${currentEmoji || '📁 (по умолчанию)'}
Новый: ${text}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 К категории', callback_data: `edit_category:${categoryId}` }]]
      }
    });
  } catch (error) {
    logger.error('Error updating category emoji:', error);
    await bot.sendMessage(chatId, '❌ Ошибка обновления эмодзи.');
  }

  stateManager.clearState(chatId);
}

async function handleCustomExportDatesInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { format, messageId } = userState.data;
  
  // Parse date range format: DD.MM.YYYY - DD.MM.YYYY
  const dateRangeRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  const match = text.match(dateRangeRegex);
  
  if (!match) {
    await bot.sendMessage(chatId, '❌ Неверный формат даты!\n\n📝 Используйте: ДД.ММ.ГГГГ - ДД.ММ.ГГГГ\n\n✅ Пример: 01.12.2024 - 31.12.2024');
    return;
  }
  
  try {
    const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = match;
    
    const startDate = new Date(startYear, startMonth - 1, startDay);
    const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59);
    
    // Validate dates
    if (startDate > endDate) {
      await bot.sendMessage(chatId, '❌ Начальная дата не может быть позже конечной!');
      return;
    }
    
    const now = new Date();
    if (startDate > now || endDate > now) {
      await bot.sendMessage(chatId, '❌ Даты не могут быть в будущем!');
      return;
    }
    
    // Generate export directly (duplicate of callbacks.js logic for now)
    await generateCustomExport(chatId, messageId, msg.user, format, startDate, endDate);
    
  } catch (error) {
    logger.error('Date parsing error:', error);
    await bot.sendMessage(chatId, '❌ Ошибка обработки дат. Проверьте формат.');
  }
  
  stateManager.clearState(chatId);
}

async function generateCustomExport(chatId, messageId, user, format, startDate, endDate) {
  const bot = getBot();
  const { expenseService } = require('../../services/supabase');
  const logger = require('../../utils/logger');
  
  // Show processing message
  await bot.editMessageText('⏳ Генерируем экспорт...', {
    chat_id: chatId,
    message_id: messageId
  });
  
  try {
    // Get user's expenses for the period
    const expenses = await expenseService.getExpensesForExport(user.id, startDate, endDate);
    
    if (expenses.length === 0) {
      await bot.editMessageText('📊 Нет данных за выбранный период для экспорта.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
    
    // Generate CSV content
    const headers = ['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Проект'];
    const rows = [headers];
    
    expenses.forEach(expense => {
      rows.push([
        expense.expense_date,
        expense.description,
        expense.amount,
        expense.currency,
        expense.category,
        expense.project_name || 'Без проекта'
      ]);
    });
    
    const csvData = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const fileContent = Buffer.from(csvData, 'utf-8');
    
    const formatDate = (date) => date.toISOString().split('T')[0].replace(/-/g, '.');
    const fileName = `expenses_${formatDate(startDate)}_${formatDate(endDate)}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
    
    // Send file
    await bot.sendDocument(chatId, fileContent, {
      filename: fileName,
      contentType: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'
    });
    
    // Update message
    await bot.editMessageText(`✅ Экспорт готов!\n\n📊 Экспортировано: ${expenses.length} записей\n📅 Период: ${formatDate(startDate)} - ${formatDate(endDate)}`, {
      chat_id: chatId,
      message_id: messageId
    });
    
  } catch (error) {
    logger.error('Export generation error:', error);
    await bot.editMessageText('❌ Ошибка генерации файла экспорта.', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

async function syncExistingExpensesToSheets(userId, projectId, sheetId) {
  const { expenseService } = require('../../services/supabase');
  const googleSheetsService = require('../../services/googleSheets');
  const logger = require('../../utils/logger');
  
  try {
    logger.info(`Starting sync of existing expenses for user ${userId}, project ${projectId} to sheet ${sheetId}`);
    
    // Get all expenses for this project
    const expenses = await expenseService.findByProject(projectId, 1000, 0); // Get up to 1000 expenses
    
    if (!expenses || expenses.length === 0) {
      logger.info('No expenses to sync');
      return;
    }
    
    logger.info(`Found ${expenses.length} expenses to sync`);
    
    // Setup the sheet with headers first
    await googleSheetsService.ensureSheetStructure(sheetId);

    // Sync expenses in batches to avoid API limits
    const BATCH_SIZE = 20; // Reduced batch size for more reliable sync
    for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
      const batch = expenses.slice(i, i + BATCH_SIZE);

      logger.info(`Syncing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(expenses.length / BATCH_SIZE)}: ${batch.length} expenses`);

      for (const expense of batch) {
        try {
          // Use the existing addExpenseToSheet method with projectId
          await googleSheetsService.addExpenseToSheet(expense, projectId);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (expenseError) {
          logger.error(`Failed to sync expense ${expense.id}:`, expenseError);
          // Continue with other expenses even if one fails
        }
      }

      // Longer delay between batches
      if (i + BATCH_SIZE < expenses.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger.info(`Successfully synced ${expenses.length} expenses to Google Sheets`);
    
  } catch (error) {
    logger.error('Error in syncExistingExpensesToSheets:', error);
    throw error;
  }
}

async function syncExistingIncomesToSheets(userId, projectId, sheetId) {
  const { incomeService } = require('../../services/supabase');
  const googleSheetsService = require('../../services/googleSheets');
  const logger = require('../../utils/logger');

  try {
    logger.info(`Starting sync of existing incomes for user ${userId}, project ${projectId} to sheet ${sheetId}`);

    // Get all incomes for this project
    const incomes = await incomeService.findByProject(projectId, 1000, 0); // Get up to 1000 incomes

    if (!incomes || incomes.length === 0) {
      logger.info('No incomes to sync');
      return;
    }

    logger.info(`Found ${incomes.length} incomes to sync`);

    // Sync incomes in batches to avoid API limits
    const BATCH_SIZE = 20; // Reduced batch size for more reliable sync
    for (let i = 0; i < incomes.length; i += BATCH_SIZE) {
      const batch = incomes.slice(i, i + BATCH_SIZE);

      logger.info(`Syncing income batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(incomes.length / BATCH_SIZE)}: ${batch.length} incomes`);

      for (const income of batch) {
        try {
          // Use the existing addIncomeToSheet method with projectId
          await googleSheetsService.addIncomeToSheet(income, projectId);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (incomeError) {
          logger.error(`Failed to sync income ${income.id}:`, incomeError);
          // Continue with other incomes even if one fails
        }
      }

      // Longer delay between batches
      if (i + BATCH_SIZE < incomes.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    logger.info(`Successfully synced ${incomes.length} incomes to Google Sheets`);

  } catch (error) {
    logger.error('Error in syncExistingIncomesToSheets:', error);
    throw error;
  }
}

async function handleIncomeAmountEdit(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { tempId } = userState.data;
  
  const incomeData = tempIncomes.get(tempId);
  if (!incomeData) {
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Данные дохода устарели. Попробуйте еще раз.');
    return;
  }

  const amount = parseFloat(text);
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Введите корректную сумму (число больше 0)');
    return;
  }

  incomeData.amount = amount;
  tempIncomes.set(tempId, incomeData);
  stateManager.clearState(chatId);

  try {
    const project = await projectService.findById(incomeData.project_id);
    
    const confirmationText = `💰 Подтвердите доход:

📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

    await bot.sendMessage(chatId, confirmationText, {
      reply_markup: getIncomeConfirmationKeyboard(tempId, msg.user.is_premium)
    });

  } catch (error) {
    logger.error('Error updating income amount:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при обновлении суммы.');
  }
}

async function handleIncomeDescriptionEdit(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { tempId } = userState.data;
  
  const incomeData = tempIncomes.get(tempId);
  if (!incomeData) {
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Данные дохода устарели. Попробуйте еще раз.');
    return;
  }

  if (text.length === 0 || text.length > 200) {
    await bot.sendMessage(chatId, '❌ Описание должно содержать от 1 до 200 символов');
    return;
  }

  incomeData.description = text;
  tempIncomes.set(tempId, incomeData);
  stateManager.clearState(chatId);

  try {
    const project = await projectService.findById(incomeData.project_id);
    
    const confirmationText = `💰 Подтвердите доход:

📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${project.name}

Всё верно?`;

    await bot.sendMessage(chatId, confirmationText, {
      reply_markup: getIncomeConfirmationKeyboard(tempId, msg.user.is_premium)
    });

  } catch (error) {
    logger.error('Error updating income description:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при обновлении описания.');
  }
}

// Handle project name edit input
async function handleProjectNameEditInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { projectId, messageId, currentName } = userState.data;
  
  if (text.length < 2 || text.length > 50) {
    await bot.sendMessage(chatId, '❌ Название проекта должно быть от 2 до 50 символов!');
    return;
  }
  
  if (text === currentName) {
    await bot.sendMessage(chatId, '❌ Новое название не отличается от текущего!');
    return;
  }
  
  try {
    // Check if project name already exists for this user (excluding current project)
    const existingProjects = await projectService.findByUserId(user.id);
    const nameExists = existingProjects.some(p => 
      p.id !== projectId && p.name.toLowerCase() === text.toLowerCase()
    );
    
    if (nameExists) {
      await bot.sendMessage(chatId, `❌ Проект "${text}" уже существует!`);
      return;
    }

    // Update project name
    const updatedProject = await projectService.update(projectId, { name: text });

    // Update Google Sheets if connected
    if (updatedProject.google_sheet_id) {
      try {
        const googleSheetsService = require('../../services/googleSheets');
        await googleSheetsService.renameSheet(updatedProject.google_sheet_id, currentName, text);
        logger.info(`Google Sheets renamed from "${currentName}" to "${text}"`);
      } catch (error) {
        logger.error('Failed to rename Google Sheet:', error);
        // Continue anyway - project name is updated in database
      }
    }

    stateManager.clearState(chatId);

    // Try to delete the old message
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (e) {
      // Ignore if can't delete
    }

    await bot.sendMessage(chatId, 
      `✅ Название проекта изменено!\n\n` +
      `📋 Было: "${currentName}"\n` +
      `📋 Стало: "${text}"`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 К управлению проектами', callback_data: 'back_to_projects' }
          ]]
        }
      }
    );

    // If this project has Google Sheets integration, the sheet tab will be updated automatically
    // when new expenses/incomes are added
    
  } catch (error) {
    logger.error('Error updating project name:', error);
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Ошибка при обновлении названия проекта.');
  }
}

// Handle project keywords edit input
async function handleProjectKeywordsEditInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { projectId } = userState.data;

  logger.info(`🔧 Processing project keywords edit: "${text}" for projectId: ${projectId}`);

  try {
    let keywords = null;

    if (text !== '-' && text.length > 0) {
      // Validate keywords (allow letters, spaces, commas, and common punctuation)
      if (!/^[a-zA-Zа-яА-Я0-9\s,.-]+$/.test(text)) {
        await bot.sendMessage(chatId, '❌ Ключевые слова могут содержать только буквы, цифры, пробелы и запятые!\n\n📝 Попробуйте ещё раз или отправьте "-" чтобы пропустить:');
        return;
      }

      keywords = text;
    }

    // Update project with new keywords
    const updatedProject = await projectService.update(projectId, { keywords });

    const keywordsText = keywords ? `🔍 Новые ключевые слова: \`${keywords}\`` : '🔍 Ключевые слова удалены';

    await bot.sendMessage(chatId, `✅ Ключевые слова проекта обновлены!

📁 ${updatedProject.name}
${keywordsText}

Теперь AI будет использовать эти ключевые слова для автоматического определения транзакций в этот проект.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад к проекту', callback_data: `edit_project:${projectId}` }],
          [{ text: '📋 К управлению проектами', callback_data: 'back_to_projects' }]
        ]
      }
    });

  } catch (error) {
    logger.error('Error updating project keywords:', error);
    await bot.sendMessage(chatId, '❌ Ошибка обновления ключевых слов. Попробуйте позже.');
  }

  // Clear state
  stateManager.clearState(chatId);
}

// Handle project name input for existing sheet option
async function handleProjectNameInputForExistingSheet(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { messageId } = userState.data;
  
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

    // Create project
    const newProject = await projectService.create({
      owner_id: user.id,
      name: text,
      description: `Проект "${text}"`,
      is_active: false
    });

    // Find existing project with Google Sheets
    const projectsWithSheets = existingProjects.filter(p => p.google_sheet_id);
    const existingSheetProject = projectsWithSheets[0]; // Take the first one

    if (existingSheetProject && existingSheetProject.google_sheet_id) {
      try {
        // Create worksheet in existing sheet
        await googleSheetsService.createWorksheet(existingSheetProject.google_sheet_id, text);
        
        // Update new project with same Google Sheets ID
        await projectService.update(newProject.id, {
          google_sheet_id: existingSheetProject.google_sheet_id
        });

        stateManager.clearState(chatId);

        // Delete the old message
        try {
          await bot.deleteMessage(chatId, messageId);
        } catch (e) {
          // Ignore if can't delete
        }

        await bot.sendMessage(chatId, 
          `✅ Проект "${text}" создан!\n\n` +
          `📊 Создан новый лист "${text}" в существующей Google таблице.\n\n` +
          `📋 Теперь можете добавлять расходы в этот проект.`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '📋 К управлению проектами', callback_data: 'back_to_projects' }
              ]]
            }
          }
        );
      } catch (sheetsError) {
        logger.error('Error creating worksheet:', sheetsError);
        await bot.sendMessage(chatId, 
          `✅ Проект "${text}" создан!\n\n` +
          `⚠️ Не удалось создать лист в Google таблице, но проект сохранен в базе данных.`
        );
      }
    } else {
      await bot.sendMessage(chatId, 
        `❌ Не найдено подключенных Google таблиц для создания нового листа.`
      );
    }
    
  } catch (error) {
    logger.error('Error creating project with existing sheet:', error);
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Ошибка при создании проекта.');
  }
}

// Handle project name input for new sheet option
async function handleProjectNameInputForNewSheet(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { messageId } = userState.data;
  
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

    // Create project without Google Sheets ID for now
    const newProject = await projectService.create({
      owner_id: user.id,
      name: text,
      description: `Проект "${text}"`,
      is_active: false
    });

    stateManager.clearState(chatId);

    // Delete the old message
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (e) {
      // Ignore if can't delete
    }

    await bot.sendMessage(chatId,
      `✅ Проект "${text}" создан!\n\n` +
      `📊 Для подключения Google таблицы используйте команду: /connect`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '📋 К управлению проектами', callback_data: 'back_to_projects' }
          ]]
        }
      }
    );
    
  } catch (error) {
    logger.error('Error creating project with new sheet:', error);
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Ошибка при создании проекта.');
  }
}

async function handleSyncCommand(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const bot = getBot();

  if (!user) {
    await bot.sendMessage(chatId, '❌ Ошибка авторизации');
    return;
  }

  try {
    // Get user's projects
    const projects = await projectService.findByUserId(user.id);

    if (projects.length === 0) {
      await bot.sendMessage(chatId, '📂 У вас нет проектов для синхронизации.\n\nИспользуйте команду 📋 Проекты для создания.');
      return;
    }

    // Filter projects that have Google Sheets connected
    const projectsWithSheets = projects.filter(p => p.google_sheet_id);

    if (projectsWithSheets.length === 0) {
      await bot.sendMessage(chatId,
        '📊 Ни один проект не подключен к Google Sheets.\n\n' +
        'Используйте команду /connect для подключения Google таблицы к проекту.'
      );
      return;
    }

    // Check daily sync limit for users without unlimited access
    const hasUnlimited = await userService.hasUnlimitedAccess(user.id);
    if (!hasUnlimited) {
      const syncLimit = 3; // Free users get 3 syncs per day
      if (user.daily_syncs_used >= syncLimit) {
        await bot.sendMessage(chatId,
          `📊 Лимит синхронизаций исчерпан (${syncLimit}/день)\n\n💎 PRO план: неограниченные синхронизации`
        );
        return;
      }
    }

    // Create keyboard with projects
    const keyboard = projectsWithSheets.map(project => ([{
      text: `📊 ${project.name}${project.is_active ? ' ✅' : ''}`,
      callback_data: `sync_project:${project.id}`
    }]));

    keyboard.push([{
      text: '❌ Отмена',
      callback_data: 'cancel_sync'
    }]);

    await bot.sendMessage(chatId,
      `📊 Синхронизация с Google Sheets\n\n` +
      `Выберите проект для синхронизации:\n` +
      `(данные будут загружены из Google таблицы в бот)\n\n` +
      `💎 Лимит: ${user.is_premium ? '∞' : `${user.daily_syncs_used || 0}/3`}`,
      {
        reply_markup: { inline_keyboard: keyboard }
      }
    );

  } catch (error) {
    logger.error('Error in handleSyncCommand:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при загрузке проектов');
  }
}

async function handleGoogleSheetsConnected(chatId, userId, project, sheetId) {
  const bot = getBot();

  try {
    await bot.sendMessage(chatId,
      `✅ Google таблица подключена к проекту "${project.name}"!\n\n📥 Загрузить существующие транзакции в таблицу?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Да', callback_data: `sync_sheets_yes:${project.id}` },
              { text: '⏭️ Пропустить', callback_data: `sync_sheets_skip:${project.id}` }
            ]
          ]
        }
      }
    );
  } catch (error) {
    logger.error('Error in handleGoogleSheetsConnected:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при подключении таблицы.');
  }
}

async function handleSheetsSyncChoice(chatId, messageId, projectId, userId, doSync) {
  const bot = getBot();
  const project = await projectService.findById(projectId);
  if (!project) {
    await bot.editMessageText('❌ Проект не найден.', { chat_id: chatId, message_id: messageId });
    return;
  }

  const sheetId = project.google_sheet_id;
  if (!sheetId) {
    await bot.editMessageText('❌ Таблица не подключена.', { chat_id: chatId, message_id: messageId });
    return;
  }

  if (doSync) {
    try {
      await bot.editMessageText(
        `⏳ Загружаю существующие транзакции в таблицу...`,
        { chat_id: chatId, message_id: messageId }
      );
      await syncExistingExpensesToSheets(userId, projectId, sheetId);
      await syncExistingIncomesToSheets(userId, projectId, sheetId);
      await bot.editMessageText(
        `✅ Google таблица подключена к проекту "${project.name}"!\n\n📊 Все существующие расходы и доходы синхронизированы с таблицей.\n\n💡 Новые транзакции будут автоматически добавляться в таблицу.`,
        { chat_id: chatId, message_id: messageId }
      );
    } catch (syncError) {
      logger.error('Error syncing existing transactions:', syncError);
      await bot.editMessageText(
        `✅ Google таблица подключена к проекту "${project.name}"!\n\n⚠️ Не удалось синхронизировать данные.\n\n💡 Используйте "📊 Экспорт данных" в настройках для ручной синхронизации.`,
        { chat_id: chatId, message_id: messageId }
      );
    }
  } else {
    await bot.editMessageText(
      `✅ Google таблица подключена к проекту "${project.name}"!\n\n💡 Новые транзакции будут автоматически добавляться в таблицу.`,
      { chat_id: chatId, message_id: messageId }
    );
  }
}

// Handle category keywords input
async function handleCategoryKeywordsInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { categoryName, emoji, messageId } = userState.data;

  logger.info(`🔧 Processing category keywords: "${text}" for category: ${categoryName}`);

  try {
    let keywords = null;

    if (text !== '-' && text.length > 0) {
      // Validate keywords (allow letters, spaces, commas, and common punctuation)
      if (!/^[a-zA-Zа-яА-Я0-9\s,.-]+$/.test(text)) {
        await bot.sendMessage(chatId, '❌ Ключевые слова могут содержать только буквы, цифры, пробелы и запятые!\n\n📝 Попробуйте ещё раз или отправьте "-" чтобы пропустить:');
        return;
      }

      keywords = text;
    }

    // Create category with keywords
    const categoryData = {
      user_id: user.id,
      name: categoryName,
      emoji: emoji
    };

    // Add keywords only if provided and DB supports it
    if (keywords) {
      categoryData.keywords = keywords;
    }

    const newCategory = await customCategoryService.create(categoryData);

    const keywordsText = keywords ?
      `\n🔍 Ключевые слова: ${keywords}\n\n✨ Теперь при упоминании этих слов расходы будут автоматически попадать в эту категорию!` :
      `\n📝 Без ключевых слов - будет работать по названию "${categoryName}".`;

    await bot.editMessageText(
      `✅ Категория создана!

${emoji} ${categoryName}${keywordsText}

Теперь эта категория доступна при записи расходов.`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 К управлению категориями', callback_data: 'manage_categories' }]]
        }
      }
    );

  } catch (error) {
    logger.error('Error creating category with keywords:', error);
    await bot.sendMessage(chatId, '❌ Ошибка создания категории. Попробуйте позже.');
  }

  // Clear state
  stateManager.clearState(chatId);
}

// Handle category keywords edit input
async function handleCategoryKeywordsEditInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const user = msg.user;
  const { categoryId } = userState.data;

  logger.info(`🔧 Processing category keywords edit: "${text}" for categoryId: ${categoryId}`);

  try {
    let keywords = null;

    if (text !== '-' && text.length > 0) {
      // Validate keywords (allow letters, spaces, commas, and common punctuation)
      if (!/^[a-zA-Zа-яА-Я0-9\s,.-]+$/.test(text)) {
        await bot.sendMessage(chatId, '❌ Ключевые слова могут содержать только буквы, цифры, пробелы и запятые!\n\n📝 Попробуйте ещё раз или отправьте "-" чтобы пропустить:');
        return;
      }

      keywords = text;
    }

    // Update category with new keywords
    const updatedCategory = await customCategoryService.update(categoryId, { keywords });

    const keywordsText = keywords ? `🔍 Новые ключевые слова: \`${keywords}\`` : '🔍 Ключевые слова удалены';

    await bot.sendMessage(chatId, `✅ Ключевые слова обновлены!

${updatedCategory.emoji || '📁'} ${updatedCategory.name}
${keywordsText}

Теперь AI будет использовать эти ключевые слова для автоматического определения транзакций в эту категорию.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад к категории', callback_data: `edit_custom_category:${categoryId}` }],
          [{ text: '🔙 К управлению категориями', callback_data: 'manage_categories' }]
        ]
      }
    });

  } catch (error) {
    logger.error('Error updating category keywords:', error);
    await bot.sendMessage(chatId, '❌ Ошибка обновления ключевых слов. Попробуйте позже.');
  }

  // Clear state
  stateManager.clearState(chatId);
}

// Handle multiple transactions from single message
async function handleMultipleTransactions(chatId, messageId, transactions, userContext, user, text) {
  const bot = getBot();

  try {
    logger.info(`🔢 Processing ${transactions.length} transactions`);

    // Delete the processing message
    await bot.deleteMessage(chatId, messageId);

    // Send summary message
    await bot.sendMessage(chatId, `🔢 Найдено ${transactions.length} транзакций. Подтвердите каждую:`);

    // Create individual confirmation cards for each transaction
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];

      // Apply user's default currency
      if (!transaction.currency) {
        transaction.currency = userContext.primaryCurrency || 'RUB';
      }

      // Find project for this transaction
      let selectedProject = null;
      if (transaction.project) {
        const projects = await projectService.findByUserId(user.id);
        selectedProject = projects.find(p => p.name === transaction.project);
      }

      if (!selectedProject) {
        // If no project found, use default project
        const projects = await projectService.findByUserId(user.id);
        selectedProject = projects[0];
      }

      if (!selectedProject) {
        await bot.sendMessage(chatId, `❌ Транзакция ${i + 1}: не найден проект для "${transaction.description}"`);
        continue;
      }

      // Store transaction temporarily
      const tempId = generateShortId();

      if (transaction.type === 'income') {
        const incomeData = {
          user_id: user.id,
          project_id: selectedProject.id,
          amount: transaction.amount,
          currency: transaction.currency,
          category: transaction.category || 'Прочие доходы',
          description: transaction.description,
          income_date: new Date().toISOString().split('T')[0],
          source_text: text
        };

        tempIncomes.set(tempId, incomeData);

        // Show individual confirmation card
        const confirmationText = `💰 Подтвердите доход ${i + 1}/${transactions.length}:

📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${selectedProject.name}

Всё верно?`;

        await bot.sendMessage(chatId, confirmationText, {
          reply_markup: getIncomeConfirmationKeyboard(tempId, user.is_premium)
        });

        // Auto-expire after 5 minutes
        setTimeout(() => {
          tempIncomes.delete(tempId);
        }, 5 * 60 * 1000);

      } else {
        const expenseData = {
          user_id: user.id,
          project_id: selectedProject.id,
          amount: transaction.amount,
          currency: transaction.currency,
          category: transaction.category || 'Прочее',
          description: transaction.description,
          expense_date: new Date().toISOString().split('T')[0],
          source_text: text
        };

        tempExpenses.set(tempId, expenseData);

        // Show individual confirmation card
        const confirmationText = `💰 Подтвердите расход ${i + 1}/${transactions.length}:

📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${selectedProject.name}

Всё верно?`;

        await bot.sendMessage(chatId, confirmationText, {
          reply_markup: getExpenseConfirmationKeyboard(tempId, user.is_premium)
        });

        // Auto-expire after 5 minutes
        setTimeout(() => {
          tempExpenses.delete(tempId);
        }, 5 * 60 * 1000);
      }
    }

  } catch (error) {
    logger.error('Error handling multiple transactions:', error);
    await bot.sendMessage(chatId, '❌ Ошибка обработки транзакций. Попробуйте по одной.');
  }
}

// Handle invite username input
async function handleInviteUsernameInput(msg, userState) {
  const chatId = msg.chat.id;
  const bot = getBot();
  const { projectId, messageId } = userState.data;

  let targetUserId = null;
  let username = null;

  // Check if this is a forwarded message
  if (msg.forward_from) {
    targetUserId = msg.forward_from.id;
    username = msg.forward_from.username || msg.forward_from.first_name;
    logger.info(`Invite via forward: user ${targetUserId}, username: ${username}`);
  }
  // Check if message contains user mention
  else if (msg.entities && msg.entities.some(e => e.type === 'mention')) {
    const mentionEntity = msg.entities.find(e => e.type === 'mention');
    username = msg.text.substring(mentionEntity.offset + 1, mentionEntity.offset + mentionEntity.length);
  }
  // Regular username input
  else if (msg.text) {
    username = msg.text.trim().replace('@', ''); // Remove @ if user includes it

    if (username.length < 3 || username.length > 32) {
      await bot.sendMessage(chatId, '❌ Username должен быть от 3 до 32 символов!');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      await bot.sendMessage(chatId, '❌ Username может содержать только буквы, цифры и подчеркивания!');
      return;
    }
  }

  try {
    let result;
    if (targetUserId) {
      // Direct invitation by Telegram ID
      result = await projectMemberService.inviteByTelegramId(projectId, targetUserId, msg.user.id);
    } else {
      // Invitation by username
      result = await projectMemberService.invite(projectId, username, msg.user.id);
    }

    stateManager.clearState(chatId);

    let ownerMessage = `✅ Пользователь @${username} приглашен в проект "${result.project.name}"!\n\n`;

    if (result.project.google_sheet_id) {
      const sheetsUrl = `https://docs.google.com/spreadsheets/d/${result.project.google_sheet_id}/edit`;
      ownerMessage += `📊 ВАЖНО: Предоставьте @${username} доступ к Google таблице:\n\n` +
        `1️⃣ Откройте таблицу: ${sheetsUrl}\n` +
        `2️⃣ Нажмите "Настройки доступа" (справа вверху)\n` +
        `3️⃣ Добавьте email пользователя или сделайте "доступно всем по ссылке"\n` +
        `4️⃣ Установите права "Редактор"\n\n`;
    }

    ownerMessage += `🎉 Участник уже может добавлять расходы в бот и они будут синхронизироваться с таблицей!`;

    await bot.editMessageText(ownerMessage, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 Пригласить еще', callback_data: 'invite_member' }],
          [{ text: '🔙 К командной работе', callback_data: 'back_to_team' }]
        ]
      }
    });

    // Notify the invited user with Google Sheets link and keyword setup
    try {
      let notificationMessage = `🎉 Вас пригласили в командный проект!\n\n` +
        `📁 Проект: "${result.project.name}"\n` +
        `👤 Пригласил: @${msg.user.username || msg.user.first_name}\n\n`;

      // Add Google Sheets link if available
      if (result.project.google_sheet_id) {
        const sheetsUrl = `https://docs.google.com/spreadsheets/d/${result.project.google_sheet_id}/edit`;
        notificationMessage += `📊 Google таблица: ${sheetsUrl}\n\n` +
          `⚠️ Обратитесь к @${msg.user.username || msg.user.first_name} за доступом к таблице!\n\n`;
      }

      notificationMessage += `🔍 Настройте ключевые слова для проекта, чтобы AI автоматически определял ваши транзакции:\n\n` +
        `Отправьте ключевые слова через запятую или "-" если не нужны.`;

      await bot.sendMessage(result.user.id, notificationMessage);

      // Set state for keyword input
      stateManager.setState(result.user.id, 'WAITING_MEMBER_PROJECT_KEYWORDS', {
        projectId: result.project.id,
        projectName: result.project.name
      });

    } catch (notifyError) {
      logger.error('Failed to notify invited user:', notifyError);
      // Continue anyway, invitation was successful
    }

  } catch (error) {
    logger.error('Error inviting user:', error);
    stateManager.clearState(chatId);

    await bot.editMessageText(`❌ ${error.message}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'invite_member' }]]
      }
    });
  }
}

// Handle member project keywords input
async function handleMemberProjectKeywordsInput(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { projectId, projectName } = userState.data;

  logger.info(`🔤 Processing member project keywords input: "${text}" for project "${projectName}"`);

  try {
    let keywords = null;

    if (text !== '-' && text.length > 0) {
      // Validate keywords (allow letters, spaces, commas, and common punctuation)
      if (!/^[a-zA-Zа-яА-Я0-9\s,.-]+$/.test(text)) {
        await bot.sendMessage(chatId, '❌ Ключевые слова могут содержать только буквы, цифры, пробелы и запятые!\n\n📝 Попробуйте ещё раз или отправьте "-" чтобы пропустить:');
        return;
      }

      keywords = text;
    }

    // Get current project and add keywords for this user
    const project = await projectService.findById(projectId);

    stateManager.clearState(chatId);

    const keywordsText = keywords ?
      `🔍 Ваши ключевые слова: ${keywords}\n\n✨ Теперь при упоминании этих слов расходы будут автоматически попадать в проект "${projectName}"!` :
      `📝 Ключевые слова не заданы - будете выбирать проект вручную.`;

    await bot.sendMessage(chatId,
      `✅ Настройка проекта завершена!\n\n` +
      `📁 Проект: "${projectName}"\n` +
      `${keywordsText}\n\n` +
      `🎉 Теперь вы можете добавлять расходы в этот командный проект!`
    );

    // Note: We don't update project keywords for members as those are owner-specific
    // Each user can have their own interpretation/keywords for the same project

  } catch (error) {
    logger.error('Error handling member project keywords:', error);
    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, '❌ Ошибка настройки проекта. Попробуйте позже.');
  }
}

// Handle transaction amount edit
async function handleTransactionAmountEdit(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { transactionId, transactionType } = userState.data;

  logger.info(`🔧 handleTransactionAmountEdit called: chatId=${chatId}, text="${text}", transactionId=${transactionId}, type=${transactionType}`);

  try {
    // Validate amount
    const amount = parseFloat(text.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, '❌ Введите корректную сумму (больше 0)');
      return;
    }

    // Update transaction
    const service = transactionType === 'expense' ? expenseService : incomeService;
    const updatedTransaction = await service.update(transactionId, { amount });

    // Update Google Sheets
    if (updatedTransaction && updatedTransaction.project_id) {
      await googleSheetsService.updateTransactionInSheet(updatedTransaction, updatedTransaction.project_id, transactionType);
    }

    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, `✅ Сумма ${transactionType === 'expense' ? 'расхода' : 'дохода'} обновлена: ${amount}`);

  } catch (error) {
    logger.error('Error updating transaction amount:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при обновлении суммы');
    stateManager.clearState(chatId);
  }
}

// Handle transaction description edit
async function handleTransactionDescriptionEdit(msg, userState) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const bot = getBot();
  const { transactionId, transactionType } = userState.data;

  try {
    // Validate description
    if (text.length > 200) {
      await bot.sendMessage(chatId, '❌ Описание слишком длинное (максимум 200 символов)');
      return;
    }

    // Update transaction
    const service = transactionType === 'expense' ? expenseService : incomeService;
    const updatedTransaction = await service.update(transactionId, { description: text });

    // Update Google Sheets
    if (updatedTransaction && updatedTransaction.project_id) {
      await googleSheetsService.updateTransactionInSheet(updatedTransaction, updatedTransaction.project_id, transactionType);
    }

    stateManager.clearState(chatId);
    await bot.sendMessage(chatId, `✅ Описание ${transactionType === 'expense' ? 'расхода' : 'дохода'} обновлено: "${text}"`);

  } catch (error) {
    logger.error('Error updating transaction description:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при обновлении описания');
    stateManager.clearState(chatId);
  }
}

// Export temp expenses store for callback handlers
module.exports = {
  handleText,
  tempExpenses,
  tempIncomes,
  analyticsQuestionsCache,
  handleCurrencySelection,
  createFirstProject,
  handleExpenseText,
  handleGoogleSheetsConnected,
  handleSheetsSyncChoice,
  handleAnalyticsQuestion
};