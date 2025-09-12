-- Создание таблицы incomes
-- Выполните этот SQL в Supabase Dashboard → SQL Editor

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

-- Создание индексов для производительности
CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_incomes_project_id ON incomes(project_id);
CREATE INDEX IF NOT EXISTS idx_incomes_income_date ON incomes(income_date);

-- Комментарии к полям
COMMENT ON TABLE incomes IS 'Таблица для хранения доходов пользователей';
COMMENT ON COLUMN incomes.user_id IS 'ID пользователя Telegram';
COMMENT ON COLUMN incomes.project_id IS 'ID проекта';
COMMENT ON COLUMN incomes.amount IS 'Сумма дохода';
COMMENT ON COLUMN incomes.currency IS 'Валюта (RUB, USD, EUR и т.д.)';
COMMENT ON COLUMN incomes.category IS 'Категория дохода';
COMMENT ON COLUMN incomes.description IS 'Описание дохода';
COMMENT ON COLUMN incomes.income_date IS 'Дата получения дохода';
COMMENT ON COLUMN incomes.source IS 'Источник записи (bot, voice, text)';
COMMENT ON COLUMN incomes.sheets_row_id IS 'ID строки в Google Sheets для синхронизации';
COMMENT ON COLUMN incomes.synced_to_sheets IS 'Синхронизирован ли доход с Google Sheets';

-- Проверить что таблица создалась
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'incomes'
ORDER BY ordinal_position;