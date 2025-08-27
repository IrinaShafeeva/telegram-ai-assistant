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
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
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
      role VARCHAR(20) DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, user_id)
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
      user_id: userId,
      counter_field: field
    });
    
    if (error) throw error;
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
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        project_members(user_id, role)
      `)
      .or(`user_id.eq.${userId}`);
    
    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
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

  async addMember(projectId, userId, role = 'member') {
    const { data, error } = await supabase
      .from('project_members')
      .insert({ project_id: projectId, user_id: userId, role })
      .select()
      .single();
    
    if (error) throw error;
    return data;
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

module.exports = {
  supabase,
  setupDatabase,
  userService,
  projectService,
  expenseService,
  patternService
};