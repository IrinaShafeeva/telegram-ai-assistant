-- Исправление структуры таблицы users
-- Добавляем недостающие колонки meta и role

-- Добавляем колонку meta если её нет
DO $$
BEGIN
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

-- Добавляем колонку role если её нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user', 'readonly'));
        RAISE NOTICE 'Added role column to users table';
    ELSE
        RAISE NOTICE 'Role column already exists in users table';
    END IF;
END$$;

-- Добавляем колонку username если её нет (используется в коде)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'username'
    ) THEN
        ALTER TABLE users ADD COLUMN username TEXT;
        RAISE NOTICE 'Added username column to users table';
    ELSE
        RAISE NOTICE 'Username column already exists in users table';
    END IF;
END$$;

-- Добавляем колонки first_name и last_name если их нет (используются в коде)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'first_name'
    ) THEN
        ALTER TABLE users ADD COLUMN first_name TEXT;
        RAISE NOTICE 'Added first_name column to users table';
    ELSE
        RAISE NOTICE 'First_name column already exists in users table';
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_name'
    ) THEN
        ALTER TABLE users ADD COLUMN last_name TEXT;
        RAISE NOTICE 'Added last_name column to users table';
    ELSE
        RAISE NOTICE 'Last_name column already exists in users table';
    END IF;
END$$;

-- Показываем итоговую структуру таблицы users
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

