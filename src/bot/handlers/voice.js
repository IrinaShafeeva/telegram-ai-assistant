const axios = require('axios');
const { userService, projectService, incomeService } = require('../../services/supabase');
const openaiService = require('../../services/openai');
const userContextService = require('../../services/userContext');
const { getExpenseConfirmationKeyboard, getIncomeConfirmationKeyboard } = require('../keyboards/inline');
const {
  tempExpenses,
  tempIncomes,
  pickDefaultProject,
  normalizeParsedTransaction,
  resolveProject,
  resolveCategory
} = require('./messages');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');
const { generateShortId } = require('../../utils/shortId');
const { classifyIntent } = require('../../utils/intentClassifier');
const {
  collapseSplitTransactions,
  hasExplicitCurrencyMarker
} = require('../../utils/transactionNormalizer');

async function handleVoice(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const voice = msg.voice;
  const bot = getBot();

  // Get user's projects and resolve the user's default project (explicit
  // setting → personal → first).
  const projects = await projectService.findByUserId(user.id);
  const defaultProject = pickDefaultProject(projects, user);

  if (!defaultProject) {
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

  let processingMessage = null;

  try {
      processingMessage = await bot.sendMessage(chatId, '🎤 Обрабатываю голосовое сообщение...');

    // Download voice file
    const fileLink = await bot.getFileLink(voice.file_id);
    const response = await axios.get(fileLink, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const audioBuffer = Buffer.from(response.data);

    // Transcribe with Whisper
    const transcription = await openaiService.transcribeVoice(audioBuffer, voice.mime_type);

    if (!transcription || transcription.trim().length === 0) {
      await bot.editMessageText('❌ Не удалось распознать речь. Попробуйте еще раз.', {
        chat_id: chatId,
        message_id: processingMessage.message_id
      });
      return;
    }

    await bot.editMessageText(`🎯 Распознано: "${transcription}"\n\n🤖 Обрабатываю...`, {
      chat_id: chatId,
      message_id: processingMessage.message_id
    });

    // Classify intent: transaction, analytics, or command
    const intentType = await classifyIntent(transcription);

    if (intentType === 'analytics') {
      // Handle analytics question via voice
      await bot.deleteMessage(chatId, processingMessage.message_id);

      // Create fake message object for handleAnalyticsQuestion
      const analyticsMsg = {
        chat: msg.chat,
        user: user,
        text: transcription
      };

      const { handleAnalyticsQuestion } = require('./messages');
      await handleAnalyticsQuestion(analyticsMsg);
      return;
    }

    if (intentType === 'command') {
      // This is a command - redirect to text interface
      await bot.editMessageText(`🎯 Распознано: "${transcription}"\n\n💡 Для команд редактирования используйте текстовые сообщения или кнопки меню.`, {
        chat_id: chatId,
        message_id: processingMessage.message_id
      });
      return;
    }

    // Get user context for AI transaction parsing
    const userContext = await userContextService.getUserContext(user.id);
    if (defaultProject) {
      userContext.defaultProjectName = defaultProject.name;
    }
    logger.info(`👤 User context for voice transaction: ${JSON.stringify(userContext)}`);

    // Parse transaction with AI (could be income or expense)
    const parsedResult = await openaiService.parseTransaction(transcription, userContext);
    const normalizedParsedResult = Array.isArray(parsedResult)
      ? collapseSplitTransactions(transcription, parsedResult, userContext)
      : parsedResult;

    // Handle multiple transactions from voice input
    if (Array.isArray(normalizedParsedResult) && normalizedParsedResult.length > 1) {
      await handleMultipleVoiceTransactions(chatId, processingMessage.message_id, normalizedParsedResult, userContext, user, projects, transcription);
      return;
    }

    // Handle single transaction
    const parsedTransaction = normalizeParsedTransaction(transcription, Array.isArray(normalizedParsedResult) ? normalizedParsedResult[0] : normalizedParsedResult);

    // Use user's primary currency if not specified, or if the model silently
    // defaulted to RUB while the user prefers another currency.
    if (!parsedTransaction.currency || (
      parsedTransaction.currency === 'RUB' &&
      (userContext.primaryCurrency || 'RUB') !== 'RUB' &&
      !hasExplicitCurrencyMarker(transcription, 'RUB')
    )) {
      parsedTransaction.currency = userContext.primaryCurrency || 'RUB';
    }

    // Pick project (strict keyword match > AI > default) and refine category.
    const selectedProject = resolveProject(transcription, userContext.projects, projects, parsedTransaction, defaultProject);
    parsedTransaction.category = resolveCategory(transcription, userContext.categories, parsedTransaction.category);

    const tempId = generateShortId();

    if (parsedTransaction.type === 'income') {
      // Handle income transaction
      const incomeData = {
        user_id: user.id,
        project_id: selectedProject.id,
        amount: parsedTransaction.amount,
        currency: parsedTransaction.currency,
        category: parsedTransaction.category || 'Прочие доходы',
        description: parsedTransaction.description,
        income_date: new Date().toISOString().split('T')[0],
        source_text: transcription
      };

      // Store temporarily
      tempIncomes.set(tempId, incomeData);

      // Show confirmation
      const confirmationText = `💰 Подтвердите доход:

🎤 Распознано: "${transcription}"
📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${selectedProject.name}

Всё верно?`;

      await bot.editMessageText(confirmationText, {
        chat_id: chatId,
        message_id: processingMessage.message_id,
        reply_markup: getIncomeConfirmationKeyboard(tempId)
      });

      // Auto-expire temp income after 5 minutes
      setTimeout(() => {
        tempIncomes.delete(tempId);
      }, 5 * 60 * 1000);
      
    } else {
      // Handle expense transaction
      const expenseData = {
        user_id: user.id,
        project_id: selectedProject.id,
        amount: parsedTransaction.amount,
        currency: parsedTransaction.currency,
        category: parsedTransaction.category || 'Прочее',
        description: parsedTransaction.description,
        expense_date: new Date().toISOString().split('T')[0],
        source_text: transcription
      };

      // Store temporarily
      tempExpenses.set(tempId, expenseData);

      // Show confirmation
      const confirmationText = `💰 Подтвердите расход:

🎤 Распознано: "${transcription}"
📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${selectedProject.name}

Всё верно?`;

      await bot.editMessageText(confirmationText, {
        chat_id: chatId,
        message_id: processingMessage.message_id,
        reply_markup: getExpenseConfirmationKeyboard(tempId)
      });

      // Auto-expire temp expense after 5 minutes
      setTimeout(() => {
        tempExpenses.delete(tempId);
      }, 5 * 60 * 1000);
    }

  } catch (error) {
    logger.error('Voice processing error:', error);

    let errorMessage = '❌ Не удалось обработать голосовое сообщение.';

    if (error.message.includes('transcription')) {
      errorMessage = '❌ Не удалось распознать речь. Говорите четче и попробуйте еще раз.';
    } else if (error.message.includes('parsing')) {
      errorMessage = '❌ Не удалось понять сумму транзакции. Попробуйте сказать яснее.';
    } else if (error.message.includes('timeout')) {
      errorMessage = '❌ Превышено время обработки. Попробуйте записать более короткое сообщение.';
    }

    // Try to edit the processing message if it exists, otherwise send new message
    try {
      if (processingMessage) {
        await bot.editMessageText(`${errorMessage}\n\n💡 Пример: "Потратил 15 евро на кофе"`, {
          chat_id: chatId,
          message_id: processingMessage.message_id
        });
      } else {
        await bot.sendMessage(chatId, `${errorMessage}\n\n💡 Пример: "Потратил 15 евро на кофе"`);
      }
    } catch (editError) {
      // Fallback to sending new message if editing fails
      await bot.sendMessage(chatId, `${errorMessage}\n\n💡 Пример: "Потратил 15 евро на кофе"`);
    }
  }
}

// Handle multiple transactions from voice input
async function handleMultipleVoiceTransactions(chatId, messageId, transactions, userContext, user, projects, transcription) {
  const bot = getBot();

  try {
    logger.info(`🔢 Processing ${transactions.length} voice transactions`);

    // Delete the processing message
    await bot.deleteMessage(chatId, messageId);

    // Send summary message
    await bot.sendMessage(chatId, `🎤 Распознано: "${transcription}"\n🔢 Найдено ${transactions.length} транзакций. Подтвердите каждую:`);

    const batchDefaultProject = pickDefaultProject(projects, user);

    // Create individual confirmation cards for each transaction
    for (let i = 0; i < transactions.length; i++) {
      const transaction = normalizeParsedTransaction(transactions[i].description || transcription, transactions[i]);

      // Apply user's default currency
      if (!transaction.currency || (
        transaction.currency === 'RUB' &&
        (userContext.primaryCurrency || 'RUB') !== 'RUB' &&
        !hasExplicitCurrencyMarker(transaction.description || transcription, 'RUB')
      )) {
        transaction.currency = userContext.primaryCurrency || 'RUB';
      }

      // Pick project (strict keyword match > AI > default) and refine category.
      const selectedProject = resolveProject(
        transaction.description || transcription,
        userContext.projects,
        projects,
        transaction,
        batchDefaultProject
      );
      transaction.category = resolveCategory(
        transaction.description || transcription,
        userContext.categories,
        transaction.category
      );

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
          source_text: transcription
        };

        tempIncomes.set(tempId, incomeData);

        // Show individual confirmation card
        const confirmationText = `💰 Подтвердите доход ${i + 1}/${transactions.length}:

🎤 Распознано: "${transcription}"
📝 Описание: ${incomeData.description}
💵 Сумма: ${incomeData.amount} ${incomeData.currency}
📂 Категория: ${incomeData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${selectedProject.name}

Всё верно?`;

        await bot.sendMessage(chatId, confirmationText, {
          reply_markup: getIncomeConfirmationKeyboard(tempId)
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
          source_text: transcription
        };

        tempExpenses.set(tempId, expenseData);

        // Show individual confirmation card
        const confirmationText = `💰 Подтвердите расход ${i + 1}/${transactions.length}:

🎤 Распознано: "${transcription}"
📝 Описание: ${expenseData.description}
💵 Сумма: ${expenseData.amount} ${expenseData.currency}
📂 Категория: ${expenseData.category}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')}
📋 Проект: ${selectedProject.name}

Всё верно?`;

        await bot.sendMessage(chatId, confirmationText, {
          reply_markup: getExpenseConfirmationKeyboard(tempId)
        });

        // Auto-expire after 5 minutes
        setTimeout(() => {
          tempExpenses.delete(tempId);
        }, 5 * 60 * 1000);
      }
    }

  } catch (error) {
    logger.error('Error handling multiple voice transactions:', error);
    await bot.sendMessage(chatId, '❌ Ошибка обработки голосовых транзакций. Попробуйте по одной.');
  }
}


module.exports = {
  handleVoice
};
