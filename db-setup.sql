-- ===============================================
-- DATABASE SETUP FOR EXPENSE TRACKER BOT
-- ===============================================
-- Execute this in Supabase Dashboard → SQL Editor

-- 1. Create custom_categories table (missing table causing errors)
CREATE TABLE IF NOT EXISTS custom_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(id),
  name VARCHAR(50) NOT NULL,
  emoji VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_custom_categories_user_id ON custom_categories(user_id);

-- Add comments
COMMENT ON TABLE custom_categories IS 'Custom categories for PRO subscribers';
COMMENT ON COLUMN custom_categories.user_id IS 'Telegram user ID';
COMMENT ON COLUMN custom_categories.name IS 'Category name';
COMMENT ON COLUMN custom_categories.emoji IS 'Category emoji';

-- 2. Verify all required tables exist
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'users', 
        'projects', 
        'expenses', 
        'incomes', 
        'custom_categories',
        'user_patterns',
        'project_members'
    )
ORDER BY tablename;

-- 3. Check foreign key constraints are properly set up
SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name IN ('expenses', 'incomes', 'projects', 'custom_categories')
ORDER BY tc.table_name;

-- 4. Show current state of all main tables
SELECT 
    'users' as table_name, 
    COUNT(*) as row_count 
FROM users
UNION ALL
SELECT 
    'projects' as table_name, 
    COUNT(*) as row_count 
FROM projects
UNION ALL
SELECT 
    'expenses' as table_name, 
    COUNT(*) as row_count 
FROM expenses
UNION ALL
SELECT 
    'incomes' as table_name, 
    COUNT(*) as row_count 
FROM incomes
UNION ALL
SELECT 
    'custom_categories' as table_name, 
    COUNT(*) as row_count 
FROM custom_categories
ORDER BY table_name;