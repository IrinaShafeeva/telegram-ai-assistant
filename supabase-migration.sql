-- Migration script from v1.0 to v2.0
-- Safe migration that preserves existing data

-- Enable extensions if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create new tables (only if they don't exist)

-- Tenants table (new)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'custom')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Entitlements for plan limits (new)
CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, key)
);

-- Team members and directory (new)
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID, -- will reference users(id) after migration
    display_name TEXT NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    tg_chat_id TEXT,
    gcal_connection_id UUID,
    meta JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, display_name)
);

-- Connections to external services (new)
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    secret_ref TEXT,
    scopes TEXT[] DEFAULT '{}',
    owner_user_id UUID, -- will reference users(id) after migration
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Destinations for routing (new)
CREATE TABLE IF NOT EXISTS destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Routes for rule-based routing (new)
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    match JSONB NOT NULL,
    action JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Universal records table (new)
CREATE TABLE IF NOT EXISTS records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID, -- will reference users(id) after migration
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    amount NUMERIC,
    currency TEXT DEFAULT 'RUB',
    due_at TIMESTAMPTZ,
    url TEXT,
    tags TEXT[] DEFAULT '{}',
    assignee_member_id UUID REFERENCES team_members(id),
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add FTS column to records (without generated expression)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'records' AND column_name = 'fts'
    ) THEN
        ALTER TABLE records ADD COLUMN fts TSVECTOR;
    END IF;
END$$;

-- Attachments for records (new)
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID REFERENCES records(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    mime_type TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories for expense classification (new)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES categories(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- Merchant rules for auto-categorization (new)
CREATE TABLE IF NOT EXISTS merchant_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    category_id UUID REFERENCES categories(id),
    subcategory_id UUID REFERENCES categories(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- User tags for personalization (new)
CREATE TABLE IF NOT EXISTS user_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID, -- will reference users(id) after migration
    tag TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, user_id, tag)
);

-- Deliveries for idempotent operations (new)
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID REFERENCES records(id) ON DELETE CASCADE,
    route_id UUID REFERENCES routes(id),
    connector TEXT NOT NULL,
    target TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
    error TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Migrate existing users table
-- Add new columns to existing users table if they don't exist
DO $$
BEGIN
    -- Add tenant_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE users ADD COLUMN tenant_id UUID;
    END IF;
    
    -- Rename columns to match new schema
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'telegram_chat_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN telegram_chat_id TO tg_chat_id;
    END IF;
    
    -- Add new columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user', 'readonly'));
    END IF;
    
    -- Update timestamps to TIMESTAMPTZ
    ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ;
    ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
END$$;

-- 3. Create indexes for performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_users_tenant_tg_chat ON users(tenant_id, tg_chat_id);
CREATE INDEX IF NOT EXISTS idx_team_members_tenant_name ON team_members(tenant_id, display_name);
CREATE INDEX IF NOT EXISTS idx_team_members_aliases ON team_members USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_records_tenant_kind ON records(tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_records_user_created ON records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_assignee ON records(assignee_member_id);
CREATE INDEX IF NOT EXISTS idx_records_fts ON records USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_routes_tenant_priority ON routes(tenant_id, priority DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_deliveries_idempotency ON deliveries(idempotency_key);

-- 4. Create functions (replace if exists)
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update FTS column for records
CREATE OR REPLACE FUNCTION update_records_fts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fts := 
        setweight(to_tsvector('russian', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('russian', COALESCE(NEW.body, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.url, '')), 'C') ||
        setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Helper functions for new architecture

-- Resolve person by name or alias
CREATE OR REPLACE FUNCTION resolve_person(
    p_tenant_id UUID,
    p_name TEXT
)
RETURNS TABLE(
    member_id UUID,
    display_name TEXT,
    tg_chat_id TEXT,
    gcal_connection_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tm.id,
        tm.display_name,
        tm.tg_chat_id,
        tm.gcal_connection_id
    FROM team_members tm
    WHERE tm.tenant_id = p_tenant_id 
    AND tm.is_active = true
    AND (
        LOWER(tm.display_name) = LOWER(p_name) 
        OR p_name = ANY(tm.aliases)
    )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Generate idempotency key
CREATE OR REPLACE FUNCTION generate_idempotency_key(
    p_tenant_id UUID,
    p_record_id UUID,
    p_route_id UUID
)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(p_tenant_id::text || p_record_id::text || p_route_id::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Search records with full-text search
CREATE OR REPLACE FUNCTION search_records(
    p_tenant_id UUID,
    p_user_id UUID,
    p_query TEXT,
    p_kind TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    record_id UUID,
    kind TEXT,
    title TEXT,
    snippet TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.kind,
        r.title,
        LEFT(COALESCE(r.body, ''), 200) as snippet,
        ts_rank(r.fts, websearch_to_tsquery('russian', p_query)) as rank
    FROM records r
    WHERE r.tenant_id = p_tenant_id
    AND (p_user_id IS NULL OR r.user_id = p_user_id)
    AND (p_kind IS NULL OR r.kind = p_kind)
    AND r.fts @@ websearch_to_tsquery('russian', p_query)
    ORDER BY rank DESC, r.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 5. Create triggers (drop and recreate to avoid conflicts)
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_team_members_updated_at ON team_members;
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_routes_updated_at ON routes;
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_records_updated_at ON records;
CREATE TRIGGER update_records_updated_at BEFORE UPDATE ON records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_records_fts ON records;
CREATE TRIGGER update_records_fts BEFORE INSERT OR UPDATE ON records FOR EACH ROW EXECUTE FUNCTION update_records_fts();

DROP TRIGGER IF EXISTS update_deliveries_updated_at ON deliveries;
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Add foreign key constraints for users table (after migration)
-- This will be done by the setup script after data migration

-- Migration completed
SELECT 'Migration script completed successfully!' as status;