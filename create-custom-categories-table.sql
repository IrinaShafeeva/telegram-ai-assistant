-- Создание таблицы custom_categories
-- Выполните этот SQL в Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS custom_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(id),
  name VARCHAR(50) NOT NULL,
  emoji VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Создание индексов для производительности
CREATE INDEX IF NOT EXISTS idx_custom_categories_user_id ON custom_categories(user_id);

-- Комментарии к полям
COMMENT ON TABLE custom_categories IS 'Пользовательские категории для PRO подписчиков';
COMMENT ON COLUMN custom_categories.user_id IS 'ID пользователя Telegram';
COMMENT ON COLUMN custom_categories.name IS 'Название категории';
COMMENT ON COLUMN custom_categories.emoji IS 'Эмодзи для категории';
COMMENT ON COLUMN custom_categories.created_at IS 'Дата создания категории';

-- Проверить что таблица создалась
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'custom_categories'
ORDER BY ordinal_position;