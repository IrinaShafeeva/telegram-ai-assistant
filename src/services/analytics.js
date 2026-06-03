const { expenseService, userService, incomeService, supabase } = require('./supabase');
// Inter-project transfers are recorded as paired expense+income rows under
// the ↔️ Перевод category and share a transfer_id. They cancel each other
// out and must be excluded from analytics so we don't double-count internal
// money moves as real income or expense.
function dropTransferRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.filter(r => !r || !r.transfer_id);
}
const openaiService = require('./openai');
const currencyService = require('./currency');
const { formatCurrency, formatMultiCurrencyAmount } = require('../utils/currency');
const { getDateRange, formatDate } = require('../utils/date');
const logger = require('../utils/logger');

class AnalyticsService {
  async getExpenseAnalytics(userId, period = 'this_month') {
    try {
      const { startDate, endDate } = getDateRange(period);
      
      // Get expenses for the period
      const { data: rawExpenses } = await supabase
        .rpc('get_user_expenses_for_period', {
          p_user_id: userId,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        });
      const expenses = dropTransferRows(rawExpenses);

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

  async askAIAnalytics(userId, question, projectId = null) {
    try {
      // Check AI limits
      const canUseAI = await userService.checkDailyLimits(userId, 'ai_question');
      if (!canUseAI) {
        const hasUnlimited = await userService.hasUnlimitedAccess(userId);
        const limit = hasUnlimited ? 20 : 5;
        throw new Error(`⛔ Лимит AI вопросов исчерпан (${limit}/день)`);
      }

      // Get user info for primary currency
      const user = await userService.findById(userId);
      const primaryCurrency = user.primary_currency || 'RUB';

      // Get time range for analysis (last year + future dates to catch errors)
      const { startDate, endDate } = getDateRange('this_year');
      const futureEndDate = new Date(endDate);
      futureEndDate.setFullYear(futureEndDate.getFullYear() + 2);
      endDate.setTime(futureEndDate.getTime());

      // When a projectId is supplied we must fetch by project (NOT by user_id),
      // otherwise transactions added by the partner on a shared project — e.g.
      // family budget where both spouses record — are silently missing and the
      // bot tells the user "0 transactions" when in fact there are plenty.
      let expenses;
      let incomes;
      if (projectId) {
        const [exps, incs] = await Promise.all([
          expenseService.getExpensesForExportByProject(projectId, startDate, endDate),
          incomeService.getIncomesForExportByProject(projectId, startDate, endDate)
        ]);
        expenses = dropTransferRows(exps || []);
        incomes = dropTransferRows(incs || []);
      } else {
        const [expensesResult, allIncomes] = await Promise.all([
          supabase.rpc('get_user_expenses_for_period', {
            p_user_id: userId,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0]
          }),
          incomeService.getIncomesForExport(userId, startDate, endDate)
        ]);
        expenses = dropTransferRows(expensesResult.data || []);
        incomes = dropTransferRows(allIncomes || []);
      }

      // If no data at all, return appropriate message
      if ((!expenses || expenses.length === 0) && (!incomes || incomes.length === 0)) {
        return 'У вас пока нет финансовых данных для анализа. Начните добавлять доходы и расходы, и я смогу помочь с аналитикой! 📊💰';
      }

      // Convert expenses to user's primary currency
      const convertedExpenses = expenses.length > 0 ? 
        await currencyService.convertExpenses(expenses, primaryCurrency) : [];
      
      // Calculate analytics
      const expenseAnalytics = expenses.length > 0 ? 
        this.calculateExpenseAnalytics(convertedExpenses, primaryCurrency) : null;
      const incomeAnalytics = incomes.length > 0 ? 
        this.calculateIncomeAnalytics(incomes, primaryCurrency) : null;
      
      // Prepare comprehensive data for AI
      const analyticsData = {
        primaryCurrency: primaryCurrency,
        
        // Expense data
        totalExpenses: expenseAnalytics?.totalAmount || '0',
        expenseCount: expenses.length,
        expenseCategories: expenseAnalytics?.categoryBreakdown || [],
        expenseMonthly: expenseAnalytics?.monthlyBreakdown || [],
        topExpenseCategory: expenseAnalytics?.topCategory || 'Нет данных',
        averageExpensePerDay: expenseAnalytics?.averagePerDay || '0',
        
        // Income data
        totalIncome: incomeAnalytics?.totalAmount || '0',
        incomeCount: incomes.length,
        incomeCategories: incomeAnalytics?.categoryBreakdown || [],
        incomeMonthly: incomeAnalytics?.monthlyBreakdown || [],
        topIncomeCategory: incomeAnalytics?.topCategory || 'Нет данных',
        averageIncomePerDay: incomeAnalytics?.averagePerDay || '0',
        
        // Financial summary
        profit: this.calculateProfit(incomeAnalytics?.totalAmount || '0', expenseAnalytics?.totalAmount || '0', primaryCurrency),
        
        // Detailed transactions for specific queries
        detailedExpenses: convertedExpenses.map(exp => ({
          date: exp.expense_date,
          description: exp.description,
          amount: Math.abs(parseFloat(exp.amount)),
          category: exp.category,
          currency: primaryCurrency,
          type: 'expense'
        })),
        detailedIncomes: incomes.map(inc => ({
          date: inc.income_date,
          description: inc.description,
          amount: inc.amount,
          category: inc.category,
          currency: inc.currency,
          type: 'income'
        })),
        
        question: question
      };

      // Log analytics data being sent to AI for debugging
      logger.info(`📊 Analytics data sent to AI: ${JSON.stringify({
        totalExpenses: analyticsData.totalExpenses,
        totalIncome: analyticsData.totalIncome,
        expenseCategoriesCount: analyticsData.expenseCategories?.length,
        expenseCategories: analyticsData.expenseCategories,
        detailedExpensesCount: analyticsData.detailedExpenses?.length
      })}`);

      // Use AI to analyze complete financial data
      const analysis = await openaiService.analyzeFinancialData(question, analyticsData, userId);

      // Increment usage counter
      await userService.incrementDailyUsage(userId, 'ai_question');

      return analysis;
    } catch (error) {
      logger.error('AI analytics error:', error);
      throw error;
    }
  }

  calculateExpenseAnalytics(expenses, currency) {
    const totalAmount = expenses.reduce((sum, exp) => sum + Math.abs(parseFloat(exp.amount)), 0);
    const totalExpenses = expenses.length;

    // Group by category with correct math
    const categoryTotals = {};
    expenses.forEach(exp => {
      const category = exp.category || 'Прочее';
      if (!categoryTotals[category]) {
        categoryTotals[category] = { amount: 0, count: 0 };
      }
      categoryTotals[category].amount += Math.abs(parseFloat(exp.amount));
      categoryTotals[category].count += 1;
    });
    
    // Sort categories by amount (descending)
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percentage: Math.round((data.amount / totalAmount) * 100),
        formatted: currencyService.formatAmount(data.amount, currency)
      }))
      .sort((a, b) => b.amount - a.amount);
    
    // Group by month
    const monthlyTotals = {};
    expenses.forEach(exp => {
      const month = new Date(exp.expense_date).toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyTotals[month]) {
        monthlyTotals[month] = { amount: 0, count: 0 };
      }
      monthlyTotals[month].amount += Math.abs(parseFloat(exp.amount));
      monthlyTotals[month].count += 1;
    });
    
    const monthlyBreakdown = Object.entries(monthlyTotals)
      .map(([month, data]) => ({
        month,
        amount: data.amount,
        count: data.count,
        formatted: currencyService.formatAmount(data.amount, currency)
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
    
    // Calculate average per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentExpenses = expenses.filter(exp => new Date(exp.expense_date) >= thirtyDaysAgo);
    const recentTotal = recentExpenses.reduce((sum, exp) => sum + Math.abs(parseFloat(exp.amount)), 0);
    const averagePerDay = recentTotal / 30;
    
    return {
      totalAmount: currencyService.formatAmount(totalAmount, currency),
      totalExpenses,
      categoryBreakdown,
      monthlyBreakdown,
      topCategory: categoryBreakdown[0]?.category || 'Нет данных',
      averagePerDay: currencyService.formatAmount(averagePerDay, currency)
    };
  }

  calculateIncomeAnalytics(incomes, currency) {
    const totalAmount = incomes.reduce((sum, inc) => sum + parseFloat(inc.amount), 0);
    const totalIncomes = incomes.length;
    
    // Group by category with correct math
    const categoryTotals = {};
    incomes.forEach(inc => {
      const category = inc.category || 'Прочие доходы';
      if (!categoryTotals[category]) {
        categoryTotals[category] = { amount: 0, count: 0 };
      }
      categoryTotals[category].amount += parseFloat(inc.amount);
      categoryTotals[category].count += 1;
    });
    
    // Sort categories by amount (descending)
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percentage: Math.round((data.amount / totalAmount) * 100),
        formatted: currencyService.formatAmount(data.amount, currency)
      }))
      .sort((a, b) => b.amount - a.amount);
    
    // Group by month
    const monthlyTotals = {};
    incomes.forEach(inc => {
      const month = new Date(inc.income_date).toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyTotals[month]) {
        monthlyTotals[month] = { amount: 0, count: 0 };
      }
      monthlyTotals[month].amount += parseFloat(inc.amount);
      monthlyTotals[month].count += 1;
    });
    
    const monthlyBreakdown = Object.entries(monthlyTotals)
      .map(([month, data]) => ({
        month,
        amount: data.amount,
        count: data.count,
        formatted: currencyService.formatAmount(data.amount, currency)
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
    
    // Calculate average per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentIncomes = incomes.filter(inc => new Date(inc.income_date) >= thirtyDaysAgo);
    const recentTotal = recentIncomes.reduce((sum, inc) => sum + parseFloat(inc.amount), 0);
    const averagePerDay = recentTotal / 30;
    
    return {
      totalAmount: currencyService.formatAmount(totalAmount, currency),
      totalIncomes,
      categoryBreakdown,
      monthlyBreakdown,
      topCategory: categoryBreakdown[0]?.category || 'Нет данных',
      averagePerDay: currencyService.formatAmount(averagePerDay, currency)
    };
  }

  calculateProfit(incomeAmount, expenseAmount, currency) {
    const income = parseFloat(incomeAmount.replace(/[^\d.-]/g, '') || '0');
    const expense = parseFloat(expenseAmount.replace(/[^\d.-]/g, '') || '0');
    const profit = income - expense;
    return currencyService.formatAmount(profit, currency);
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
        return `📊 Отчёт за ${analytics.periodName.toLowerCase()}\n\n❌ Транзакций не найдено`;
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
      'Прочее': '❓',
      // Income categories
      'Зарплата': '💰',
      'Фриланс': '💼',
      'Продажи': '📊',
      'Подарки': '🎁',
      'Прочие доходы': '💳'
    };
    
    return emojiMap[category] || '📊';
  }

  async getIncomeAnalytics(userId, period = 'this_month') {
    try {
      const { startDate, endDate } = getDateRange(period);
      
      // Get incomes for the period
      const incomes = await incomeService.getIncomesForExport(userId, startDate, endDate);

      if (!incomes || incomes.length === 0) {
        return {
          totalAmount: '0',
          totalIncomes: 0,
          categories: [],
          currencies: [],
          averagePerDay: '0',
          periodName: this.getPeriodName(period)
        };
      }

      // Group by category
      const categoryTotals = incomes.reduce((acc, income) => {
        const key = `${income.category}_${income.currency}`;
        if (!acc[key]) {
          acc[key] = {
            category: income.category,
            currency: income.currency,
            amount: 0,
            count: 0
          };
        }
        acc[key].amount += parseFloat(income.amount);
        acc[key].count += 1;
        return acc;
      }, {});

      // Group by currency
      const currencyTotals = incomes.reduce((acc, income) => {
        if (!acc[income.currency]) {
          acc[income.currency] = 0;
        }
        acc[income.currency] += parseFloat(income.amount);
        return acc;
      }, {});

      // Calculate total in primary currency
      const user = await userService.findById(userId);
      const primaryCurrency = user.primary_currency || 'RUB';
      
      let totalInPrimaryCurrency = 0;
      for (const [currency, amount] of Object.entries(currencyTotals)) {
        if (currency === primaryCurrency) {
          totalInPrimaryCurrency += amount;
        } else {
          // For now, we'll assume 1:1 conversion or use a simple rate
          // In production, you'd want proper currency conversion
          totalInPrimaryCurrency += amount;
        }
      }

      // Calculate average per day
      const daysDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
      const averagePerDay = totalInPrimaryCurrency / daysDiff;

      // Format categories for response
      const categories = Object.values(categoryTotals)
        .sort((a, b) => b.amount - a.amount)
        .map(cat => ({
          category: cat.category,
          amount: formatCurrency(cat.amount, cat.currency),
          currency: cat.currency,
          count: cat.count,
          percentage: Math.round((cat.amount / totalInPrimaryCurrency) * 100)
        }));

      // Format currencies
      const currencies = Object.entries(currencyTotals)
        .map(([currency, amount]) => ({
          currency,
          amount: formatCurrency(amount, currency),
          count: incomes.filter(i => i.currency === currency).length
        }))
        .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

      return {
        totalAmount: formatCurrency(totalInPrimaryCurrency, primaryCurrency),
        totalIncomes: incomes.length,
        categories,
        currencies,
        averagePerDay: formatCurrency(averagePerDay, primaryCurrency),
        periodName: this.getPeriodName(period),
        period: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate)
        },
        primaryCurrency
      };

    } catch (error) {
      logger.error('Income analytics error:', error);
      return {
        totalAmount: '0',
        totalIncomes: 0,
        categories: [],
        currencies: [],
        averagePerDay: '0',
        periodName: this.getPeriodName(period),
        error: 'Ошибка при расчёте аналитики доходов'
      };
    }
  }

  // Per-project breakdown for a period. Returns one entry per project the
  // user can see, split into:
  //   income / expense     — real, external money (excludes transfers)
  //   transferIn/Out       — inter-project transfers, shown on their own lines
  //   balance              — income + transferIn - expense - transferOut
  //                          (per currency; the real cash impact on the project)
  //
  // The global "all projects" total upstream still excludes transfers so we
  // don't double-count internal moves, but at the project level transfers ARE
  // shown — otherwise a family budget funded entirely by business transfers
  // looks like it earns nothing.
  async getProjectsBreakdown(userId, period = 'this_month') {
    try {
      const { startDate, endDate } = getDateRange(period);

      // Fetch per project (not per user_id). On shared projects we must see
      // partner-authored rows; user_id filtering would hide them and the
      // breakdown would understate every shared project.
      const projects = await require('./supabase').projectService.findByUserId(userId);
      const expenseLists = await Promise.all(
        (projects || []).map(p => expenseService.getExpensesForExportByProject(p.id, startDate, endDate))
      );
      const incomeLists = await Promise.all(
        (projects || []).map(p => incomeService.getIncomesForExportByProject(p.id, startDate, endDate))
      );
      const expenses = expenseLists.flat();
      const incomes = incomeLists.flat();

      const empty = () => ({
        income: {},      // external income (no transfer_id)
        expense: {},     // external expense (no transfer_id)
        transferIn: {},  // money received via transfers from other projects
        transferOut: {}, // money sent via transfers to other projects
        incomeCount: 0,
        expenseCount: 0,
        transferInCount: 0,
        transferOutCount: 0
      });

      const byProject = new Map();
      for (const p of (projects || [])) {
        byProject.set(p.id, { id: p.id, name: p.name, isFamily: !!p.is_family_budget, ...empty() });
      }
      const ensure = (pid, fallbackName) => {
        if (!byProject.has(pid)) byProject.set(pid, { id: pid, name: fallbackName || 'Без проекта', isFamily: false, ...empty() });
        return byProject.get(pid);
      };

      for (const e of (expenses || [])) {
        const entry = ensure(e.project_id, e.project_name);
        const cur = e.currency || 'XXX';
        const amt = Math.abs(parseFloat(e.amount || 0));
        if (e.transfer_id) {
          entry.transferOut[cur] = (entry.transferOut[cur] || 0) + amt;
          entry.transferOutCount += 1;
        } else {
          entry.expense[cur] = (entry.expense[cur] || 0) + amt;
          entry.expenseCount += 1;
        }
      }
      for (const i of (incomes || [])) {
        const entry = ensure(i.project_id, i.project_name);
        const cur = i.currency || 'XXX';
        const amt = parseFloat(i.amount || 0);
        if (i.transfer_id) {
          entry.transferIn[cur] = (entry.transferIn[cur] || 0) + amt;
          entry.transferInCount += 1;
        } else {
          entry.income[cur] = (entry.income[cur] || 0) + amt;
          entry.incomeCount += 1;
        }
      }

      // balance per currency includes transfers — it answers the practical
      // question "what actually happened to this project's cash position?"
      const result = Array.from(byProject.values()).map(p => {
        const curs = new Set([
          ...Object.keys(p.income), ...Object.keys(p.expense),
          ...Object.keys(p.transferIn), ...Object.keys(p.transferOut)
        ]);
        const balance = {};
        for (const c of curs) {
          balance[c] = (p.income[c] || 0) + (p.transferIn[c] || 0)
                     - (p.expense[c] || 0) - (p.transferOut[c] || 0);
        }
        const hasActivity = (p.incomeCount + p.expenseCount + p.transferInCount + p.transferOutCount) > 0;
        return { ...p, balance, hasActivity };
      });

      result.sort((a, b) => {
        if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
        const turnover = (x) => Object.values(x.income).reduce((s, v) => s + v, 0)
                              + Object.values(x.expense).reduce((s, v) => s + v, 0)
                              + Object.values(x.transferIn).reduce((s, v) => s + v, 0)
                              + Object.values(x.transferOut).reduce((s, v) => s + v, 0);
        return turnover(b) - turnover(a);
      });

      return {
        period,
        periodName: this.getPeriodName(period),
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        projects: result
      };
    } catch (error) {
      logger.error('Projects breakdown error:', error);
      throw error;
    }
  }

  async getFinancialSummary(userId, period = 'this_month') {
    try {
      const [expenseAnalytics, incomeAnalytics] = await Promise.all([
        this.getExpenseAnalytics(userId, period),
        this.getIncomeAnalytics(userId, period)
      ]);

      const user = await userService.findById(userId);
      const primaryCurrency = user.primary_currency || 'RUB';

      // Parse amounts (remove currency symbols and convert to numbers)
      const totalExpenses = parseFloat(expenseAnalytics.totalAmount.replace(/[^\d.-]/g, '') || '0');
      const totalIncome = parseFloat(incomeAnalytics.totalAmount.replace(/[^\d.-]/g, '') || '0');
      const profit = totalIncome - totalExpenses;

      return {
        period: expenseAnalytics.periodName,
        totalIncome: formatCurrency(totalIncome, primaryCurrency),
        totalExpenses: formatCurrency(totalExpenses, primaryCurrency),
        profit: formatCurrency(profit, primaryCurrency),
        profitStatus: profit > 0 ? 'positive' : profit < 0 ? 'negative' : 'neutral',
        incomeCount: incomeAnalytics.totalIncomes,
        expenseCount: expenseAnalytics.totalExpenses,
        topIncomeCategory: incomeAnalytics.categories[0]?.category || 'Нет данных',
        topExpenseCategory: expenseAnalytics.categories[0]?.category || 'Нет данных',
        primaryCurrency
      };

    } catch (error) {
      logger.error('Financial summary error:', error);
      return {
        error: 'Ошибка при расчёте финансовой сводки'
      };
    }
  }
}

module.exports = new AnalyticsService();