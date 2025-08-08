-- Hotfix for users table compatibility
-- Add missing columns to existing users table

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add tenant_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE users ADD COLUMN tenant_id UUID;
    END IF;
    
    -- Add role column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
    
    -- Rename telegram_chat_id to tg_chat_id if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'telegram_chat_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tg_chat_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN telegram_chat_id TO tg_chat_id;
    END IF;
    
    -- Update existing users to have default tenant
    IF EXISTS (SELECT 1 FROM tenants LIMIT 1) THEN
        UPDATE users 
        SET tenant_id = (SELECT id FROM tenants LIMIT 1)
        WHERE tenant_id IS NULL;
    END IF;
END$$;

SELECT 'Users table hotfix completed!' as status;