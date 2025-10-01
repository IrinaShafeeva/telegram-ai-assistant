const axios = require('axios');
const { userService, projectService, incomeService } = require('../../services/supabase');
const openaiService = require('../../services/openai');
const userContextService = require('../../services/userContext');
const { getExpenseConfirmationKeyboard, getIncomeConfirmationKeyboard } = require('../keyboards/inline');
const { tempExpenses, tempIncomes } = require('./messages');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');
const { generateShortId } = require('../../utils/shortId');

async function handleVoice(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const voice = msg.voice;
  const bot = getBot();

  // Get user's projects (all of them, AI will choose the right one)
  const projects = await projectService.findByUserId(user.id);
  const defaultProject = projects[0]; // fallback project

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

    // Check if this is a question/command rather than a transaction
    const isQuestion = await isAnalyticsOrCommand(transcription);
    if (isQuestion) {
      // This is a question/command - redirect to analytics or command handling
      await bot.editMessageText(`🎯 Распознано: "${transcription}"\n\n💡 Для вопросов и команд используйте текстовые сообщения или кнопки меню.`, {
        chat_id: chatId,
        message_id: processingMessage.message_id
      });
      return;
    }

    // Get user context for AI transaction parsing
    const userContext = await userContextService.getUserContext(user.id);
    logger.info(`👤 User context for voice transaction: ${JSON.stringify(userContext)}`);

    // Parse transaction with AI (could be income or expense)
    const parsedResult = await openaiService.parseTransaction(transcription, userContext);

    // Handle multiple transactions from voice input
    if (Array.isArray(parsedResult)) {
      await handleMultipleVoiceTransactions(chatId, processingMessage.message_id, parsedResult, userContext, user, projects, transcription);
      return;
    }

    // Handle single transaction
    const parsedTransaction = parsedResult;

    // Use user's primary currency if not specified
    if (!parsedTransaction.currency) {
      parsedTransaction.currency = userContext.primaryCurrency || 'RUB';
    }

    // Find the correct project based on AI analysis
    let selectedProject = defaultProject; // default fallback
    if (parsedTransaction.project) {
      const foundProject = projects.find(p => p.name === parsedTransaction.project);
      if (foundProject) {
        selectedProject = foundProject;
        logger.info(`🎯 AI selected project: ${foundProject.name} for transaction: ${transcription}`);
      } else {
        logger.warn(`⚠️ AI suggested project "${parsedTransaction.project}" not found, using default: ${defaultProject.name}`);
      }
    }

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
        reply_markup: getIncomeConfirmationKeyboard(tempId, user.is_premium)
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
        reply_markup: getExpenseConfirmationKeyboard(tempId, user.is_premium)
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
        selectedProject = projects.find(p => p.name === transaction.project);
      }

      if (!selectedProject) {
        selectedProject = projects[0]; // Use default project
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
          reply_markup: getExpenseConfirmationKeyboard(tempId, user.is_premium)
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

// Check if transcription is a question/command rather than a transaction
async function isAnalyticsOrCommand(text) {
  try {
    // Quick check for obvious transactions with amounts
    const hasAmount = /\d+\s*(рубл|руб|долл|евро|доллар|гривен|гривн|\$|€|₽|₴)/i.test(text);
    if (hasAmount) {
      return false; // Definitely a transaction
    }

    // Quick check for obvious questions/commands
    const questionPatterns = [
      /покажи?.*последние/i,
      /хочу.*отредактировать/i,
      /редактировать.*запис/i,
      /список.*транзакций/i,
      /последние.*\d+.*запис/i,
      /последние.*\d+.*транзакц/i,
      /сколько.*потратил/i,
      /на что.*трачу/i,
      /баланс/i,
      /статистик/i,
      /аналитик/i,
      /^что /i,
      /^как /i,
      /^покажи /i
    ];

    const isObviousQuestion = questionPatterns.some(pattern => pattern.test(text));
    if (isObviousQuestion) {
      logger.info(`🎯 Voice message detected as question/command: "${text}"`);
      return true; // Definitely a question/command
    }

    return false; // Default to transaction
  } catch (error) {
    logger.error('Error checking if analytics/command:', error);
    return false; // Default to transaction on error
  }
}

module.exports = {
  handleVoice
};