const { supabase, userService } = require('./supabase');
const { familyProjectService, familyMemberStateService } = require('./familyBudget');
const { generateDailyInsightText } = require('./dailyInsight');
const { getLocalHour, getLocalDateString, currentPlanMonth, formatPlanMonthLabel } = require('../utils/budgetDates');
const { monthlyReviewKeyboard } = require('../bot/keyboards/familyBudget');
const logger = require('../utils/logger');

const MORNING_HOUR = 9;
const MONTHLY_PLAN_HOUR = 9;
const MONTHLY_PLAN_DAY_MAX = 7;
const INSIGHT_HOUR = 10;

async function getUsersForScheduler() {
  const { data, error } = await supabase
    .from('users')
    .select('id, timezone, last_morning_sent_date, last_insight_sent_date, primary_currency');
  if (error) {
    logger.error('scheduler users fetch:', error);
    return [];
  }
  return data || [];
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
    'Family budget scheduler started (monthly plan 09:00 days 1-7, morning 09:00, insight 10:00 local)'
  );
  setInterval(async () => {
    try {
      const users = await getUsersForScheduler();
      for (const user of users) {
        await sendMonthlyPlanPrompt(bot, user);
        await sendMorningGreeting(bot, user);
        await sendDailyInsight(bot, user);
      }
    } catch (e) {
      logger.error('scheduler tick error:', e);
    }
  }, 60 * 1000);
}

module.exports = { startScheduler, sendMorningGreeting, sendMonthlyPlanPrompt, sendDailyInsight };
