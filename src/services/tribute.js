const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Tribute API integration service
 * Handles subscription payments and webhook notifications
 */
class TributeService {
  constructor() {
    this.apiKey = process.env.TRIBUTE_API_KEY;
    this.secretKey = process.env.TRIBUTE_SECRET_KEY;
    this.baseURL = 'https://api.tribute.to/v1';
  }

  /**
   * Create payment link for PRO subscription
   * @param {string} userId - User ID for tracking
   * @param {string} userEmail - User email (optional)
   * @returns {Promise<string>} Payment link URL
   */
  async createSubscriptionLink(userId, userEmail = null) {
    try {
      const paymentData = {
        amount: 399, // Price in rubles
        currency: 'RUB',
        description: 'AI Expense Tracker - PRO подписка (1 месяц)',
        external_id: userId, // Track user for webhook
        subscription: true,
        subscription_period: 'monthly',
        success_url: `https://t.me/your_bot?start=payment_success`,
        cancel_url: `https://t.me/your_bot?start=payment_cancelled`,
        webhook_url: `${process.env.WEBHOOK_BASE_URL}/webhook/tribute`
      };

      if (userEmail) {
        paymentData.customer_email = userEmail;
      }

      const response = await axios.post(`${this.baseURL}/payments`, paymentData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info(`Tribute payment link created for user ${userId}: ${response.data.payment_url}`);
      return response.data.payment_url;

    } catch (error) {
      logger.error('Error creating Tribute payment link:', error.response?.data || error.message);
      throw new Error('Не удалось создать ссылку для оплаты');
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Webhook signature from headers
   * @returns {boolean} Is signature valid
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', this.secretKey)
        .update(payload)
        .digest('hex');

      return `sha256=${expectedSignature}` === signature;
    } catch (error) {
      logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Process webhook notification from Tribute
   * @param {Object} webhookData - Webhook payload
   * @returns {Promise<Object>} Processing result
   */
  async processWebhook(webhookData) {
    try {
      const { event, payment } = webhookData;

      switch (event) {
        case 'payment.succeeded':
          return await this.handleSuccessfulPayment(payment);
        case 'payment.failed':
          return await this.handleFailedPayment(payment);
        case 'subscription.cancelled':
          return await this.handleCancelledSubscription(payment);
        default:
          logger.warn(`Unknown Tribute webhook event: ${event}`);
          return { success: false, message: 'Unknown event type' };
      }
    } catch (error) {
      logger.error('Error processing Tribute webhook:', error);
      throw error;
    }
  }

  /**
   * Handle successful payment
   * @param {Object} payment - Payment data from webhook
   */
  async handleSuccessfulPayment(payment) {
    const userId = payment.external_id;
    const amount = payment.amount;
    const paymentId = payment.id;

    logger.info(`Successful payment from user ${userId}: ${amount} RUB (Payment ID: ${paymentId})`);

    // TODO: Activate PRO subscription for user
    // This will be implemented when integrating with user service

    return {
      success: true,
      message: 'Payment processed successfully',
      userId,
      amount,
      paymentId
    };
  }

  /**
   * Handle failed payment
   * @param {Object} payment - Payment data from webhook
   */
  async handleFailedPayment(payment) {
    const userId = payment.external_id;
    const paymentId = payment.id;

    logger.warn(`Failed payment from user ${userId} (Payment ID: ${paymentId})`);

    // TODO: Notify user about failed payment

    return {
      success: true,
      message: 'Failed payment logged',
      userId,
      paymentId
    };
  }

  /**
   * Handle cancelled subscription
   * @param {Object} payment - Payment data from webhook
   */
  async handleCancelledSubscription(payment) {
    const userId = payment.external_id;
    const subscriptionId = payment.subscription_id;

    logger.info(`Cancelled subscription for user ${userId} (Subscription ID: ${subscriptionId})`);

    // TODO: Deactivate PRO subscription for user

    return {
      success: true,
      message: 'Subscription cancellation processed',
      userId,
      subscriptionId
    };
  }

  /**
   * Get payment status
   * @param {string} paymentId - Tribute payment ID
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await axios.get(`${this.baseURL}/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error getting payment status:', error.response?.data || error.message);
      throw new Error('Не удалось получить статус платежа');
    }
  }
}

module.exports = new TributeService();