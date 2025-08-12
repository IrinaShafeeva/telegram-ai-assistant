-- Add meta column to users table if it doesn't exist
DO $$
BEGIN
    -- Add meta column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'meta'
    ) THEN
        ALTER TABLE users ADD COLUMN meta JSONB DEFAULT '{}';
        RAISE NOTICE 'Added meta column to users table';
    ELSE
        RAISE NOTICE 'Meta column already exists in users table';
    END IF;
END$$;

-- Проверяем результат
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name = 'meta';

-- Показываем текущую структуру таблицы users
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
