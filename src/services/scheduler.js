const { supabase, userService } = require('./supabase');
const { familyProjectService, familyMemberStateService, plannedOccurrenceService } = require('./familyBudget');
const { generateDailyInsightText } = require('./dailyInsight');
const { getLocalHour, getLocalDateString, currentPlanMonth, formatPlanMonthLabel } = require('../utils/budgetDates');
const { monthlyReviewKeyboard, plannedOccurrenceKeyboard } = require('../bot/keyboards/familyBudget');
const { getMonthReality, formatMoney } = require('./monthReality');
const logger = require('../utils/logger');

const MORNING_HOUR = 9;
const MONTHLY_PLAN_HOUR = 9;
const MONTHLY_PLAN_DAY_MAX = 7;
const PLANNED_REMINDER_HOUR = 9;
const INSIGHT_HOUR = 10;
const SUMMARY_HOUR = 11;

async function getUsersForScheduler() {
  const { data, error } = await supabase
    .from('users')
    .select('id, timezone, last_morning_sent_date, last_insight_sent_date, last_weekly_summary_sent_date, last_monthly_summary_sent_month, primary_currency');
  if (error) {
    logger.error('scheduler users fetch:', error);
    return [];
  }
  return data || [];
}

async function sendPlannedItemReminders(bot, user) {
  const tz = user.timezone || 'Europe/Moscow';
  const now = new Date();
  const hour = getLocalHour(now, tz);
  if (hour !== PLANNED_REMINDER_HOUR) return;

  const family = await familyProjectService.findFamilyProjectForUser(user.id);
  if (!family || !(family.onboarding_completed || family.family_established_at)) return;

  const localDate = getLocalDateString(now, tz);
  const events = await plannedOccurrenceService.listDueForUser(family.id, user.id, localDate);
  if (!events.length) return;

  const currency = family.budget_currency || user.primary_currency || 'RUB';
  for (const event of events) {
    const { item } = await plannedOccurrenceService.getEventWithItem(event.id);
    const isIncome = event.item_type === 'income';
    const title = isIncome ? '📥 Ожидаемый доход' : '📤 Обязательный платёж';
    const dateLabel = event.scheduled_date === localDate
      ? 'сегодня'
      : `запланировано на ${event.scheduled_date}`;
    await bot.sendMessage(
      user.id,
      `${title}\n\n${item.title} — ${formatMoney(item.amount, currency)}\n${dateLabel}\n\nОтметьте, если уже ${isIncome ? 'пришёл' : 'оплачен'}, или перенесите только этот раз.`,
      { reply_markup: plannedOccurrenceKeyboard(event.id, event.item_type) }
    );
    await plannedOccurrenceService.markReminderSent(event.id, user.id, localDate);
  }
}

function previousWeekBounds(now) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day - 6);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function previousMonthBounds(now) {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start, end };
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function pickEncouragement(balance) {
  if (balance > 0) return 'Хороший запас. Можно спокойно выбрать, куда его направить: подушка, долг или цель.';
  if (balance === 0) return 'Неделя сошлась почти в ноль. Это тоже контроль, не провал.';
  return 'Есть минус, но он уже виден, а значит им можно управлять. Один аккуратный шаг дальше поможет.';
}

async function buildPeriodSummary(project, bounds, label) {
  const currency = project.budget_currency || 'RUB';
  const [expensesRes, incomesRes, reality] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, transfer_id')
      .eq('project_id', project.id)
      .gte('expense_date', dateOnly(bounds.start))
      .lte('expense_date', dateOnly(bounds.end)),
    supabase
      .from('incomes')
      .select('amount, transfer_id')
      .eq('project_id', project.id)
      .gte('income_date', dateOnly(bounds.start))
      .lte('income_date', dateOnly(bounds.end)),
    getMonthReality(project)
  ]);

  if (expensesRes.error) throw expensesRes.error;
  if (incomesRes.error) throw incomesRes.error;

  const expenses = (expensesRes.data || []).filter((row) => !row.transfer_id);
  const incomes = (incomesRes.data || []).filter((row) => !row.transfer_id);
  const totalExpenses = expenses.reduce((sum, row) => sum + Math.abs(parseFloat(row.amount || 0)), 0);
  const totalIncome = incomes.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
  const balance = totalIncome - totalExpenses;

  return (
    `📊 *${label}*\n\n` +
    `📥 Доходы: *${formatMoney(totalIncome, currency)}*\n` +
    `📤 Расходы: *${formatMoney(totalExpenses, currency)}*\n` +
    `${balance >= 0 ? '✅' : '⚠️'} Итог: *${formatMoney(balance, currency)}*\n\n` +
    `План месяца: доходы всего ${formatMoney(reality.actualIncomeTotal, currency)}, обязательные платежи ${formatMoney(reality.plannedExpenses, currency)}.\n\n` +
    pickEncouragement(balance)
  );
}

async function sendWeeklySummary(bot, user) {
  const tz = user.timezone || 'Europe/Moscow';
  const now = new Date();
  const localDate = getLocalDateString(now, tz);
  if (user.last_weekly_summary_sent_date === localDate) return;
  if (getLocalHour(now, tz) !== SUMMARY_HOUR) return;

  const localDay = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  if (localDay !== 'Mon') return;

  const family = await familyProjectService.findFamilyProjectForUser(user.id);
  if (!family || !(family.onboarding_completed || family.family_established_at)) return;

  const text = await buildPeriodSummary(family, previousWeekBounds(now), 'Сводка за прошлую неделю');
  await bot.sendMessage(user.id, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '📊 Реальность месяца', callback_data: 'fb:reality' }]] }
  });
  await userService.update(user.id, { last_weekly_summary_sent_date: localDate });
}

