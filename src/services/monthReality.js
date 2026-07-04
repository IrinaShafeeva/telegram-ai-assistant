const {
  plannedPaymentService,
  plannedIncomeService,
  debtService,
  floatingIncomeService
} = require('./familyBudget');
const { sortByUpcoming, formatDaysLeft, formatDateRu } = require('../utils/budgetDates');

const UPCOMING_ITEMS_LIMIT = 10;

function formatMoney(amount, currency) {
  const n = Math.round(parseFloat(amount) * 100) / 100;
  return `${n.toLocaleString('ru-RU')} ${currency || ''}`.trim();
}

async function getMonthReality(project, date = new Date()) {
  const projectId = project.id;
  const currency = project.budget_currency || 'RUB';

  const [payments, incomes, debtTotal, floatingMtd] = await Promise.all([
    plannedPaymentService.list(projectId),
    plannedIncomeService.list(projectId),
    debtService.getTotalDebt(projectId),
    floatingIncomeService.sumForMonth(projectId, date)
  ]);

  const plannedExpenses = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const plannedIncome = incomes.reduce((s, p) => s + parseFloat(p.amount), 0);
  const actualIncomeTotal = plannedIncome + floatingMtd;
  const monthBalance = actualIncomeTotal - plannedExpenses;
  const totalWithFloating = monthBalance;

  const upcomingPayments = sortByUpcoming(payments, date, UPCOMING_ITEMS_LIMIT);
  const upcomingIncomes = sortByUpcoming(incomes, date, UPCOMING_ITEMS_LIMIT);

  return {
    currency,
    plannedIncome,
    actualIncomeTotal,
    plannedExpenses,
    monthBalance,
    floatingMtd,
    totalWithFloating,
    debtTotal,
    upcomingPayments,
    upcomingIncomes,
    hiddenUpcomingPaymentsCount: Math.max(0, payments.length - upcomingPayments.length),
    hiddenUpcomingIncomesCount: Math.max(0, incomes.length - upcomingIncomes.length),
    payments,
    incomes
  };
}

function formatMonthRealityMessage(reality) {
  const { currency } = reality;
  const lines = [];

  lines.push('📊 *Реальность месяца*\n');
  lines.push(`📥 Ожидаемые доходы: *${formatMoney(reality.plannedIncome, currency)}*`);
  if (reality.floatingMtd > 0) {
    lines.push(`💫 Плавающий доход: *+${formatMoney(reality.floatingMtd, currency)}*`);
    lines.push(`💰 Доходы всего: *${formatMoney(reality.actualIncomeTotal, currency)}*`);
  }
  lines.push(`📤 Обязательные платежи: *${formatMoney(reality.plannedExpenses, currency)}*`);

  const balance = reality.monthBalance;
  if (balance >= 0) {
    lines.push(`\n✅ *ИТОГ МЕСЯЦА: +${formatMoney(balance, currency)}*`);
    lines.push('_Приходит больше, чем нужно на обязательные платежи._');
  } else {
    lines.push(`\n⚠️ *ИТОГ МЕСЯЦА: ${formatMoney(balance, currency)}*`);
    lines.push(`_Дефицит за месяц: ${formatMoney(Math.abs(balance), currency)}_`);
  }

  if (reality.floatingMtd > 0) {
    lines.push(`\n📐 Остаток с учётом плавающего дохода: *${formatMoney(reality.totalWithFloating, currency)}*`);
  }

  lines.push(`\n🏦 Счётчик долга: *${formatMoney(reality.debtTotal, currency)}*`);

  if (reality.upcomingPayments.length > 0) {
    lines.push('\n🔥 Ближайшие платежи:');
    for (const p of reality.upcomingPayments) {
      lines.push(
        `• ${p.title} — ${formatMoney(p.amount, currency)}, ${formatDateRu(p.nextDate)} (${formatDaysLeft(p.daysLeft)})`
      );
    }
    if (reality.hiddenUpcomingPaymentsCount > 0) {
      lines.push(`• …и ещё ${reality.hiddenUpcomingPaymentsCount} платеж(ей) в плане`);
    }
  }

  if (reality.upcomingIncomes.length > 0) {
    lines.push('\n📅 Ближайшие доходы:');
    for (const p of reality.upcomingIncomes) {
      lines.push(
        `• ${p.title} — ${formatMoney(p.amount, currency)}, ${formatDateRu(p.nextDate)} (${formatDaysLeft(p.daysLeft)})`
      );
    }
    if (reality.hiddenUpcomingIncomesCount > 0) {
      lines.push(`• …и ещё ${reality.hiddenUpcomingIncomesCount} доход(ов) в плане`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  getMonthReality,
  formatMonthRealityMessage,
  formatMoney
};
