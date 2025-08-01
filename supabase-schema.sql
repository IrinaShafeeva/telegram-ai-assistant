-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_chat_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'team')),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Project settings table
CREATE TABLE project_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    project_name TEXT NOT NULL,
    
    task_storage TEXT CHECK (task_storage IN ('supabase', 'notion', 'sheets')) DEFAULT 'supabase',
    idea_storage TEXT CHECK (idea_storage IN ('supabase', 'notion', 'sheets')) DEFAULT 'supabase',
    
    transaction_sheet_id TEXT,
    transaction_sheet_name TEXT,
    task_sheet_id TEXT,
    task_sheet_name TEXT,
    idea_sheet_id TEXT,
    idea_sheet_name TEXT,
    
    task_notion_db_id TEXT,
    idea_notion_db_id TEXT,
    
    telegram_channel_id TEXT,
    send_to_personal BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    
    UNIQUE(user_id, project_name)
);

-- Transactions table (for analytics)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project TEXT NOT NULL,
    amount TEXT NOT NULL,
    budget_from TEXT,
    description TEXT NOT NULL,
    date DATE NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project TEXT NOT NULL,
    description TEXT NOT NULL,
    person TEXT,
    date DATE,
    repeat_type TEXT CHECK (repeat_type IN ('ежедневно', 'еженедельно', 'ежемесячно')),
    repeat_until DATE,
    notify_time TIME,
    telegram_chat_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Ideas table
CREATE TABLE ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project TEXT NOT NULL,
    description TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Reminders table
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    remind_at TIMESTAMP NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Analytics table for aggregated data
CREATE TABLE analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    project TEXT NOT NULL,
    data_type TEXT NOT NULL CHECK (data_type IN ('transaction', 'task', 'idea')),
    total_count INTEGER DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    
    UNIQUE(user_id, project, data_type, period_start, period_end)
);

-- Indexes for better performance
CREATE INDEX idx_transactions_project_date ON transactions(project, date);
CREATE INDEX idx_transactions_telegram_chat_id ON transactions(telegram_chat_id);
CREATE INDEX idx_tasks_project_date ON tasks(project, date);
CREATE INDEX idx_tasks_telegram_chat_id ON tasks(telegram_chat_id);
CREATE INDEX idx_tasks_person ON tasks(person);
CREATE INDEX idx_ideas_project ON ideas(project);
CREATE INDEX idx_ideas_telegram_chat_id ON ideas(telegram_chat_id);
CREATE INDEX idx_reminders_remind_at ON reminders(remind_at);
CREATE INDEX idx_reminders_telegram_chat_id ON reminders(telegram_chat_id);
CREATE INDEX idx_users_telegram_chat_id ON users(telegram_chat_id);

-- Functions for automatic timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_project_settings_updated_at BEFORE UPDATE ON project_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ideas_updated_at BEFORE UPDATE ON ideas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_analytics_updated_at BEFORE UPDATE ON analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get user by telegram chat id
CREATE OR REPLACE FUNCTION get_user_by_telegram_id(telegram_id TEXT)
RETURNS TABLE (
    id UUID,
    telegram_chat_id TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    tier TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.telegram_chat_id, u.username, u.first_name, u.last_name, u.tier
    FROM users u
    WHERE u.telegram_chat_id = telegram_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create user if not exists
CREATE OR REPLACE FUNCTION create_user_if_not_exists(
    p_telegram_chat_id TEXT,
    p_username TEXT DEFAULT NULL,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    user_id UUID;
BEGIN
    -- Try to get existing user
    SELECT id INTO user_id
    FROM users
    WHERE telegram_chat_id = p_telegram_chat_id;
    
    -- If user doesn't exist, create new one
    IF user_id IS NULL THEN
        INSERT INTO users (telegram_chat_id, username, first_name, last_name)
        VALUES (p_telegram_chat_id, p_username, p_first_name, p_last_name)
        RETURNING id INTO user_id;
    END IF;
    
    RETURN user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get today's tasks for a person
CREATE OR REPLACE FUNCTION get_today_tasks_for_person(person_name TEXT)
RETURNS TABLE (
    id UUID,
    project TEXT,
    description TEXT,
    person TEXT,
    date DATE,
    repeat_type TEXT,
    repeat_until DATE,
    notify_time TIME
) AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.project, t.description, t.person, t.date, t.repeat_type, t.repeat_until, t.notify_time
    FROM tasks t
    WHERE t.person = person_name
    AND (
        -- Exact date match
        (t.date = CURRENT_DATE AND t.repeat_type IS NULL)
        OR
        -- Daily repeating tasks
        (t.repeat_type = 'ежедневно' AND (t.repeat_until IS NULL OR t.repeat_until >= CURRENT_DATE))
        OR
        -- Weekly repeating tasks
        (t.repeat_type = 'еженедельно' AND 
         EXTRACT(DOW FROM t.date) = EXTRACT(DOW FROM CURRENT_DATE) AND
         (t.repeat_until IS NULL OR t.repeat_until >= CURRENT_DATE))
        OR
        -- Monthly repeating tasks
        (t.repeat_type = 'ежемесячно' AND 
         EXTRACT(DAY FROM t.date) = EXTRACT(DAY FROM CURRENT_DATE) AND
         (t.repeat_until IS NULL OR t.repeat_until >= CURRENT_DATE))
    )
    AND t.completed = false
    ORDER BY t.date, t.description;
END;
$$ LANGUAGE plpgsql;

-- Function to get analytics for a project
CREATE OR REPLACE FUNCTION get_project_analytics(
    p_project TEXT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    data_type TEXT,
    total_count BIGINT,
    total_amount DECIMAL(15,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'transaction'::TEXT as data_type,
        COUNT(*)::BIGINT as total_count,
        COALESCE(SUM(CAST(REPLACE(amount, '+', '') AS DECIMAL(15,2))), 0) as total_amount
    FROM transactions
    WHERE project = p_project
    AND date BETWEEN p_start_date AND p_end_date
    
    UNION ALL
    
    SELECT 
        'task'::TEXT as data_type,
        COUNT(*)::BIGINT as total_count,
        0::DECIMAL(15,2) as total_amount
    FROM tasks
    WHERE project = p_project
    AND date BETWEEN p_start_date AND p_end_date
    
    UNION ALL
    
    SELECT 
        'idea'::TEXT as data_type,
        COUNT(*)::BIGINT as total_count,
        0::DECIMAL(15,2) as total_amount
    FROM ideas
    WHERE project = p_project
    AND created_at::DATE BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql; 