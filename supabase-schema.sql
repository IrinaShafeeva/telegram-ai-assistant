-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants table (multi-tenancy support)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'custom')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Entitlements for plan limits
CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, key)
);

-- Users table (updated for multi-tenant)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    tg_chat_id TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user', 'readonly')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, tg_chat_id)
);

-- Team members and directory
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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
CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'google', 'telegram', 'notion', etc.
    secret_ref TEXT, -- reference to secrets manager
    scopes TEXT[] DEFAULT '{}',
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Destinations for routing
CREATE TABLE destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'sheet', 'calendar', 'telegram_dm', 'telegram_channel'
    provider TEXT NOT NULL, -- 'google', 'telegram', 'notion'
    external_id TEXT NOT NULL, -- spreadsheet_id, chat_id, etc.
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Routes for rule-based routing
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    match JSONB NOT NULL, -- matching conditions
    action JSONB NOT NULL, -- array of actions
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Universal records table (replaces transactions/tasks/ideas)
CREATE TABLE records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, -- 'expense', 'task', 'bookmark'
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
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Full-text search (updated by trigger)
    fts TSVECTOR
);

-- Attachments for records
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID REFERENCES records(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    mime_type TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories for expense classification
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES categories(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- Merchant rules for auto-categorization
CREATE TABLE merchant_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    category_id UUID REFERENCES categories(id),
    subcategory_id UUID REFERENCES categories(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- User tags for personalization
CREATE TABLE user_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, user_id, tag)
);

-- Deliveries for idempotent operations
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID REFERENCES records(id) ON DELETE CASCADE,
    route_id UUID REFERENCES routes(id),
    connector TEXT NOT NULL,
    target TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_users_tenant_tg_chat ON users(tenant_id, tg_chat_id);
CREATE INDEX idx_team_members_tenant_name ON team_members(tenant_id, display_name);
CREATE INDEX idx_team_members_aliases ON team_members USING GIN(aliases);
CREATE INDEX idx_records_tenant_kind ON records(tenant_id, kind);
CREATE INDEX idx_records_user_created ON records(user_id, created_at DESC);
CREATE INDEX idx_records_assignee ON records(assignee_member_id);
CREATE INDEX idx_records_fts ON records USING GIN(fts);
CREATE INDEX idx_routes_tenant_priority ON routes(tenant_id, priority DESC);
CREATE INDEX idx_deliveries_status ON deliveries(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_deliveries_idempotency ON deliveries(idempotency_key);

-- Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_records_updated_at BEFORE UPDATE ON records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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