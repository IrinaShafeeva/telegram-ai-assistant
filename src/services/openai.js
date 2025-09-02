const OpenAI = require('openai');
const FormData = require('form-data');
const axios = require('axios');
const { EXPENSE_PARSING_PROMPT, ANALYTICS_PROMPT } = require('../config/constants');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  async parseExpense(userInput, userPatterns = null) {
    try {
      let prompt = EXPENSE_PARSING_PROMPT.replace('{{userInput}}', userInput);
      
      // Add smart defaults context if available
      if (userPatterns && userPatterns.length > 0) {
        const patternsContext = userPatterns.map(p => 
          `"${p.keyword}" → ${p.category} (${p.avg_amount} ${p.currency})`
        ).join('\n');
        
        prompt += `\n\nИстория пользователя (для улучшения точности):\n${patternsContext}`;
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
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
        max_tokens: 200
      });

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
      throw error;
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
        model: 'gpt-4',
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
        model: 'gpt-4',
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
        model: 'gpt-4',
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

  async generateSmartSuggestions(description, userPatterns) {
    if (!userPatterns || userPatterns.length === 0) return null;

    // Find patterns that match the description
    const matchingPatterns = userPatterns.filter(pattern =>
      description.toLowerCase().includes(pattern.keyword.toLowerCase()) ||
      pattern.keyword.toLowerCase().includes(description.toLowerCase())
    );

    if (matchingPatterns.length === 0) return null;

    // Return the pattern with highest confidence
    const bestPattern = matchingPatterns.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    if (bestPattern.confidence > 0.6) {
      return {
        category: bestPattern.category,
        amount: bestPattern.avg_amount,
        currency: bestPattern.currency,
        confidence: bestPattern.confidence
      };
    }

    return null;
  }
}

module.exports = new OpenAIService();