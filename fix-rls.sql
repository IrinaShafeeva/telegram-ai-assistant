-- Fix RLS (Row Level Security) settings for all tables
-- This script enables RLS and creates proper policies

-- Enable RLS for all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- Create policies to allow service_role full access
-- This is safe for server-side API usage

-- Tenants policies
CREATE POLICY "Service role full access on tenants" ON public.tenants
    FOR ALL USING (auth.role() = 'service_role');

-- Users policies  
CREATE POLICY "Service role full access on users" ON public.users
    FOR ALL USING (auth.role() = 'service_role');

-- Team members policies
CREATE POLICY "Service role full access on team_members" ON public.team_members
    FOR ALL USING (auth.role() = 'service_role');

-- Records policies
CREATE POLICY "Service role full access on records" ON public.records
    FOR ALL USING (auth.role() = 'service_role');

-- Routes policies
CREATE POLICY "Service role full access on routes" ON public.routes
    FOR ALL USING (auth.role() = 'service_role');

-- Deliveries policies
CREATE POLICY "Service role full access on deliveries" ON public.deliveries
    FOR ALL USING (auth.role() = 'service_role');

-- Connections policies
CREATE POLICY "Service role full access on connections" ON public.connections
    FOR ALL USING (auth.role() = 'service_role');

-- Destinations policies
CREATE POLICY "Service role full access on destinations" ON public.destinations
    FOR ALL USING (auth.role() = 'service_role');

-- Attachments policies
CREATE POLICY "Service role full access on attachments" ON public.attachments
    FOR ALL USING (auth.role() = 'service_role');

-- Categories policies
CREATE POLICY "Service role full access on categories" ON public.categories
    FOR ALL USING (auth.role() = 'service_role');

-- Merchant rules policies
CREATE POLICY "Service role full access on merchant_rules" ON public.merchant_rules
    FOR ALL USING (auth.role() = 'service_role');

-- User tags policies
CREATE POLICY "Service role full access on user_tags" ON public.user_tags
    FOR ALL USING (auth.role() = 'service_role');

-- Entitlements policies
CREATE POLICY "Service role full access on entitlements" ON public.entitlements
    FOR ALL USING (auth.role() = 'service_role');

SELECT 'RLS policies created successfully!' as status;