/**
 * Generate short ID for temporary data (instead of UUID)
 * Uses base36 timestamp + random chars to keep under 16 chars
 * @returns {string} Short ID (max 16 characters)
 */
function generateShortId() {
  const timestamp = Date.now().toString(36); // ~8 chars
  const random = Math.random().toString(36).substring(2, 8); // 6 chars
  return timestamp + random; // ~14 chars total
}

module.exports = {
  generateShortId
};