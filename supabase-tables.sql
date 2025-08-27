-- Create tables for Expense Tracker Bot
-- Execute this SQL in your Supabase SQL editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  username VARCHAR(50),
  first_name VARCHAR(100),
  email VARCHAR(255),
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

-- Projects table
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

-- Project members table
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  role VARCHAR(20) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Expenses table
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

-- User patterns table (Smart Defaults)
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

-- Custom categories table
CREATE TABLE IF NOT EXISTS custom_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(id),
  name VARCHAR(50) NOT NULL,
  emoji VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Functions
-- Function to increment counters
CREATE OR REPLACE FUNCTION increment_counter(user_id BIGINT, counter_field TEXT)
RETURNS void AS $$
BEGIN
  IF counter_field = 'daily_ai_questions_used' THEN
    UPDATE users 
    SET daily_ai_questions_used = daily_ai_questions_used + 1
    WHERE id = user_id;
  ELSIF counter_field = 'daily_syncs_used' THEN
    UPDATE users 
    SET daily_syncs_used = daily_syncs_used + 1
    WHERE id = user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get monthly statistics
CREATE OR REPLACE FUNCTION get_monthly_stats(target_project_id UUID, target_month INTEGER, target_year INTEGER)
RETURNS TABLE(
  total_amount DECIMAL,
  currency TEXT,
  category TEXT,
  expense_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    SUM(e.amount) as total_amount,
    e.currency::TEXT,
    e.category::TEXT,
    COUNT(*) as expense_count
  FROM expenses e
  WHERE e.project_id = target_project_id
    AND EXTRACT(MONTH FROM e.expense_date) = target_month
    AND EXTRACT(YEAR FROM e.expense_date) = target_year
  GROUP BY e.currency, e.category
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get user expenses for analytics
CREATE OR REPLACE FUNCTION get_user_expenses_for_period(
  target_user_id BIGINT, 
  start_date DATE, 
  end_date DATE
)
RETURNS TABLE(
  amount DECIMAL,
  currency TEXT,
  category TEXT,
  description TEXT,
  expense_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.amount,
    e.currency::TEXT,
    e.category::TEXT,
    e.description::TEXT,
    e.expense_date
  FROM expenses e
  JOIN projects p ON e.project_id = p.id
  LEFT JOIN project_members pm ON p.id = pm.project_id
  WHERE (p.owner_id = target_user_id OR pm.user_id = target_user_id)
    AND e.expense_date >= start_date
    AND e.expense_date <= end_date
  ORDER BY e.expense_date DESC;
END;
$$ LANGUAGE plpgsql;