async function sendMonthlySummary(bot, user) {
  const tz = user.timezone || 'Europe/Moscow';
  const now = new Date();
  const localDate = getLocalDateString(now, tz);
  const dayOfMonth = parseInt(localDate.split('-')[2], 10);
  if (dayOfMonth !== 1) return;
  if (getLocalHour(now, tz) !== SUMMARY_HOUR) return;

  const monthKey = currentPlanMonth(now);
  if (user.last_monthly_summary_sent_month === monthKey) return;

  const family = await familyProjectService.findFamilyProjectForUser(user.id);
  if (!family || !(family.onboarding_completed || family.family_established_at)) return;

  const text = await buildPeriodSummary(family, previousMonthBounds(now), 'Сводка за прошлый месяц');
  await bot.sendMessage(user.id, text, {
    parse_mode: 'Markdown',
    reply_markup: monthlyReviewKeyboard()
  });
  await userService.update(user.id, { last_monthly_summary_sent_month: monthKey });
}

async function sendMorningGreeting(bot, user) {
  const tz = user.timezone || 'Europe/Moscow';
  const now = new Date();
  const localDate = getLocalDateString(now, tz);
  if (user.last_morning_sent_date === localDate) return;

  const family = await familyProjectService.findFamilyProjectForUser(user.id);
  if (!family || !(family.onboarding_completed || family.family_established_at)) return;

  const hour = getLocalHour(now, tz);
  if (hour !== MORNING_HOUR) return;

  const dayOfMonth = parseInt(localDate.split('-')[2], 10);
  if (dayOfMonth <= MONTHLY_PLAN_DAY_MAX) {
    const state = await familyMemberStateService.get(family.id, user.id);
    if (state?.last_monthly_prompt_month === currentPlanMonth(now)) return;
  }

  await bot.sendMessage(
    user.id,
    'Доброе утро! ☀️ Новый день — посмотрим, как дела с деньгами?',
    {
      reply_markup: {
        inline_keyboard: [[{ text: '📊 Реальность месяца', callback_data: 'fb:reality' }]]
      }
    }
  );
  await userService.update(user.id, { last_morning_sent_date: localDate });
}

async function sendMonthlyPlanPrompt(bot, user) {
  const family = await familyProjectService.findFamilyProjectForUser(user.id);
  const planReady = family && (family.onboarding_completed || family.family_established_at);
  if (!planReady) return;

  const should = await familyMemberStateService.shouldSendMonthlyPrompt(family.id, user.id);
  if (!should) return;

  const tz = user.timezone || 'Europe/Moscow';
  const now = new Date();
  const localDate = getLocalDateString(now, tz);
  const dayOfMonth = parseInt(localDate.split('-')[2], 10);
  if (dayOfMonth > MONTHLY_PLAN_DAY_MAX) return;

  const hour = getLocalHour(now, tz);
  if (hour !== MONTHLY_PLAN_HOUR) return;

  const monthKey = currentPlanMonth(now);
  const monthLabel = formatPlanMonthLabel(monthKey);

  await familyMemberStateService.markMonthlyPromptSent(family.id, user.id);
  await bot.sendMessage(
    user.id,
    `📅 *Начало месяца — ${monthLabel}*\n\n` +
      `Простройте план на месяц вместе с партнёром: платежи, доходы, долги.\n\n` +
      `Нажмите кнопку ниже — пройдёте опросник или отредактируете текущие списки. ` +
      `Когда закончите, партнёр увидит ваши цифры.`,
    { parse_mode: 'Markdown', reply_markup: monthlyReviewKeyboard() }
  );
}

async function sendDailyInsight(bot, user) {
  if (process.env.ENABLE_DAILY_INSIGHT !== 'true') return;

  const tz = user.timezone || 'Europe/Moscow';
  const now = new Date();
  const localDate = getLocalDateString(now, tz);
  if (user.last_insight_sent_date === localDate) return;

  const family = await familyProjectService.findFamilyProjectForUser(user.id);
  if (!family || !family.onboarding_completed) return;

  const hour = getLocalHour(now, tz);
  if (hour !== INSIGHT_HOUR) return;

  const text = await generateDailyInsightText(family);
  if (!text) return;

  await bot.sendMessage(user.id, `💡 ${text}`, {
    reply_markup: {
      inline_keyboard: [[{ text: '📊 Реальность месяца', callback_data: 'fb:reality' }]]
    }
  });
  await userService.update(user.id, { last_insight_sent_date: localDate });
}

function startScheduler(bot) {
  logger.info(
    'Family budget scheduler started (monthly plan/reminders 09:00, insight 10:00, summaries 11:00 local)'
  );
  setInterval(async () => {
    try {
      const users = await getUsersForScheduler();
      for (const user of users) {
        await sendMonthlyPlanPrompt(bot, user);
        await sendPlannedItemReminders(bot, user);
        await sendMorningGreeting(bot, user);
        await sendDailyInsight(bot, user);
        await sendWeeklySummary(bot, user);
        await sendMonthlySummary(bot, user);
      }
    } catch (e) {
      logger.error('scheduler tick error:', e);
    }
  }, 60 * 1000);
}

module.exports = {
  startScheduler,
  sendMorningGreeting,
  sendMonthlyPlanPrompt,
  sendDailyInsight,
  sendPlannedItemReminders,
  sendWeeklySummary,
  sendMonthlySummary
};
