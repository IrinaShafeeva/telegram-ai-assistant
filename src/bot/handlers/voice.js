const axios = require('axios');
const { userService, projectService, incomeService } = require('../../services/supabase');
const openaiService = require('../../services/openai');
const { getExpenseConfirmationKeyboard, getIncomeConfirmationKeyboard } = require('../keyboards/inline');
const { tempExpenses, tempIncomes } = require('./messages');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

async function handleVoice(msg) {
  const chatId = msg.chat.id;
  const user = msg.user;
  const voice = msg.voice;
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

    await bot.sendMessage(chatId, '🎤 Обрабатываю голосовое сообщение...');

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
      await bot.sendMessage(chatId, '❌ Не удалось распознать речь. Попробуйте еще раз.');
      return;
    }

    await bot.sendMessage(chatId, `🎯 Распознано: "${transcription}"\n\n🤖 Обрабатываю транзакцию...`);

    // Parse transaction with AI (could be income or expense)
    const parsedTransaction = await openaiService.parseTransaction(transcription);

    // Use user's primary currency if not specified
    if (!parsedTransaction.currency) {
      parsedTransaction.currency = user.primary_currency;
    }

    const tempId = uuidv4();
    
    if (parsedTransaction.type === 'income') {
      // Handle income transaction
      const incomeData = {
        user_id: user.id,
        project_id: activeProject.id,
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
📋 Проект: ${activeProject.name}

Всё верно?`;

      await bot.sendMessage(chatId, confirmationText, {
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
        project_id: activeProject.id,
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
📋 Проект: ${activeProject.name}

Всё верно?`;

      await bot.sendMessage(chatId, confirmationText, {
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
    
    await bot.sendMessage(chatId, 
      `${errorMessage}\n\n💡 Пример: "Потратил 200 рублей на кофе"`
    );
  }
}

module.exports = {
  handleVoice
};