-- Simple RLS fix for existing tables only
-- Enable RLS for main tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- Create policies to allow service_role full access
CREATE POLICY "Service role full access on tenants" ON public.tenants
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on users" ON public.users
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on records" ON public.records
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on entitlements" ON public.entitlements
    FOR ALL USING (auth.role() = 'service_role');

-- Also enable for any additional tables that exist
DO $$
BEGIN
    -- Team members (if exists)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'team_members') THEN
        ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Service role full access on team_members" ON public.team_members
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
    
    -- Routes (if exists)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'routes') THEN
        ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Service role full access on routes" ON public.routes
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
    
    -- Deliveries (if exists)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'deliveries') THEN
        ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Service role full access on deliveries" ON public.deliveries
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
    
    -- Destinations (if exists)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'destinations') THEN
        ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Service role full access on destinations" ON public.destinations
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
    
END$$;

SELECT 'Simple RLS policies created successfully!' as status;