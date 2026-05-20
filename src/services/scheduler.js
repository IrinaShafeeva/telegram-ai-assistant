const { supabase, userService } = require('./supabase');
const { familyProjectService } = require('./familyBudget');
const { getMonthReality, formatMonthRealityMessage } = require('./monthReality');
const { generateDailyInsightText } = require('./dailyInsight');
const { getLocalHour, getLocalDateString, isSameLocalDay } = require('../utils/budgetDates');
const logger = require('../utils/logger');

const MORNING_HOUR = 9;
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
  if (!family || !family.onboarding_completed) return;

  const hour = getLocalHour(now, tz);
  if (hour !== MORNING_HOUR) return;

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
  logger.info('Family budget scheduler started (morning 09:00, insight 10:00 local)');
  setInterval(async () => {
    try {
      const users = await getUsersForScheduler();
      for (const user of users) {
        await sendMorningGreeting(bot, user);
        await sendDailyInsight(bot, user);
      }
    } catch (e) {
      logger.error('scheduler tick error:', e);
    }
  }, 60 * 1000);
}

module.exports = { startScheduler, sendMorningGreeting, sendDailyInsight };
