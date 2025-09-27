const { getBot } = require('../utils/bot');
const logger = require('../utils/logger');

/**
 * Service to check user membership in PRO channel
 */
class ChannelCheckService {
  constructor() {
    this.proChannelId = process.env.PRO_CHANNEL_ID; // Channel ID with @ or without
  }

  /**
   * Check if user is member of PRO channel
   * @param {string} userId - Telegram user ID
   * @returns {Promise<boolean>} Is user PRO member
   */
  async isUserProMember(userId) {
    try {
      if (!this.proChannelId) {
        logger.warn('PRO_CHANNEL_ID not configured, defaulting to false');
        return false;
      }

      const bot = getBot();
      const chatMember = await bot.getChatMember(this.proChannelId, userId);

      // Valid PRO statuses: creator, administrator, member
      const validStatuses = ['creator', 'administrator', 'member'];
      const isPro = validStatuses.includes(chatMember.status);

      logger.info(`User ${userId} PRO status: ${chatMember.status} -> ${isPro}`);
      return isPro;

    } catch (error) {
      // User not in channel or other error
      logger.info(`User ${userId} not in PRO channel: ${error.message}`);
      return false;
    }
  }

  /**
   * Update user PRO status in database based on channel membership
   * @param {string} userId - User ID to update
   * @returns {Promise<boolean>} Update successful
   */
  async updateUserProStatus(userId) {
    try {
      const isPro = await this.isUserProMember(userId);

      // Update user in database
      const { userService } = require('./supabase');
      await userService.update(userId, { is_premium: isPro });

      logger.info(`Updated user ${userId} PRO status to: ${isPro}`);
      return isPro;

    } catch (error) {
      logger.error(`Error updating user ${userId} PRO status:`, error);
      return false;
    }
  }

  /**
   * Get PRO channel invite link
   * @returns {Promise<string>} Channel invite link
   */
  async getProChannelLink() {
    try {
      if (!this.proChannelId) {
        throw new Error('PRO_CHANNEL_ID not configured');
      }

      const bot = getBot();
      const inviteLink = await bot.exportChatInviteLink(this.proChannelId);

      return inviteLink;
    } catch (error) {
      logger.error('Error getting PRO channel link:', error);
      throw new Error('Не удалось получить ссылку на PRO канал');
    }
  }

  /**
   * Check and sync user PRO status on bot interaction
   * @param {Object} user - User object from database
   * @returns {Promise<Object>} Updated user object
   */
  async syncUserProStatus(user) {
    try {
      const actualProStatus = await this.isUserProMember(user.id);

      // Update if status changed
      if (user.is_premium !== actualProStatus) {
        const { userService } = require('./supabase');
        const updatedUser = await userService.update(user.id, {
          is_premium: actualProStatus
        });

        logger.info(`Synced user ${user.id} PRO status: ${user.is_premium} -> ${actualProStatus}`);
        return updatedUser;
      }

      return user;
    } catch (error) {
      logger.error(`Error syncing user ${user.id} PRO status:`, error);
      return user; // Return original user on error
    }
  }
}

module.exports = new ChannelCheckService();