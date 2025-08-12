-- Simple migration script - without FTS for now
-- Safe migration that preserves existing data

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create new tables

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'custom')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Entitlements for plan limits
CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, key)
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
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

-- Connections to external services
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    secret_ref TEXT,
    scopes TEXT[] DEFAULT '{}',
    owner_user_id UUID,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Destinations for routing
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

-- Routes for rule-based routing
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

-- Universal records table (without FTS for now)
CREATE TABLE IF NOT EXISTS records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
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

-- Deliveries for idempotent operations
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

-- 2. Update existing users table
DO $$
BEGIN
    -- Add tenant_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE users ADD COLUMN tenant_id UUID;
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
    
    -- Add role column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user', 'readonly'));
    END IF;
    
    -- Add meta column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'meta'
    ) THEN
        ALTER TABLE users ADD COLUMN meta JSONB DEFAULT '{}';
    END IF;
END$$;

-- 3. Create basic indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant_tg_chat ON users(tenant_id, tg_chat_id);
CREATE INDEX IF NOT EXISTS idx_team_members_tenant_name ON team_members(tenant_id, display_name);
CREATE INDEX IF NOT EXISTS idx_records_tenant_kind ON records(tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_records_user_created ON records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routes_tenant_priority ON routes(tenant_id, priority DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status) WHERE status IN ('pending', 'processing');

-- 4. Create basic functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Resolve person function (simplified)
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

-- Simple search function (without FTS)
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
        1.0 as rank
    FROM records r
    WHERE r.tenant_id = p_tenant_id
    AND (p_user_id IS NULL OR r.user_id = p_user_id)
    AND (p_kind IS NULL OR r.kind = p_kind)
    AND (
        LOWER(r.title) LIKE LOWER('%' || p_query || '%') OR
        LOWER(COALESCE(r.body, '')) LIKE LOWER('%' || p_query || '%')
    )
    ORDER BY r.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 5. Create triggers
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

DROP TRIGGER IF EXISTS update_deliveries_updated_at ON deliveries;
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Simple migration completed successfully! FTS can be added later.' as status;