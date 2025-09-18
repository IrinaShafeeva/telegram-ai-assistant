const logger = require('./logger');

// Global mapping for short transaction IDs to full data
const shortTransactionMap = new Map();

// Clean up expired mappings every 10 minutes
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  // Since we don't store timestamps, we'll keep entries for 1 hour max
  if (shortTransactionMap.size > 100) {
    // If too many entries, clear old ones (FIFO-like behavior)
    const entries = Array.from(shortTransactionMap.entries());
    const toDelete = entries.slice(0, Math.floor(entries.length / 2));

    toDelete.forEach(([key]) => {
      shortTransactionMap.delete(key);
      cleanedCount++;
    });

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old transaction mappings`);
    }
  }
}, 10 * 60 * 1000); // 10 minutes

module.exports = {
  shortTransactionMap
};