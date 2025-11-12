const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupDatabase() {
  try {
    // Test connection
    const { data, error } = await supabase.from('users').select('count').single();
    if (error && error.code !== 'PGRST116') {
      logger.info('Setting up database tables...');
      await createTables();
    }

    // Always run migrations
    await runMigrations();

    logger.info('Database connection established');
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
}

async function runMigrations() {
  logger.info('Running database migrations...');

  // Check if required columns exist and log warnings if they don't
  const columnsToCheck = [
    { table: 'user_patterns', column: 'confidence', type: 'DECIMAL(3,2) DEFAULT 0.5' },
    { table: 'projects', column: 'keywords', type: 'TEXT' },
    { table: 'users', column: 'pro_expires_at', type: 'TIMESTAMP' },
    { table: 'users', column: 'pro_plan_type', type: 'VARCHAR(20)' },
    { table: 'projects', column: 'is_collaborative', type: 'BOOLEAN DEFAULT FALSE' }
  ];

  for (const { table, column, type } of columnsToCheck) {
    try {
      const { error } = await supabase
        .from(table)
        .select(column)
        .limit(1);

      if (error && error.code === 'PGRST204') {
        logger.warn(`Column ${column} missing in ${table}. Add manually: ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
      } else {
        logger.info(`Column ${column} exists in ${table}`);
      }
    } catch (error) {
      logger.warn(`Could not check ${column} column in ${table}:`, error);
    }
  }

  logger.info('Migration checks completed');
}

async function createTables() {
  // For now, we'll skip automatic table creation and assume tables exist
  // Tables should be created manually in Supabase dashboard
  logger.info('Skipping table creation - please create tables manually in Supabase');
  return;
  
  const tables = [
    // Users table
    `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username VARCHAR(50),
      first_name VARCHAR(100),
      language_code VARCHAR(10) DEFAULT 'en',
      primary_currency VARCHAR(3) DEFAULT 'USD',
      timezone VARCHAR(50) DEFAULT 'UTC',
      is_premium BOOLEAN DEFAULT FALSE,
      daily_ai_questions_used INTEGER DEFAULT 0,
      daily_syncs_used INTEGER DEFAULT 0,
      last_ai_reset DATE DEFAULT CURRENT_DATE,
      last_sync_date DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    `,
    
    // Projects table
    `
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id BIGINT REFERENCES users(id),
      name VARCHAR(100) NOT NULL,
      description TEXT,
      keywords TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      google_sheet_id VARCHAR(100),
      google_sheet_url TEXT,
      is_collaborative BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    `,
    
    // Project members table
    `
    CREATE TABLE IF NOT EXISTS project_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      user_id BIGINT REFERENCES users(id),
      role VARCHAR(20) DEFAULT 'editor',
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, user_id)
    );
    `,

    // Project invites table
    `
    CREATE TABLE IF NOT EXISTS project_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      token VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    `,

    // Expenses table
    `
    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id BIGINT REFERENCES users(id),
      project_id UUID REFERENCES projects(id),
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) NOT NULL,
      category VARCHAR(50) NOT NULL,
      description TEXT,
      expense_date DATE NOT NULL,
      source VARCHAR(20) DEFAULT 'bot',
      sheets_row_id INTEGER,
      synced_to_sheets BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    `,
    
    // Incomes table
    `
    CREATE TABLE IF NOT EXISTS incomes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id BIGINT REFERENCES users(id),
      project_id UUID REFERENCES projects(id),
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) NOT NULL,
      category VARCHAR(50) NOT NULL,
      description TEXT,
      income_date DATE NOT NULL,
      source VARCHAR(20) DEFAULT 'bot',
      sheets_row_id INTEGER,
      synced_to_sheets BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    `,
    
    // User patterns table (Smart Defaults)
    `
    CREATE TABLE IF NOT EXISTS user_patterns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id BIGINT REFERENCES users(id),
      keyword VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      avg_amount DECIMAL(10,2),
      currency VARCHAR(3),
      frequency INTEGER DEFAULT 1,
      confidence DECIMAL(3,2) DEFAULT 0.5,
      last_used TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    );
    `,
    
    // Custom categories table
    `
    CREATE TABLE IF NOT EXISTS custom_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id BIGINT REFERENCES users(id),
      name VARCHAR(50) NOT NULL,
      emoji VARCHAR(10),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, name)
    );
    `
  ];

  for (const table of tables) {
    const { error } = await supabase.rpc('execute_sql', { sql: table });
    if (error) {
      logger.error('Error creating table:', error);
    }
  }
}

// User operations
const userService = {
  async create(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async isTeamMember(userId) {
    // Check if user is a member of any collaborative project
    const { data, error } = await supabase
      .from('project_members')
      .select(`
        project:projects!inner(is_collaborative)
      `)
      .eq('user_id', userId)
      .eq('projects.is_collaborative', true)
      .limit(1);

    if (error) throw error;
    return (data && data.length > 0);
  },

  async hasUnlimitedAccess(userId) {
    // Check if user has premium OR is team member
    const user = await this.findById(userId);
    if (!user) return false;

    if (user.is_premium) return true;

    // Check if user is team member
    return await this.isTeamMember(userId);
  },

  async canCreateProject(userId) {
    // Check if user is PRO
    const user = await this.findById(userId);
    if (!user) return false;

    if (user.is_premium) return true;

    // For non-PRO users, check if they have any owned projects
    const projects = await projectService.findByUserId(userId);
    const ownedProjects = projects.filter(p => p.user_role === 'owner');

    // Non-PRO users can create only 1 project ("Личные траты")
    // This includes team members - they can have 1 personal project
    return ownedProjects.length === 0;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async checkDailyLimits(userId, action) {
    // Check if user has unlimited access (PRO or team member)
    const hasUnlimited = await this.hasUnlimitedAccess(userId);
    if (hasUnlimited) return true;

    const user = await this.findById(userId);
    if (!user) return false;

    const today = new Date().toISOString().split('T')[0];
    
    // Reset counters if new day
    if (user.last_ai_reset !== today) {
      await this.update(userId, {
        daily_ai_questions_used: 0,
        daily_syncs_used: 0,
        last_ai_reset: today
      });
      user.daily_ai_questions_used = 0;
      user.daily_syncs_used = 0;
    }

    const limits = user.is_premium 
      ? { ai_questions: 20, syncs: 10 }
      : { ai_questions: 5, syncs: 1 };

    if (action === 'ai_question') {
      return user.daily_ai_questions_used < limits.ai_questions;
    }
    
    if (action === 'sync') {
      return user.daily_syncs_used < limits.syncs;
    }

    return true;
  },

  async incrementDailyUsage(userId, action) {
    const field = action === 'ai_question' ? 'daily_ai_questions_used' : 'daily_syncs_used';
    const { error } = await supabase.rpc('increment_counter', {
      p_user_id: userId,
      p_counter_field: field
    });

    if (error) throw error;
  },

  async checkMonthlyRecordsLimit(userId) {
    // Check if user has unlimited access (PRO or team member)
    const hasUnlimited = await this.hasUnlimitedAccess(userId);
    if (hasUnlimited) return true;

    const { SUBSCRIPTION_LIMITS } = require('../config/constants');
    const limit = SUBSCRIPTION_LIMITS.FREE.expenses_per_month;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Count both expenses and incomes for this month
    const [expensesResult, incomesResult] = await Promise.all([
      supabase
        .from('expenses')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .gte('expense_date', startOfMonth.toISOString().split('T')[0])
        .lte('expense_date', endOfMonth.toISOString().split('T')[0]),

      supabase
        .from('incomes')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .gte('income_date', startOfMonth.toISOString().split('T')[0])
        .lte('income_date', endOfMonth.toISOString().split('T')[0])
    ]);

    const totalRecords = (expensesResult.count || 0) + (incomesResult.count || 0);
    return totalRecords < limit;
  }
};

// Project operations
const projectService = {
  async create(projectData) {
    const { data, error } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async findByUserId(userId) {
    // Get projects where user is owner
    const { data: ownedProjects, error: ownedError } = await supabase
      .from('projects')
      .select(`
        *,
        project_members(user_id, role)
      `)
      .eq('owner_id', userId);

    if (ownedError) throw ownedError;

    // Get projects where user is a member
    const { data: memberProjects, error: memberError } = await supabase
      .from('projects')
      .select(`
        *,
        project_members!inner(user_id, role)
      `)
      .eq('project_members.user_id', userId)
      .neq('owner_id', userId); // Exclude owned projects to avoid duplicates

    if (memberError) throw memberError;

    // Combine and add role information
    const allProjects = [
      ...(ownedProjects || []).map(p => ({ ...p, user_role: 'owner' })),
      ...(memberProjects || []).map(p => ({ ...p, user_role: p.project_members[0]?.role || 'member' }))
    ];

    return allProjects;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async addMember(projectId, userId, role = 'editor') {
    // Check member count limit
    const memberCount = await projectMemberService.getMemberCount(projectId);
    const project = await this.findById(projectId);
    const owner = await userService.findById(project.owner_id);

    // FREE: max 3 members total (owner + 2 members)
    // PRO: max 30 members total (owner + 29 members)
    const maxMembers = owner.is_premium ? 30 : 3;

    if (memberCount >= maxMembers) {
      const limit = owner.is_premium ? '30' : '3';
      throw new Error(`Достигнут лимит участников проекта (${limit} ${owner.is_premium ? 'человек' : 'человека'}). ${!owner.is_premium ? 'Обновитесь до PRO для увеличения лимита до 30.' : ''}`);
    }

    const { data, error } = await supabase
      .from('project_members')
      .insert({ project_id: projectId, user_id: userId, role })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Пользователь уже является участником проекта');
      }
      throw error;
    }
    return data;
  },

  async removeMember(projectId, userId) {
    const { data, error } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getMembers(projectId) {
    const { data, error } = await supabase
      .from('project_members')
      .select(`
        *,
        user:users(id, username, first_name)
      `)
      .eq('project_id', projectId);

    if (error) throw error;
    return data;
  },

  async getUserProjects(userId) {
    // Get projects where user is owner OR member
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        project_members!inner(user_id, role)
      `)
      .or(`owner_id.eq.${userId},project_members.user_id.eq.${userId}`);

    if (error) throw error;
    return data;
  },

  async makeCollaborative(projectId, ownerId) {
    // Check if user is owner
    const project = await this.findById(projectId);
    if (!project || project.owner_id !== ownerId) {
      throw new Error('Only project owner can make project collaborative');
    }

    const { data, error } = await supabase
      .from('projects')
      .update({ is_collaborative: true })
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async hasAccess(projectId, userId) {
    // Check if user is owner
    const project = await this.findById(projectId);
    if (project && project.owner_id === userId) return { access: true, role: 'owner' };

    // Check if user is a member
    const { data, error } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return { access: !!data, role: data?.role || null };
  },

  async delete(id) {
    // First, delete all related expenses and incomes
    // This is necessary because of foreign key constraints
    
    // Delete expenses for this project
    const { error: expenseError } = await supabase
      .from('expenses')
      .delete()
      .eq('project_id', id);
    
    if (expenseError) {
      logger.error('Error deleting project expenses:', expenseError);
      throw new Error('Failed to delete project expenses: ' + expenseError.message);
    }
    
    // Delete incomes for this project
    const { error: incomeError } = await supabase
      .from('incomes')
      .delete()
      .eq('project_id', id);
    
    if (incomeError) {
      logger.error('Error deleting project incomes:', incomeError);
      throw new Error('Failed to delete project incomes: ' + incomeError.message);
    }
    
    // Delete project members (if any)
    const { error: memberError } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', id);
    
    if (memberError) {
      logger.warn('Error deleting project members (might not exist):', memberError);
      // Don't throw error for members as table might not exist or be empty
    }
    
    // Finally, delete the project itself
    const { data, error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async findProjectByKeywords(userId, text) {
    try {
      // Get all user's projects with keywords
      const projects = await this.findByUserId(userId);
      logger.info(`🔍 Found ${projects?.length || 0} projects for user ${userId}`);
      
      if (!projects || projects.length === 0) return null;
      
      const textLower = text.toLowerCase();
      logger.info(`🔤 Analyzing text: "${textLower}"`);
      
      // Log all projects and their keywords
      projects.forEach(p => {
        logger.info(`📁 Project: ${p.name}, Active: ${p.is_active}, Keywords: ${p.keywords || 'none'}`);
      });
      
      // Check each project's keywords (only if keywords field exists)
      for (const project of projects) {
        if (project.keywords) {
          const keywords = project.keywords.split(',').map(k => k.trim().toLowerCase());
          logger.info(`🔍 Checking keywords for ${project.name}: ${keywords.join(', ')}`);
          
          // Check if any keyword is found in the text
          for (const keyword of keywords) {
            if (textLower.includes(keyword)) {
              logger.info(`✅ MATCH! Keyword "${keyword}" found in text, selecting project: ${project.name}`);
              return project;
            }
          }
        }
      }
      
      // Return default active project if no keywords match
      const defaultProject = projects.find(p => p.is_active) || projects[0];
      logger.info(`❌ No keyword matches, using default: ${defaultProject?.name}`);
      return defaultProject;
    } catch (error) {
      logger.error('Error in findProjectByKeywords (possibly missing keywords field):', error);
      // Fallback to regular findByUserId
      const projects = await this.findByUserId(userId);
      return projects?.find(p => p.is_active) || projects?.[0] || null;
    }
  }
};

// Expense operations
const expenseService = {
  async create(expenseData) {
    const { data, error } = await supabase
      .from('expenses')
      .insert(expenseData)
      .select()
      .single();

    if (error) throw error;

    // Notify team members if collaborative project
    try {
      const project = await projectService.findById(expenseData.project_id);
      if (project && project.is_collaborative) {
        const user = await userService.findById(expenseData.user_id);
        const userName = user?.first_name || user?.username || 'Участник';

        await projectMemberService.notifyProjectMembers(
          expenseData.project_id,
          `💸 Новый расход в проекте "${project.name}"\n\n` +
          `👤 ${userName}\n` +
          `📝 ${expenseData.description}\n` +
          `💰 ${expenseData.amount} ${expenseData.currency}`,
          expenseData.user_id
        );
      }
    } catch (notifyError) {
      logger.warn('Could not notify team about new expense:', notifyError.message);
    }

    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async findByProject(projectId, limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('expense_date', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    return data;
  },

  async getMonthlyStats(projectId, month, year) {
    const { data, error } = await supabase
      .rpc('get_monthly_stats', {
        project_id: projectId,
        target_month: month,
        target_year: year
      });
    
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id, userId) {
    const { data, error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getExpensesForExport(userId, startDate, endDate) {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        projects!inner(name)
      `)
      .eq('user_id', userId)
      .gte('expense_date', startDate.toISOString().split('T')[0])
      .lte('expense_date', endDate.toISOString().split('T')[0])
      .order('expense_date', { ascending: false });

    if (error) throw error;

    // Transform data for export
    return data.map(expense => ({
      ...expense,
      project_name: expense.projects?.name
    }));
  },

  async getExpensesForExportByProject(projectId, startDate, endDate) {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        projects!inner(name)
      `)
      .eq('project_id', projectId)
      .gte('expense_date', startDate.toISOString().split('T')[0])
      .lte('expense_date', endDate.toISOString().split('T')[0])
      .order('expense_date', { ascending: false });

    if (error) throw error;

    // Transform data for export
    return data.map(expense => ({
      ...expense,
      project_name: expense.projects?.name
    }));
  },

  async getRecentTransactions(userId, limit = 3) {
    const { data, error } = await supabase
      .from('expenses')
      .select(`
        *,
        projects!inner(name)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map(expense => ({
      ...expense,
      type: 'expense',
      project_name: expense.projects?.name
    }));
  },

  async getProjectStats(projectId) {
    const { data, error } = await supabase
      .from('expenses')
      .select('amount')
      .eq('project_id', projectId);

    if (error) throw error;

    const total = data.reduce((sum, expense) => sum + expense.amount, 0);
    return {
      total,
      count: data.length
    };
  }
};

// Income operations
const incomeService = {
  async create(incomeData) {
    const { data, error } = await supabase
      .from('incomes')
      .insert(incomeData)
      .select()
      .single();

    if (error) throw error;

    // Notify team members if collaborative project
    try {
      const project = await projectService.findById(incomeData.project_id);
      if (project && project.is_collaborative) {
        const user = await userService.findById(incomeData.user_id);
        const userName = user?.first_name || user?.username || 'Участник';

        await projectMemberService.notifyProjectMembers(
          incomeData.project_id,
          `💰 Новый доход в проекте "${project.name}"\n\n` +
          `👤 ${userName}\n` +
          `📝 ${incomeData.description}\n` +
          `💵 ${incomeData.amount} ${incomeData.currency}`,
          incomeData.user_id
        );
      }
    } catch (notifyError) {
      logger.warn('Could not notify team about new income:', notifyError.message);
    }

    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async findByProject(projectId, limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('incomes')
      .select('*')
      .eq('project_id', projectId)
      .order('income_date', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('incomes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async delete(id, userId) {
    const { data, error } = await supabase
      .from('incomes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getIncomesForExport(userId, startDate, endDate) {
    const { data, error } = await supabase
      .from('incomes')
      .select(`
        *,
        projects!inner(name)
      `)
      .eq('user_id', userId)
      .gte('income_date', startDate.toISOString().split('T')[0])
      .lte('income_date', endDate.toISOString().split('T')[0])
      .order('income_date', { ascending: false });

    if (error) throw error;

    // Transform data for export
    return data.map(income => ({
      ...income,
      project_name: income.projects?.name
    }));
  },

  async getIncomesForExportByProject(projectId, startDate, endDate) {
    const { data, error } = await supabase
      .from('incomes')
      .select(`
        *,
        projects!inner(name)
      `)
      .eq('project_id', projectId)
      .gte('income_date', startDate.toISOString().split('T')[0])
      .lte('income_date', endDate.toISOString().split('T')[0])
      .order('income_date', { ascending: false });

    if (error) throw error;

    // Transform data for export
    return data.map(income => ({
      ...income,
      project_name: income.projects?.name
    }));
  },

  async getRecentTransactions(userId, limit = 3) {
    const { data, error } = await supabase
      .from('incomes')
      .select(`
        *,
        projects!inner(name)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map(income => ({
      ...income,
      type: 'income',
      project_name: income.projects?.name
    }));
  },

  async getProjectStats(projectId) {
    const { data, error } = await supabase
      .from('incomes')
      .select('amount')
      .eq('project_id', projectId);

    if (error) throw error;

    const total = data.reduce((sum, income) => sum + income.amount, 0);
    return {
      total,
      count: data.length
    };
  }
};

// Pattern operations (Smart Defaults)
const patternService = {
  async findByUserId(userId) {
    const { data, error } = await supabase
      .from('user_patterns')
      .select('*')
      .eq('user_id', userId)
      .order('confidence', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async upsert(patternData) {
    const { data, error } = await supabase
      .from('user_patterns')
      .upsert(patternData, {
        onConflict: 'user_id,keyword',
        ignoreDuplicates: false
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updatePattern(userId, keyword, updates) {
    const { data, error } = await supabase
      .from('user_patterns')
      .update({ ...updates, last_used: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('keyword', keyword)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};

// Custom Categories Service
const customCategoryService = {
  async findByUserId(userId) {
    const { data, error } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async create(categoryData) {
    const { data, error } = await supabase
      .from('custom_categories')
      .insert(categoryData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('custom_categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase
      .from('custom_categories')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  async findByUserIdAndName(userId, name) {
    const { data, error } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('user_id', userId)
      .eq('name', name)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getCountByUserId(userId) {
    const { count, error } = await supabase
      .from('custom_categories')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);
    
    if (error) throw error;
    return count || 0;
  }
};

// Project member operations
const projectMemberService = {
  async invite(projectId, username, invitedByUserId) {
    try {
      // Try to find user by current username first
      let { data: targetUser, error: userError } = await supabase
        .from('users')
        .select('id, username, first_name')
        .eq('username', username)
        .single();

      // If not found by current username, search by first_name as fallback
      if (userError || !targetUser) {
        const { data: usersByName } = await supabase
          .from('users')
          .select('id, username, first_name')
          .ilike('first_name', `%${username}%`);

        if (usersByName && usersByName.length > 0) {
          targetUser = usersByName[0]; // Take first match
          logger.info(`Found user by name: ${targetUser.first_name} (${targetUser.username})`);
        }
      }

      // If still not found, show error
      if (!targetUser) {
        throw new Error(`Пользователь @${username} не найден в боте.\n\n💡 Попросите пользователя написать /start боту, а затем повторите приглашение.`);
      }

      // Check if user is already a member or owner
      const access = await projectService.hasAccess(projectId, targetUser.id);
      if (access.access) {
        throw new Error(`Пользователь @${username} уже участвует в проекте`);
      }

      // Get project info to check if it's collaborative
      const project = await projectService.findById(projectId);
      if (!project.is_collaborative) {
        throw new Error('Проект должен быть командным для приглашения участников');
      }

      // Add user as member
      const member = await projectService.addMember(projectId, targetUser.id, 'editor');

      // Send notification to new member
      try {
        const { getBot } = require('../utils/bot');
        const bot = getBot();
        const inviter = await userService.findById(invitedByUserId);

        await bot.sendMessage(targetUser.id,
          `👥 Вас добавили в командный проект!\n\n` +
          `📁 Проект: ${project.name}\n` +
          `👤 Пригласил: ${inviter.first_name || inviter.username}\n\n` +
          `Теперь вы можете добавлять траты и доходы в этот проект.`
        );
      } catch (notifyError) {
        logger.warn('Could not send member notification:', notifyError.message);
      }

      return {
        success: true,
        member,
        user: targetUser,
        project
      };
    } catch (error) {
      throw error;
    }
  },

  async inviteByTelegramId(projectId, telegramId, invitedByUserId) {
    try {
      // Find user by Telegram ID
      const targetUser = await userService.findById(telegramId);

      if (!targetUser) {
        throw new Error(`Пользователь не найден в боте.\n\n💡 Попросите пользователя написать /start боту.`);
      }

      // Check if user is already a member or owner
      const access = await projectService.hasAccess(projectId, targetUser.id);
      if (access.access) {
        throw new Error(`Пользователь @${targetUser.username || targetUser.first_name} уже участвует в проекте`);
      }

      // Get project info to check if it's collaborative
      const project = await projectService.findById(projectId);
      if (!project.is_collaborative) {
        throw new Error('Проект должен быть командным для приглашения участников');
      }

      // Add user as member
      const member = await projectService.addMember(projectId, targetUser.id, 'editor');

      // Send notification to new member
      try {
        const { getBot } = require('../utils/bot');
        const bot = getBot();
        const inviter = await userService.findById(invitedByUserId);

        await bot.sendMessage(targetUser.id,
          `👥 Вас добавили в командный проект!\n\n` +
          `📁 Проект: ${project.name}\n` +
          `👤 Пригласил: ${inviter.first_name || inviter.username}\n\n` +
          `Теперь вы можете добавлять траты и доходы в этот проект.`
        );
      } catch (notifyError) {
        logger.warn('Could not send member notification:', notifyError.message);
      }

      return {
        success: true,
        member,
        user: targetUser,
        project
      };
    } catch (error) {
      throw error;
    }
  },

  async leave(projectId, userId) {
    // Check if user is owner (owners cannot leave their own projects)
    const project = await projectService.findById(projectId);
    if (project.owner_id === userId) {
      throw new Error('Владелец проекта не может покинуть собственный проект');
    }

    return await projectService.removeMember(projectId, userId);
  },

  async kick(projectId, targetUserId, ownerId) {
    // Only project owner can kick members
    const project = await projectService.findById(projectId);
    if (project.owner_id !== ownerId) {
      throw new Error('Только владелец проекта может исключать участников');
    }

    if (targetUserId === ownerId) {
      throw new Error('Владелец не может исключить самого себя');
    }

    return await projectService.removeMember(projectId, targetUserId);
  },

  async getMemberCount(projectId) {
    const { data, error } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', projectId);

    if (error) throw error;

    // Add 1 for project owner
    return (data?.length || 0) + 1;
  },

  async generateInviteLink(projectId, ownerId) {
    const project = await projectService.findById(projectId);
    if (!project || project.owner_id !== ownerId) {
      throw new Error('Only project owner can generate invite links');
    }

    // Generate unique token
    const crypto = require('crypto');
    const token = crypto.randomBytes(16).toString('hex');

    // Store token with 7 days expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabase
      .from('project_invites')
      .insert({
        project_id: projectId,
        token,
        expires_at: expiresAt.toISOString()
      });

    return token;
  },

  async joinByInvite(token, userId) {
    // Find invite
    const { data: invite, error: inviteError } = await supabase
      .from('project_invites')
      .select('*, project:projects(*)')
      .eq('token', token)
      .single();

    if (inviteError || !invite) {
      throw new Error('Неверная или устаревшая ссылка-приглашение');
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      throw new Error('Ссылка-приглашение истекла');
    }

    // Check if user is already owner
    if (invite.project.owner_id === userId) {
      throw new Error('Вы уже владелец этого проекта');
    }

    // Add member
    await projectService.addMember(invite.project_id, userId, 'editor');

    // Notify project owner about new member
    try {
      const { getBot } = require('../utils/bot');
      const bot = getBot();
      const newMember = await userService.findById(userId);

      await bot.sendMessage(invite.project.owner_id,
        `👥 Новый участник присоединился к проекту!\n\n` +
        `📁 Проект: ${invite.project.name}\n` +
        `👤 Участник: ${newMember.first_name || newMember.username || 'Пользователь'}`
      );
    } catch (notifyError) {
      logger.warn('Could not send owner notification:', notifyError.message);
    }

    return invite.project;
  },

  async notifyProjectMembers(projectId, message, excludeUserId = null) {
    try {
      const { getBot } = require('../utils/bot');
      const bot = getBot();

      // Get project info
      const project = await projectService.findById(projectId);
      if (!project) return;

      // Get all members
      const members = await projectService.getMembers(projectId);

      // Add project owner to recipients
      const recipients = [project.owner_id, ...members.map(m => m.user_id)];

      // Remove excluded user and duplicates
      const uniqueRecipients = [...new Set(recipients)].filter(id => id !== excludeUserId);

      // Send notifications
      for (const userId of uniqueRecipients) {
        try {
          await bot.sendMessage(userId, message);
        } catch (sendError) {
          logger.warn(`Could not send notification to user ${userId}:`, sendError.message);
        }
      }
    } catch (error) {
      logger.error('Error notifying project members:', error);
    }
  }
};

// Transaction operations (combined expenses and incomes)
const transactionService = {
  async getRecentTransactions(userId, limit = 3) {
    try {
      // Get recent expenses and incomes in parallel
      const [expenses, incomes] = await Promise.all([
        expenseService.getRecentTransactions(userId, limit),
        incomeService.getRecentTransactions(userId, limit)
      ]);

      // Combine and sort by creation date
      const allTransactions = [...expenses, ...incomes].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );

      // Return only the requested number of transactions
      return allTransactions.slice(0, limit);
    } catch (error) {
      logger.error('Error getting recent transactions:', error);
      throw error;
    }
  }
};

module.exports = {
  supabase,
  setupDatabase,
  userService,
  projectService,
  projectMemberService,
  expenseService,
  incomeService,
  patternService,
  customCategoryService,
  transactionService
};