const { supabase, projectService } = require('./supabase');
const logger = require('../utils/logger');

/**
 * Сервис для получения пользовательского контекста для AI
 * Предоставляет кастомные категории и проекты с ключевыми словами
 */
class UserContextService {

  /**
   * Получить полный контекст пользователя для AI
   * @param {string} userId - ID пользователя
   * @returns {Object} { categories: [], projects: [] }
   */
  async getUserContext(userId) {
    try {
      const [categoriesResult, projectsResult, userResult] = await Promise.all([
        this.getUserCategories(userId),
        this.getUserProjects(userId),
        this.getUserCurrency(userId)
      ]);

      return {
        categories: categoriesResult,
        projects: projectsResult,
        primaryCurrency: userResult
      };
    } catch (error) {
      logger.error('Failed to get user context:', error);
      return { categories: [], projects: [], primaryCurrency: 'RUB' };
    }
  }

  /**
   * Получить кастомные категории пользователя
   * @param {string} userId - ID пользователя
   * @returns {Array} Массив категорий с ключевыми словами
   */
  async getUserCategories(userId) {
    try {
      const { data, error } = await supabase
        .from('custom_categories')
        .select('id, name, keywords')
        .eq('user_id', userId);

      if (error) {
        logger.error('Error fetching user categories:', error);
        return [];
      }

      // Фильтруем кастомные категории и добавляем fallback ключевые слова
      return (data || [])
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          // Если нет ключевых слов - используем название категории как ключевое слово
          keywords: cat.keywords && cat.keywords.trim() ? cat.keywords : cat.name.toLowerCase()
        }));
    } catch (error) {
      logger.error('Error in getUserCategories:', error);
      return [];
    }
  }

  /**
   * Получить кастомные проекты пользователя (кроме "Личные траты")
   * @param {string} userId - ID пользователя
   * @returns {Array} Массив проектов с ключевыми словами
   */
  async getUserProjects(userId) {
    try {
      // Берем все проекты пользователя
      const projects = await projectService.findByUserId(userId);

      // Возвращаем все проекты с подготовленными keywords (ИИ сам выберет нужный)
      return (projects || [])
        .map(proj => ({
          id: proj.id,
          name: proj.name,
          keywords:
            proj.keywords && typeof proj.keywords === 'string' && proj.keywords.trim().length > 0
              ? proj.keywords
              : (proj.name || '').toLowerCase()
        }));
    } catch (error) {
      logger.error('Error in getUserProjects:', error);
      return [];
    }
  }

  /**
   * Получить дефолтный проект "Личные траты"
   * @param {string} userId - ID пользователя
   * @returns {Object|null} Дефолтный проект
   */
  async getDefaultProject(userId) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('owner_id', userId)
        .eq('name', 'Личные траты')
        .eq('is_active', true)
        .single();

      if (error || !data) {
        logger.error('Default project not found:', error);
        return null;
      }

      return data;
    } catch (error) {
      logger.error('Error getting default project:', error);
      return null;
    }
  }

  /**
   * Получить валюту пользователя по умолчанию
   * @param {string} userId - ID пользователя
   * @returns {string} Валюта пользователя или 'RUB' по умолчанию
   */
  async getUserCurrency(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('primary_currency')
        .eq('id', userId)
        .single();

      if (error || !data || !data.primary_currency) {
        return 'RUB'; // Дефолтная валюта
      }

      return data.primary_currency;
    } catch (error) {
      logger.error('Error getting user currency:', error);
      return 'RUB';
    }
  }

  /**
   * Форматировать контекст для AI промпта
   * @param {Object} context - { categories: [], projects: [] }
   * @returns {string} Отформатированная строка для промпта
   */
  formatContextForAI(context) {
    const { categories, projects } = context;

    let contextStr = '';

    if (projects.length > 0) {
      contextStr += 'ПОЛЬЗОВАТЕЛЬСКИЕ ПРОЕКТЫ (приоритет):\n';
      contextStr += projects.map(p => `- ${p.name}: ${p.keywords}`).join('\n');
      contextStr += '\n\n';
    }

    if (categories.length > 0) {
      contextStr += 'ПОЛЬЗОВАТЕЛЬСКИЕ КАТЕГОРИИ (приоритет):\n';
      contextStr += categories.map(c => `- ${c.name}: ${c.keywords}`).join('\n');
      contextStr += '\n\n';
    }

    return contextStr;
  }
}

module.exports = new UserContextService();