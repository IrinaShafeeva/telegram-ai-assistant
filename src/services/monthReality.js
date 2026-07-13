const {
  plannedPaymentService,
  plannedIncomeService,
  debtService,
  floatingIncomeService
} = require('./familyBudget');
const { supabase } = require('./supabase');
const { sortByUpcoming, formatDaysLeft, formatDateRu } = require('../utils/budgetDates');

const UPCOMING_ITEMS_LIMIT = 10;

function formatMoney(amount, currency) {
  const n = Math.round(parseFloat(amount) * 100) / 100;
  return `${n.toLocaleString('ru-RU')} ${currency || ''}`.trim();
}

function monthBounds(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  return { start, end };
}

async function sumConfirmedPlannedIncomeForMonth(projectId, date) {
  const { start, end } = monthBounds(date);
  const { data, error } = await supabase
    .from('incomes')
    .select('amount, transfer_id')
    .eq('project_id', projectId)
    .eq('source', 'planned_income')
    .gte('income_date', start)
    .lte('income_date', end);
  if (error) throw error;

  return (data || [])
    .filter((row) => !row.transfer_id)
    .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
}

async function getMonthReality(project, date = new Date()) {
  const projectId = project.id;
  const currency = project.budget_currency || 'RUB';

  const [payments, incomes, debtTotal, floatingMtd, confirmedPlannedIncome] = await Promise.all([
    plannedPaymentService.list(projectId),
    plannedIncomeService.list(projectId),
    debtService.getTotalDebt(projectId),
    floatingIncomeService.sumForMonth(projectId, date),
    sumConfirmedPlannedIncomeForMonth(projectId, date)
  ]);

  const plannedExpenses = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const plannedIncome = incomes.reduce((s, p) => s + parseFloat(p.amount), 0);
  const actualIncomeTotal = confirmedPlannedIncome + floatingMtd;
  const projectedIncomeTotal = plannedIncome + floatingMtd;
  const monthBalance = actualIncomeTotal - plannedExpenses;
  const projectedBalance = projectedIncomeTotal - plannedExpenses;
  const pendingPlannedIncome = Math.max(0, plannedIncome - confirmedPlannedIncome);
  const totalWithFloating = projectedBalance;

  const upcomingPayments = sortByUpcoming(payments, date, UPCOMING_ITEMS_LIMIT);
  const upcomingIncomes = sortByUpcoming(incomes, date, UPCOMING_ITEMS_LIMIT);

  return {
    currency,
    plannedIncome,
    confirmedPlannedIncome,
    pendingPlannedIncome,
    actualIncomeTotal,
    projectedIncomeTotal,
    plannedExpenses,
    monthBalance,
    projectedBalance,
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
  lines.push(`✅ Уже пришло: *${formatMoney(reality.actualIncomeTotal, currency)}*`);
  if (reality.pendingPlannedIncome > 0) {
    lines.push(`⏳ Ждём подтверждения: *${formatMoney(reality.pendingPlannedIncome, currency)}*`);
  }
  if (reality.floatingMtd > 0) {
    lines.push(`💫 Плавающий доход: *+${formatMoney(reality.floatingMtd, currency)}*`);
  }
  lines.push(`📤 Обязательные платежи: *${formatMoney(reality.plannedExpenses, currency)}*`);

  const balance = reality.monthBalance;
  if (balance >= 0) {
    lines.push(`\n✅ *ИТОГ ПО ФАКТУ: +${formatMoney(balance, currency)}*`);
    lines.push('_Подтверждённых поступлений хватает на обязательные платежи._');
  } else {
    lines.push(`\n⚠️ *ИТОГ ПО ФАКТУ: ${formatMoney(balance, currency)}*`);
    lines.push(`_Пока не хватает по подтверждённым поступлениям: ${formatMoney(Math.abs(balance), currency)}_`);
  }

  if (reality.pendingPlannedIncome > 0) {
    lines.push(`\n📐 Если ожидаемые доходы придут: *${formatMoney(reality.projectedBalance, currency)}*`);
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
