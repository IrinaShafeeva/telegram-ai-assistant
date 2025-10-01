const openaiService = require('../services/openai');
const logger = require('./logger');

/**
 * Hybrid intent classifier for user messages
 * Uses regex patterns for obvious cases, AI for ambiguous ones
 *
 * @param {string} text - User input text
 * @returns {Promise<string>} - 'transaction', 'analytics', or 'command'
 */
async function classifyIntent(text) {
  try {
    // Quick check for obvious transactions with amounts
    const hasAmount = /\d+\s*(рубл|руб|долл|евро|доллар|гривен|гривн|\$|€|₽|₴)/i.test(text);
    if (hasAmount) {
      logger.info(`🎯 Classified as TRANSACTION (has amount): "${text}"`);
      return 'transaction';
    }

    // Quick check for obvious analytics questions
    const analyticsPatterns = [
      /покажи?.*последние/i,
      /список.*транзакций/i,
      /последние.*\d+.*запис/i,
      /последние.*\d+.*транзакц/i,
      /последние.*\d+.*расход/i,
      /последние.*\d+.*доход/i,
      /сколько.*потратил/i,
      /сколько.*трат/i,
      /на что.*потратил/i,
      /на что.*трачу/i,
      /баланс/i,
      /статистик/i,
      /аналитик/i,
      /в.*августе/i,
      /в.*сентябре/i,
      /в.*октябре/i,
      /в.*ноябре/i,
      /в.*декабре/i,
      /в.*январе/i,
      /в.*феврале/i,
      /в.*марте/i,
      /в.*апреле/i,
      /в.*мае/i,
      /в.*июне/i,
      /в.*июле/i,
      /за.*месяц/i,
      /за.*неделю/i,
      /покажи.*расход/i,
      /покажи.*доход/i
    ];

    const isAnalytics = analyticsPatterns.some(pattern => pattern.test(text));
    if (isAnalytics) {
      logger.info(`🎯 Classified as ANALYTICS (pattern match): "${text}"`);
      return 'analytics';
    }

    // Quick check for obvious commands
    const commandPatterns = [
      /хочу.*отредактировать/i,
      /редактировать.*запис/i,
      /удалить.*запис/i,
      /изменить.*запис/i
    ];

    const isCommand = commandPatterns.some(pattern => pattern.test(text));
    if (isCommand) {
      logger.info(`🎯 Classified as COMMAND (pattern match): "${text}"`);
      return 'command';
    }

    // Use AI for ambiguous cases
    const prompt = `Определи тип запроса пользователя.

ТЕКСТ: "${text}"

Типы запросов:
1. TRANSACTION - запись о трате или доходе (примеры: "25 продукты", "купил кофе", "потратил на такси", "заработал 5000")
2. ANALYTICS - вопрос о статистике/анализе финансов (примеры: "сколько потратил на еду", "баланс за август", "статистика трат", "покажи последние записи")
3. COMMAND - команда редактирования (примеры: "хочу отредактировать", "удалить запись")

Ответь ТОЛЬКО одним словом: TRANSACTION, ANALYTICS или COMMAND`;

    const response = await openaiService.generateResponse(prompt);
    const result = response.trim().toLowerCase();

    logger.info(`🤖 AI classified as: ${result.toUpperCase()} for text: "${text}"`);

    if (result === 'analytics') return 'analytics';
    if (result === 'command') return 'command';
    return 'transaction'; // Default

  } catch (error) {
    logger.error('Error classifying intent:', error);
    return 'transaction'; // Safe fallback on error
  }
}

/**
 * Check if text is an analytics question (backward compatibility)
 * @param {string} text - User input text
 * @returns {Promise<boolean>} - true if analytics, false otherwise
 */
async function isAnalyticsQuestion(text) {
  const intent = await classifyIntent(text);
  return intent === 'analytics';
}

module.exports = {
  classifyIntent,
  isAnalyticsQuestion
};
