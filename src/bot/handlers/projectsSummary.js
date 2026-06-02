// "📊 По проектам" — per-project income/expense summary with period switcher.
//
// User taps the main-menu button → showProjectsSummary renders the current
// month by default; inline buttons re-render for other periods (last month,
// year, all). Same formatting helpers as the rest of the analytics output.

const analyticsService = require('../../services/analytics');
const { getBot } = require('../../utils/bot');
const logger = require('../../utils/logger');

function formatAmount(amount, currency) {
  const n = Math.round(parseFloat(amount) * 100) / 100;
  return `${n.toLocaleString('ru-RU')} ${currency}`;
}

function formatPerCurrency(map) {
  const entries = Object.entries(map).filter(([, v]) => v !== 0);
  if (entries.length === 0) return '0';
  return entries.map(([cur, v]) => formatAmount(v, cur)).join(', ');
}

function formatBalance(map) {
  const entries = Object.entries(map).filter(([, v]) => v !== 0);
  if (entries.length === 0) return '0';
  return entries
    .map(([cur, v]) => {
      const sign = v >= 0 ? '+' : '−';
      return `${sign}${formatAmount(Math.abs(v), cur)}`;
    })
    .join(', ');
}

function formatBreakdownMessage(breakdown) {
  const lines = [];
  lines.push(`📊 *Итоги по проектам — ${breakdown.periodName}*`);
  lines.push(`_${breakdown.startDate} — ${breakdown.endDate}_\n`);

  if (!breakdown.projects.length) {
    lines.push('У вас пока нет проектов.');
    return lines.join('\n');
  }

  // Track grand totals across all projects for a final aggregate line.
  const totalIncome = {};
  const totalExpense = {};

  for (const p of breakdown.projects) {
    const tag = p.isFamily ? '👨‍👩‍👧' : '📋';
    lines.push(`${tag} *${p.name}*`);
    if (!p.hasActivity) {
      lines.push('   _Нет операций_\n');
      continue;
    }
    const hasExternalIncome = p.incomeCount > 0;
    const hasExternalExpense = p.expenseCount > 0;
    const hasTransferIn = p.transferInCount > 0;
    const hasTransferOut = p.transferOutCount > 0;

    if (hasExternalIncome) {
      lines.push(`   💰 Доход: ${formatPerCurrency(p.income)} _(${p.incomeCount})_`);
    }
    if (hasTransferIn) {
      lines.push(`   ↔️ Пришло из других проектов: ${formatPerCurrency(p.transferIn)} _(${p.transferInCount})_`);
    }
    if (hasExternalExpense) {
      lines.push(`   💸 Расход: ${formatPerCurrency(p.expense)} _(${p.expenseCount})_`);
    }
    if (hasTransferOut) {
      lines.push(`   ↔️ Ушло в другие проекты: ${formatPerCurrency(p.transferOut)} _(${p.transferOutCount})_`);
    }
    lines.push(`   📊 Итог: *${formatBalance(p.balance)}*\n`);

    // Grand-total aggregates only real, external money — transfers are
    // internal and would double-count.
    for (const [c, v] of Object.entries(p.income)) totalIncome[c] = (totalIncome[c] || 0) + v;
    for (const [c, v] of Object.entries(p.expense)) totalExpense[c] = (totalExpense[c] || 0) + v;
  }

  // Aggregate across all projects — useful as a "household + business" pulse.
  // Transfers are already filtered out at the analytics layer, so this number
  // reflects only real money in vs real money out.
  const grand = {};
  for (const [c, v] of Object.entries(totalIncome)) grand[c] = (grand[c] || 0) + v;
  for (const [c, v] of Object.entries(totalExpense)) grand[c] = (grand[c] || 0) - v;
  if (Object.keys(grand).length) {
    lines.push('━━━━━━━━━━━━');
    lines.push(`*ИТОГО (все проекты): ${formatBalance(grand)}*`);
    lines.push(`_Без учёта внутренних переводов между проектами._`);
  }

  return lines.join('\n');
}

const PERIODS = [
  { key: 'this_month', label: 'Этот месяц' },
  { key: 'last_month', label: 'Прошлый месяц' },
  { key: 'this_year', label: 'Этот год' }
];

function periodSwitcherKeyboard(currentPeriod) {
  // Highlight the active period with a checkmark and disable its callback by
  // pointing it at a noop ("psum:noop") so re-taps don't burn a render.
  const row = PERIODS.map((p) => ({
    text: p.key === currentPeriod ? `✅ ${p.label}` : p.label,
    callback_data: p.key === currentPeriod ? 'psum:noop' : `psum:${p.key}`
  }));
  return { inline_keyboard: [row] };
}

async function showProjectsSummary(chatId, userId, period = 'this_month', messageId = null) {
  const bot = getBot();
  try {
    const breakdown = await analyticsService.getProjectsBreakdown(userId, period);
    const text = formatBreakdownMessage(breakdown);
    const opts = {
      parse_mode: 'Markdown',
      reply_markup: periodSwitcherKeyboard(period)
    };
    if (messageId) {
      try {
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
        return;
      } catch (e) {
        const desc = e.response?.body?.description || '';
        if (!desc.includes('message is not modified')) {
          logger.warn('projectsSummary edit failed, sending new:', desc || e.message);
          await bot.sendMessage(chatId, text, opts);
        }
        return;
      }
    }
    await bot.sendMessage(chatId, text, opts);
  } catch (err) {
    logger.error('showProjectsSummary failed:', err);
    await bot.sendMessage(chatId, '❌ Не удалось собрать сводку по проектам. Попробуйте позже.');
  }
}

async function handleProjectsSummaryCallback(callbackQuery) {
  const data = callbackQuery.data || '';
  if (!data.startsWith('psum:')) return false;
  const bot = getBot();
  await bot.answerCallbackQuery(callbackQuery.id);
  const period = data.split(':')[1];
  if (period === 'noop') return true;
  await showProjectsSummary(
    callbackQuery.message.chat.id,
    callbackQuery.user.id,
    period,
    callbackQuery.message.message_id
  );
  return true;
}

module.exports = {
  showProjectsSummary,
  handleProjectsSummaryCallback
};
