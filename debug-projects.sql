-- Отладочные запросы для проверки проектов и пользователей
-- Выполните в Supabase SQL Editor

-- 1. Проверить структуру таблицы projects
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'projects' 
ORDER BY ordinal_position;

-- 2. Проверить существующие проекты
SELECT id, owner_id, name, description, keywords, is_active, created_at
FROM projects 
ORDER BY created_at DESC
LIMIT 10;

-- 3. Проверить пользователей
SELECT id, username, first_name, is_premium, primary_currency, created_at
FROM users 
ORDER BY created_at DESC
LIMIT 5;

-- 4. Проверить связи проект-пользователь
SELECT p.name, p.keywords, p.is_active, u.username, u.first_name
FROM projects p
JOIN users u ON p.owner_id = u.id
ORDER BY p.created_at DESC;