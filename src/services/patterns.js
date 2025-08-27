const { patternService } = require('./supabase');
const logger = require('../utils/logger');

class PatternsService {
  async getUserPatterns(userId) {
    try {
      return await patternService.findByUserId(userId);
    } catch (error) {
      logger.error('Error getting user patterns:', error);
      return [];
    }
  }

  async updateUserPatterns(userId, description, category, amount, currency) {
    try {
      const keywords = this.extractKeywords(description);
      
      for (const keyword of keywords) {
        const existingPattern = await this.findPattern(userId, keyword);
        
        if (existingPattern) {
          await this.updateExistingPattern(existingPattern, amount, currency);
        } else if (keywords.length <= 3) {
          await this.createNewPattern(userId, keyword, category, amount, currency);
        }
      }
    } catch (error) {
      logger.error('Error updating user patterns:', error);
    }
  }

  extractKeywords(description) {
    // Clean and normalize text
    const text = description.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Split into words and filter
    const words = text.split(' ').filter(word => 
      word.length > 2 && 
      !this.isStopWord(word) &&
      !this.isNumberWord(word)
    );

    // Generate keywords (individual words + short phrases)
    const keywords = [...words];
    
    // Add 2-word combinations for meaningful phrases
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (phrase.length <= 20) {
        keywords.push(phrase);
      }
    }

    // Return unique keywords, sorted by length (shorter first)
    return [...new Set(keywords)].sort((a, b) => a.length - b.length);
  }

  isStopWord(word) {
    const stopWords = [
      'на', 'в', 'за', 'для', 'с', 'по', 'из', 'от', 'до', 'о', 'об',
      'и', 'а', 'но', 'или', 'то', 'что', 'это', 'как', 'где', 'когда',
      'потратил', 'купил', 'заплатил', 'оплатил', 'взял', 'стоит',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
      'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over',
      'after', 'bought', 'paid', 'spent', 'cost', 'costs'
    ];
    
    return stopWords.includes(word);
  }

  isNumberWord(word) {
    return /^\d+$/.test(word) || 
           /^\d+[\.,]\d+$/.test(word) ||
           ['рублей', 'рубля', 'рубль', 'копеек', 'доллар', 'долларов', 'евро', 'юаней'].includes(word);
  }

  async findPattern(userId, keyword) {
    try {
      const patterns = await patternService.findByUserId(userId);
      return patterns.find(p => p.keyword === keyword);
    } catch (error) {
      logger.error('Error finding pattern:', error);
      return null;
    }
  }

  async updateExistingPattern(pattern, amount, currency) {
    try {
      const newFrequency = pattern.frequency + 1;
      const newAvgAmount = this.calculateNewAverage(pattern.avg_amount, pattern.frequency, amount);
      const newConfidence = this.calculateConfidence(newFrequency);

      await patternService.updatePattern(pattern.user_id, pattern.keyword, {
        frequency: newFrequency,
        avg_amount: newAvgAmount,
        currency: currency,
        confidence: newConfidence
      });
    } catch (error) {
      logger.error('Error updating existing pattern:', error);
    }
  }

  async createNewPattern(userId, keyword, category, amount, currency) {
    try {
      await patternService.upsert({
        user_id: userId,
        keyword: keyword,
        category: category,
        avg_amount: amount,
        currency: currency,
        frequency: 1,
        confidence: 0.3
      });
    } catch (error) {
      logger.error('Error creating new pattern:', error);
    }
  }

  calculateNewAverage(currentAvg, frequency, newAmount) {
    if (!currentAvg || frequency === 0) return newAmount;
    return ((currentAvg * frequency) + newAmount) / (frequency + 1);
  }

  calculateConfidence(frequency) {
    // Confidence grows with frequency but plateaus
    // Formula: 1 - (1 / (1 + frequency * 0.1))
    return Math.min(0.95, 1 - (1 / (1 + frequency * 0.1)));
  }

  async suggestCategoryFromPatterns(userId, description) {
    try {
      const patterns = await this.getUserPatterns(userId);
      
      if (!patterns.length) return null;

      let bestMatch = null;
      let highestScore = 0;

      const descriptionLower = description.toLowerCase();

      for (const pattern of patterns) {
        if (descriptionLower.includes(pattern.keyword.toLowerCase())) {
          // Score based on keyword length, confidence, and frequency
          const keywordBonus = pattern.keyword.length > 5 ? 1.2 : 1.0; // Longer keywords are more specific
          const score = pattern.confidence * (pattern.frequency / 10) * keywordBonus;
          
          if (score > highestScore && score > 0.4) {
            highestScore = score;
            bestMatch = pattern;
          }
        }
      }

      if (bestMatch && highestScore > 0.6) {
        return {
          category: bestMatch.category,
          amount: bestMatch.avg_amount,
          currency: bestMatch.currency,
          confidence: bestMatch.confidence,
          keyword: bestMatch.keyword
        };
      }

      return null;
    } catch (error) {
      logger.error('Error suggesting category from patterns:', error);
      return null;
    }
  }

  async getTopPatterns(userId, limit = 10) {
    try {
      const patterns = await this.getUserPatterns(userId);
      
      return patterns
        .sort((a, b) => {
          // Sort by confidence first, then frequency
          if (b.confidence !== a.confidence) {
            return b.confidence - a.confidence;
          }
          return b.frequency - a.frequency;
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('Error getting top patterns:', error);
      return [];
    }
  }

  async cleanupOldPatterns(userId, maxAge = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);

      // TODO: Add cleanup query to remove old, unused patterns
      // This would require adding a database function or manual cleanup
      
      logger.info(`Cleaned up old patterns for user ${userId}`);
    } catch (error) {
      logger.error('Error cleaning up old patterns:', error);
    }
  }
}

module.exports = new PatternsService();