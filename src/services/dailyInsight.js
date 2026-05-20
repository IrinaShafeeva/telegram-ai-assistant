const { getMonthReality } = require('./monthReality');
const {
  plannedPaymentService,
  plannedIncomeService,
  changelogService,
  floatingIncomeService
} = require('./familyBudget');
const { sortByUpcoming, daysBetween, nextOccurrence } = require('../utils/budgetDates');
const { supabase } = require('./supabase');
const logger = require('../utils/logger');

async function getOpsSummary7d(projectId) {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);

  const [expRes, incRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount')
      .eq('project_id', projectId)
      .gte('expense_date', sinceStr),
    supabase
      .from('incomes')
      .select('amount')
      .eq('project_id', projectId)
      .gte('income_date', sinceStr)
  ]);

  const spent = (expRes.data || []).reduce((s, r) => s + parseFloat(r.amount), 0);
  const earned = (incRes.data || []).reduce((s, r) => s + parseFloat(r.amount), 0);
  return { spent, earned };
}

/**
 * Deterministic context for daily AI insight (facts only).
 */
async function buildDailyInsightContext(project, date = new Date()) {
  const reality = await getMonthReality(project, date);
  const payments = await plannedPaymentService.list(project.id);
  const incomes = await plannedIncomeService.list(project.id);
  const changelog = await changelogService.recent(project.id, 7);
  const ops = await getOpsSummary7d(project.id);

  const in3days = [];
  const tomorrow = [];
  for (const p of payments) {
    const next = nextOccurrence(date, p.day_of_month);
    const d = daysBetween(date, next);
    if (d <= 3) in3days.push({ title: p.title, amount: p.amount, days: d, type: 'payment' });
    if (d === 1) tomorrow.push({ title: p.title, amount: p.amount, type: 'payment' });
  }
  for (const p of incomes) {
    const next = nextOccurrence(date, p.day_of_month);
    const d = daysBetween(date, next);
    if (d <= 3 && !in3days.find((x) => x.title === p.title)) {
      in3days.push({ title: p.title, amount: p.amount, days: d, type: 'income' });
    }
    if (d === 1) tomorrow.push({ title: p.title, amount: p.amount, type: 'income' });
  }

  const recentChanges = changelog.slice(0, 5).map((c) => ({
    who: c.user?.username || c.user?.first_name || 'партнёр',
    action: c.action,
    summary: c.summary
  }));

  return {
    currency: reality.currency,
    deficit: reality.monthBalance < 0 ? reality.monthBalance : 0,
    surplus: reality.monthBalance >= 0 ? reality.monthBalance : 0,
    total_with_floating: reality.totalWithFloating,
    floating_mtd: reality.floatingMtd,
    debt_total: reality.debtTotal,
    in_3_days: in3days,
    tomorrow,
    recent_changes: recentChanges,
    spent_last_7d: ops.spent,
    earned_last_7d: ops.earned
  };
}

async function generateDailyInsightText(project) {
  if (process.env.ENABLE_DAILY_INSIGHT !== 'true') {
    return null;
  }

  try {
    const context = await buildDailyInsightContext(project);
    const prompt = `Ты финансовый помощник семейного бюджета. Напиши 2–4 коротких предложения на русском.
Используй ТОЛЬКО факты из JSON. Не выдумывай суммы и даты.
Если deficit < 0 — мягко предупреди беречь деньги. Если есть recent_changes — упомяни.
Если tomorrow есть доход — отметь. Если in_3_days есть платёж — отметь.

JSON:
${JSON.stringify(context, null, 2)}`;

    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Кратко, по делу, без markdown.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 280,
      temperature: 0.4
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    logger.error('generateDailyInsightText failed:', error);
    return null;
  }
}

module.exports = {
  buildDailyInsightContext,
  generateDailyInsightText
};
