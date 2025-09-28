const { getBot } = require('../utils/bot');
const logger = require('../utils/logger');

/**
 * Handle webhook notifications from @tribute bot
 */
async function handleTributeWebhook(payload) {
  try {
    logger.info('Received Tribute webhook:', JSON.stringify(payload, null, 2));

    // Extract data from @tribute webhook
    const { event, user_id, amount, currency, status, subscription_id } = payload;

    if (!event || !user_id) {
      logger.warn('Invalid Tribute webhook payload - missing required fields');
      return;
    }

    const bot = getBot();
    const proChannelId = process.env.PRO_CHANNEL_ID;

    if (!bot || !proChannelId) {
      logger.error('Bot or PRO_CHANNEL_ID not configured');
      return;
    }

    switch (event) {
      case 'payment_successful':
      case 'subscription_activated':
        await handlePaymentSuccess(user_id, amount, currency, subscription_id);
        break;

      case 'subscription_cancelled':
      case 'subscription_expired':
      case 'payment_failed':
        await handlePaymentFailure(user_id, subscription_id);
        break;

      default:
        logger.info(`Unhandled Tribute event: ${event}`);
    }

  } catch (error) {
    logger.error('Error processing Tribute webhook:', error);
    throw error;
  }
}

/**
 * Handle successful payment - assign PRO title
 */
async function handlePaymentSuccess(userId, amount, currency, subscriptionId) {
  try {
    const bot = getBot();
    const proChannelId = process.env.PRO_CHANNEL_ID;

    logger.info(`Processing payment success for user ${userId}: ${amount} ${currency}`);

    // Check if user is in the channel
    try {
      const chatMember = await bot.getChatMember(proChannelId, userId);

      if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {
        logger.warn(`User ${userId} not in PRO channel, cannot assign title`);
        return;
      }

      // Assign PRO Subscriber title
      await bot.setChatAdministrator(proChannelId, userId, {
        can_manage_chat: false,
        can_delete_messages: false,
        can_manage_video_chats: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: false,
        can_post_messages: false,
        can_edit_messages: false,
        can_pin_messages: false,
        is_anonymous: false
      });

      // Set custom title
      await bot.setChatAdministratorCustomTitle(proChannelId, userId, 'PRO Subscriber');

      logger.info(`✅ Assigned PRO title to user ${userId}`);

      // Update user in database
      const { userService } = require('./supabase');
      await userService.update(userId, {
        is_premium: true,
        pro_plan_type: 'tribute'
      });

      // Notify user about activation
      try {
        await bot.sendMessage(userId,
          `🎉 PRO подписка активирована!

💎 Вам присвоен статус "PRO Subscriber"
💰 Оплачено: ${amount} ${currency}

✨ Все PRO функции теперь доступны!
Используйте команду /projects для начала работы.`
        );
      } catch (notifyError) {
        logger.warn(`Could not notify user ${userId} about PRO activation:`, notifyError.message);
      }

    } catch (channelError) {
      logger.error(`Error accessing channel for user ${userId}:`, channelError);
    }

  } catch (error) {
    logger.error(`Error handling payment success for user ${userId}:`, error);
  }
}

/**
 * Handle payment failure/cancellation - remove PRO title
 */
async function handlePaymentFailure(userId, subscriptionId) {
  try {
    const bot = getBot();
    const proChannelId = process.env.PRO_CHANNEL_ID;

    logger.info(`Processing payment failure/cancellation for user ${userId}`);

    try {
      const chatMember = await bot.getChatMember(proChannelId, userId);

      // If user is admin with PRO title, demote to regular member
      if (chatMember.status === 'administrator' &&
          chatMember.custom_title === 'PRO Subscriber') {

        await bot.promoteChatMember(proChannelId, userId, {
          can_manage_chat: false,
          can_delete_messages: false,
          can_manage_video_chats: false,
          can_restrict_members: false,
          can_promote_members: false,
          can_change_info: false,
          can_invite_users: false,
          can_post_messages: false,
          can_edit_messages: false,
          can_pin_messages: false,
          is_anonymous: false
        });

        logger.info(`✅ Removed PRO title from user ${userId}`);
      }

      // Update user in database
      const { userService } = require('./supabase');
      await userService.update(userId, {
        is_premium: false,
        pro_plan_type: null
      });

      // Notify user about deactivation
      try {
        await bot.sendMessage(userId,
          `⏰ PRO подписка деактивирована

💔 Ваш PRO статус больше не активен
📅 Причина: отмена или истечение подписки

💎 Для возобновления PRO статуса используйте команду /settings`
        );
      } catch (notifyError) {
        logger.warn(`Could not notify user ${userId} about PRO deactivation:`, notifyError.message);
      }

    } catch (channelError) {
      logger.error(`Error accessing channel for user ${userId}:`, channelError);
    }

  } catch (error) {
    logger.error(`Error handling payment failure for user ${userId}:`, error);
  }
}

module.exports = {
  handleTributeWebhook
};