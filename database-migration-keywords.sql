-- Миграция: Добавление поля keywords в таблицу projects
-- Выполните этот SQL в Supabase Dashboard → SQL Editor

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS keywords TEXT;

-- Комментарий для поля
COMMENT ON COLUMN projects.keywords IS 'Ключевые слова для автоматического определения проекта (через запятую)';

-- Проверить что поле добавилось
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'projects' AND column_name = 'keywords';