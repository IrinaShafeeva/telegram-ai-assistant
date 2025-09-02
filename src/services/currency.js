const logger = require('../utils/logger');

class CurrencyService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour cache
  }

  async getExchangeRates(baseCurrency = 'USD') {
    const cacheKey = `rates_${baseCurrency}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.rates;
    }

    try {
      // Using exchangerate-api.com (free tier: 1500 requests/month)
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`);
      
      if (!response.ok) {
        throw new Error(`Currency API error: ${response.status}`);
      }
      
      const data = await response.json();
      const rates = data.rates;
      
      // Cache the result
      this.cache.set(cacheKey, {
        rates,
        timestamp: Date.now()
      });
      
      logger.info(`Currency rates updated for ${baseCurrency}`);
      return rates;
      
    } catch (error) {
      logger.error('Failed to fetch currency rates:', error);
      
      // Fallback to approximate rates if API fails
      return this.getFallbackRates(baseCurrency);
    }
  }

  getFallbackRates(baseCurrency) {
    const fallbackRates = {
      'USD': {
        'RUB': 90,
        'EUR': 0.85,
        'GBP': 0.73,
        'JPY': 110,
        'CNY': 7.2,
        'KZT': 450,
        'UAH': 27,
        'USD': 1
      },
      'EUR': {
        'RUB': 106,
        'USD': 1.18,
        'GBP': 0.86,
        'JPY': 130,
        'CNY': 8.5,
        'KZT': 530,
        'UAH': 32,
        'EUR': 1
      },
      'RUB': {
        'USD': 0.011,
        'EUR': 0.0094,
        'GBP': 0.0081,
        'JPY': 1.22,
        'CNY': 0.08,
        'KZT': 5,
        'UAH': 0.3,
        'RUB': 1
      }
    };

    logger.warn(`Using fallback rates for ${baseCurrency}`);
    return fallbackRates[baseCurrency] || fallbackRates['USD'];
  }

  async convertAmount(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return parseFloat(amount);
    }

    try {
      const rates = await this.getExchangeRates(fromCurrency);
      const rate = rates[toCurrency];
      
      if (!rate) {
        throw new Error(`No exchange rate found for ${fromCurrency} -> ${toCurrency}`);
      }
      
      return parseFloat(amount) * rate;
      
    } catch (error) {
      logger.error(`Currency conversion error: ${fromCurrency} -> ${toCurrency}`, error);
      return parseFloat(amount); // Return original amount if conversion fails
    }
  }

  async convertExpenses(expenses, targetCurrency) {
    const convertedExpenses = [];
    
    for (const expense of expenses) {
      const convertedAmount = await this.convertAmount(
        expense.amount, 
        expense.currency, 
        targetCurrency
      );
      
      convertedExpenses.push({
        ...expense,
        originalAmount: expense.amount,
        originalCurrency: expense.currency,
        amount: convertedAmount,
        currency: targetCurrency
      });
    }
    
    return convertedExpenses;
  }

  formatAmount(amount, currency) {
    const symbols = {
      'RUB': '₽',
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CNY': '¥',
      'KZT': '₸',
      'UAH': '₴'
    };
    
    const symbol = symbols[currency] || currency;
    const rounded = Math.round(amount * 100) / 100;
    
    return `${rounded.toLocaleString()} ${symbol}`;
  }
}

module.exports = new CurrencyService();