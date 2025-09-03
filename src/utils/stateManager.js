const logger = require('./logger');

class StateManager {
  constructor() {
    this.states = new Map(); // chatId -> { type, data, expires }
    this.cleanup();
  }

  // Set user state
  setState(chatId, type, data = {}, ttlMinutes = 10) {
    const expires = Date.now() + (ttlMinutes * 60 * 1000);
    this.states.set(chatId, {
      type,
      data,
      expires
    });
    logger.info(`State set: ${chatId} -> ${type}`);
  }

  // Get user state
  getState(chatId) {
    const state = this.states.get(chatId);
    if (!state) return null;
    
    if (Date.now() > state.expires) {
      this.states.delete(chatId);
      logger.info(`State expired: ${chatId}`);
      return null;
    }
    
    return state;
  }

  // Clear user state
  clearState(chatId) {
    const deleted = this.states.delete(chatId);
    if (deleted) {
      logger.info(`State cleared: ${chatId}`);
    }
    return deleted;
  }

  // Check if user has specific state
  hasState(chatId, type = null) {
    const state = this.getState(chatId);
    if (!state) return false;
    return type ? state.type === type : true;
  }

  // Update state data
  updateStateData(chatId, newData) {
    const state = this.getState(chatId);
    if (!state) return false;
    
    state.data = { ...state.data, ...newData };
    logger.info(`State updated: ${chatId}`);
    return true;
  }

  // Cleanup expired states every 5 minutes
  cleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [chatId, state] of this.states.entries()) {
        if (now > state.expires) {
          this.states.delete(chatId);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired states`);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Get stats
  getStats() {
    return {
      totalStates: this.states.size,
      stateTypes: Array.from(this.states.values()).reduce((acc, state) => {
        acc[state.type] = (acc[state.type] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

// State types constants
const STATE_TYPES = {
  WAITING_EXPENSE_DESCRIPTION: 'WAITING_EXPENSE_DESCRIPTION',
  WAITING_CUSTOM_CATEGORY: 'WAITING_CUSTOM_CATEGORY',
  WAITING_PROJECT_NAME: 'WAITING_PROJECT_NAME',
  WAITING_CUSTOM_AMOUNT: 'WAITING_CUSTOM_AMOUNT',
  WAITING_PROJECT_KEYWORDS: 'WAITING_PROJECT_KEYWORDS',
  WAITING_GOOGLE_SHEETS_LINK: 'WAITING_GOOGLE_SHEETS_LINK'
};

const stateManager = new StateManager();

module.exports = {
  stateManager,
  STATE_TYPES
};