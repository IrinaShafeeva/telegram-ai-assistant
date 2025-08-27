function getBot() {
  if (!global.bot) {
    throw new Error('Bot is not initialized');
  }
  return global.bot;
}

module.exports = { getBot };