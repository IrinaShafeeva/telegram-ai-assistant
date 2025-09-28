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
   * Check if user has PAID PRO subscription (not just channel membership)
   * @param {string} userId - Telegram user ID
   * @returns {Promise<boolean>} Is user PRO subscriber with payment
   */
  async isUserProMember(userId) {
    try {
      if (!this.proChannelId) {
        logger.warn('PRO_CHANNEL_ID not configured, defaulting to false');
        return false;
      }

      const bot = getBot();
      const chatMember = await bot.getChatMember(this.proChannelId, userId);

      // Check if user is in channel first
      const validStatuses = ['creator', 'administrator', 'member'];
      if (!validStatuses.includes(chatMember.status)) {
        logger.info(`User ${userId} not in PRO channel: ${chatMember.status}`);
        return false;
      }

      // For channel members, check if they have PAID subscriber role
      // @tribute should give custom title "PRO Subscriber" to paid users
      const isPaidSubscriber = this.checkPaidSubscriberStatus(chatMember);

      logger.info(`User ${userId} channel status: ${chatMember.status}, paid subscriber: ${isPaidSubscriber}`);
      return isPaidSubscriber;

    } catch (error) {
      // User not in channel or other error
      logger.info(`User ${userId} not in PRO channel: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if user has paid subscriber status based on their role/title
   * @param {Object} chatMember - Telegram chat member object
   * @returns {boolean} Is paid subscriber
   */
  checkPaidSubscriberStatus(chatMember) {
    // Method 1: Check custom title (assigned by our webhook system)
    if (chatMember.custom_title) {
      const paidTitles = ['PRO Subscriber', 'Paid Member', 'Tribute Subscriber'];
      if (paidTitles.some(title => chatMember.custom_title.includes(title))) {
        return true;
      }
    }

    // Method 2: Check if user is creator (channel owner gets PRO)
    if (chatMember.status === 'creator') {
      return true;
    }

    // Method 3: Check if user is administrator with PRO title
    // (Our webhook system makes paid users admins with limited rights)
    if (chatMember.status === 'administrator' && chatMember.custom_title === 'PRO Subscriber') {
      return true;
    }

    // All other cases - no PRO access
    return false;
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