const { expenseService, userService, supabase } = require('./supabase');
const openaiService = require('./openai');
const { formatCurrency, formatMultiCurrencyAmount } = require('../utils/currency');
const { getDateRange, formatDate } = require('../utils/date');
const logger = require('../utils/logger');

class AnalyticsService {
  async getExpenseAnalytics(userId, period = 'this_month') {
    try {
      const { startDate, endDate } = getDateRange(period);
      
      // Get expenses for the period
      const { data: expenses } = await supabase
        .rpc('get_user_expenses_for_period', {
          user_id: userId,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        });

      if (!expenses || expenses.length === 0) {
        return {
          totalAmount: '0',
          totalExpenses: 0,
          categories: [],
          currencies: [],
          averagePerDay: '0',
          periodName: this.getPeriodName(period)
        };
      }

      // Group by category
      const categoryTotals = expenses.reduce((acc, expense) => {
        const key = `${expense.category}_${expense.currency}`;
        if (!acc[key]) {
          acc[key] = {
            category: expense.category,
            currency: expense.currency,
            amount: 0,
            count: 0
          };
        }
        acc[key].amount += parseFloat(expense.amount);
        acc[key].count += 1;
        return acc;
      }, {});

      // Group by currency
      const currencyTotals = expenses.reduce((acc, expense) => {
        if (!acc[expense.currency]) {
          acc[expense.currency] = {
            currency: expense.currency,
            amount: 0,
            count: 0
          };
        }
        acc[expense.currency].amount += parseFloat(expense.amount);
        acc[expense.currency].count += 1;
        return acc;
      }, {});

      // Calculate days in period
      const daysInPeriod = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      
      // Format results
      const categories = Object.values(categoryTotals)
        .sort((a, b) => b.amount - a.amount)
        .map(cat => ({
          ...cat,
          formattedAmount: formatCurrency(cat.amount, cat.currency),
          percentage: Math.round((cat.count / expenses.length) * 100)
        }));

      const currencies = Object.values(currencyTotals)
        .sort((a, b) => b.amount - a.amount)
        .map(curr => ({
          ...curr,
          formattedAmount: formatCurrency(curr.amount, curr.currency),
          averagePerDay: formatCurrency(curr.amount / daysInPeriod, curr.currency)
        }));

      return {
        totalAmount: formatMultiCurrencyAmount(expenses),
        totalExpenses: expenses.length,
        categories,
        currencies,
        averagePerDay: currencies.map(c => c.averagePerDay).join(', '),
        periodName: this.getPeriodName(period),
        period: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          daysCount: daysInPeriod
        }
      };
    } catch (error) {
      logger.error('Analytics calculation error:', error);
      throw error;
    }
  }

  async askAIAnalytics(userId, question) {
    try {
      // Check AI limits
      const canUseAI = await userService.checkDailyLimits(userId, 'ai_question');
      if (!canUseAI) {
        const user = await userService.findById(userId);
        const limit = user.is_premium ? 20 : 5;
        throw new Error(`⛔ Лимит AI вопросов исчерпан (${limit}/день)`);
      }

      // Get expenses for last 3 months for AI analysis
      const { startDate, endDate } = getDateRange('last_3_months');
      
      const { data: expenses } = await supabase
        .rpc('get_user_expenses_for_period', {
          user_id: userId,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        });

      console.log('DEBUG: expenses data:', {
        expenses: expenses,
        length: expenses ? expenses.length : 'null',
        userId: userId,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });

      if (!expenses || expenses.length === 0) {
        return 'У вас пока нет данных о расходах для анализа. Начните добавлять траты, и я смогу помочь с аналитикой! 📊';
      }

      // Use AI to analyze expenses
      const analysis = await openaiService.analyzeExpenses(question, expenses, userId);

      // Increment usage counter
      await userService.incrementDailyUsage(userId, 'ai_question');

      return analysis;
    } catch (error) {
      logger.error('AI analytics error:', error);
      throw error;
    }
  }

  async getTopCategories(userId, period = 'this_month', limit = 5) {
    try {
      const analytics = await this.getExpenseAnalytics(userId, period);
      return analytics.categories.slice(0, limit);
    } catch (error) {
      logger.error('Top categories error:', error);
      return [];
    }
  }

  async getExpenseTrends(userId, months = 3) {
    try {
      const trends = [];
      const currentDate = new Date();

      for (let i = 0; i < months; i++) {
        const date = new Date(currentDate);
        date.setMonth(date.getMonth() - i);
        
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        
        const { data: monthlyStats } = await expenseService.supabase
          .rpc('get_monthly_stats', {
            project_id: null, // We'll need to modify this for user-specific stats
            target_month: month,
            target_year: year
          });

        trends.unshift({
          month,
          year,
          monthName: date.toLocaleString('ru-RU', { month: 'long' }),
          stats: monthlyStats || []
        });
      }

      return trends;
    } catch (error) {
      logger.error('Expense trends error:', error);
      return [];
    }
  }

  async generateSummaryReport(userId, period = 'this_month') {
    try {
      const analytics = await this.getExpenseAnalytics(userId, period);
      
      if (analytics.totalExpenses === 0) {
        return `📊 Отчёт за ${analytics.periodName.toLowerCase()}\n\n❌ Расходов не найдено`;
      }

      let report = `📊 Отчёт за ${analytics.periodName.toLowerCase()}\n\n`;
      report += `💰 Общие траты: ${analytics.totalAmount}\n`;
      report += `📝 Количество записей: ${analytics.totalExpenses}\n`;
      report += `📅 Период: ${analytics.period.startDate} - ${analytics.period.endDate}\n`;
      report += `📊 В среднем в день: ${analytics.averagePerDay}\n\n`;

      // Top categories
      if (analytics.categories.length > 0) {
        report += `🏆 Топ категории:\n`;
        analytics.categories.slice(0, 5).forEach((cat, index) => {
          const emoji = this.getCategoryEmoji(cat.category);
          report += `${index + 1}. ${emoji} ${cat.category}: ${cat.formattedAmount} (${cat.percentage}%)\n`;
        });
        report += '\n';
      }

      // Multiple currencies info
      if (analytics.currencies.length > 1) {
        report += `💱 По валютам:\n`;
        analytics.currencies.forEach(curr => {
          report += `${curr.currency}: ${curr.formattedAmount}\n`;
        });
        report += '\n';
      }

      report += `📈 Используйте команду с AI для получения инсайтов:\n`;
      report += `"Проанализируй мои траты за месяц"`;

      return report;
    } catch (error) {
      logger.error('Summary report error:', error);
      return '❌ Ошибка генерации отчёта';
    }
  }

  getPeriodName(period) {
    const periodNames = {
      'today': 'Сегодня',
      'yesterday': 'Вчера',
      'this_week': 'Эта неделя',
      'last_week': 'Прошлая неделя',
      'this_month': 'Этот месяц',
      'last_month': 'Прошлый месяц',
      'last_3_months': 'Последние 3 месяца',
      'this_year': 'Этот год',
      'last_year': 'Прошлый год'
    };
    
    return periodNames[period] || 'Выбранный период';
  }

  getCategoryEmoji(category) {
    const emojiMap = {
      'Еда и рестораны': '🍕',
      'Транспорт': '🚗',
      'Дом и быт': '🏠',
      'Одежда и красота': '👕',
      'Развлечения': '🎬',
      'Здоровье': '💊',
      'Образование': '📚',
      'Финансы': '💳',
      'Прочее': '❓'
    };
    
    return emojiMap[category] || '📊';
  }
}

module.exports = new AnalyticsService();