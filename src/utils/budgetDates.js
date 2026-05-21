/**
 * Calendar helpers for family budget (local dates, day-of-month rules).
 */

const MONTH_NAMES_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
];

function currentPlanMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatPlanMonthLabel(planMonth) {
  const [year, mm] = (planMonth || currentPlanMonth()).split('-');
  const name = MONTH_NAMES_RU[parseInt(mm, 10) - 1] || mm;
  return `${name} ${year}`;
}

function clampDayOfMonth(year, month, day) {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(day, lastDay);
}

/**
 * Next occurrence of day_of_month on or after fromDate (local calendar).
 */
function nextOccurrence(fromDate, dayOfMonth) {
  const y = fromDate.getFullYear();
  const m = fromDate.getMonth();
  let day = clampDayOfMonth(y, m + 1, dayOfMonth);
  let candidate = new Date(y, m, day);
  candidate.setHours(0, 0, 0, 0);
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  if (candidate < from) {
    const nextM = m + 1;
    const ny = nextM > 11 ? y + 1 : y;
    const nm = nextM % 12;
    day = clampDayOfMonth(ny, nm + 1, dayOfMonth);
    candidate = new Date(ny, nm, day);
    candidate.setHours(0, 0, 0, 0);
  }
  return candidate;
}

function daysBetween(fromDate, toDate) {
  const a = new Date(fromDate);
  const b = new Date(toDate);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function formatDaysLeft(days) {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days > 1) return `через ${days} дн.`;
  return `через ${Math.abs(days)} дн. (просрочено)`;
}

function formatDateRu(date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${d}.${m}`;
}

/**
 * @param {Array<{day_of_month: number}>} items
 * @param {Date} fromDate
 * @param {number} limit
 */
function sortByUpcoming(items, fromDate, limit = 3) {
  return items
    .map((item) => ({
      ...item,
      nextDate: nextOccurrence(fromDate, item.day_of_month),
      daysLeft: daysBetween(fromDate, nextOccurrence(fromDate, item.day_of_month))
    }))
    .sort((a, b) => a.nextDate - b.nextDate)
    .slice(0, limit);
}

function getMonthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Parse IANA-ish offset from timezone string like "Europe/Moscow" — fallback UTC.
 * For MVP use env default or stored offset; full TZ lib optional later.
 */
function getLocalHour(date, timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

function getLocalDateString(date, timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

module.exports = {
  currentPlanMonth,
  formatPlanMonthLabel,
  clampDayOfMonth,
  nextOccurrence,
  daysBetween,
  formatDaysLeft,
  formatDateRu,
  sortByUpcoming,
  getMonthBounds,
  isSameLocalDay,
  getLocalHour,
  getLocalDateString
};
