function formatDate(date, locale = 'ru-RU') {
  const d = new Date(date);
  return d.toLocaleDateString(locale);
}

function formatDateTime(date, locale = 'ru-RU') {
  const d = new Date(date);
  return d.toLocaleString(locale);
}

function getDateRange(period) {
  const today = new Date();
  const startDate = new Date();
  const endDate = new Date();

  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'yesterday':
      startDate.setDate(today.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(today.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'this_week':
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Monday start
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'last_week':
      const lastWeekStart = new Date(today);
      const dayOfWeekLast = today.getDay();
      const diffLast = today.getDate() - dayOfWeekLast - 6;
      lastWeekStart.setDate(diffLast);
      lastWeekStart.setHours(0, 0, 0, 0);
      
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      lastWeekEnd.setHours(23, 59, 59, 999);
      
      return { startDate: lastWeekStart, endDate: lastWeekEnd };
      
    case 'this_month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setMonth(today.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'last_month':
      startDate.setMonth(today.getMonth() - 1);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setMonth(today.getMonth());
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'last_3_months':
      startDate.setMonth(today.getMonth() - 3);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'this_year':
      startDate.setMonth(0);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'last_year':
      startDate.setFullYear(today.getFullYear() - 1);
      startDate.setMonth(0);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setFullYear(today.getFullYear() - 1);
      endDate.setMonth(11);
      endDate.setDate(31);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    default:
      // Default to this month
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setMonth(today.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

function getMonthYearFromPeriod(month, year) {
  const currentDate = new Date();
  
  // If no month/year provided, use current
  if (!month && !year) {
    return {
      month: currentDate.getMonth() + 1,
      year: currentDate.getFullYear()
    };
  }
  
  return {
    month: month || (currentDate.getMonth() + 1),
    year: year || currentDate.getFullYear()
  };
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

function parseRelativeDate(text) {
  const textLower = text.toLowerCase();
  const today = new Date();
  
  if (textLower.includes('сегодня') || textLower.includes('today')) {
    return today.toISOString().split('T')[0];
  }
  
  if (textLower.includes('вчера') || textLower.includes('yesterday')) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  if (textLower.includes('позавчера')) {
    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(today.getDate() - 2);
    return dayBeforeYesterday.toISOString().split('T')[0];
  }
  
  // Check for "N дней назад"
  const daysAgoMatch = textLower.match(/(\d+)\s*(день|дня|дней)\s*назад/);
  if (daysAgoMatch) {
    const daysAgo = parseInt(daysAgoMatch[1]);
    const date = new Date(today);
    date.setDate(today.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} мин`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} ч`;
  }
  
  return `${hours} ч ${remainingMinutes} мин`;
}

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

module.exports = {
  formatDate,
  formatDateTime,
  getDateRange,
  getMonthYearFromPeriod,
  isValidDate,
  parseRelativeDate,
  formatDuration,
  getDaysInMonth,
  getWeekNumber
};