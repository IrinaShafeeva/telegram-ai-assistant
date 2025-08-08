/**
 * Simple setup for v2.0 - creates basic structure
 * Apply supabase-schema.sql manually in Supabase Dashboard first!
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function setupBasicData() {
    console.log('🚀 Setting up basic data...');
    
    try {
        // Create a default tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                name: 'default_tenant',
                plan: 'free'
            })
            .select()
            .single();
            
        if (tenantError && !tenantError.message.includes('duplicate')) {
            throw tenantError;
        }
        
        const tenantId = tenant?.id || (await supabase.from('tenants').select('*').single()).data?.id;
        
        console.log('✅ Tenant created:', tenantId);
        
        // Create default entitlements
        await supabase
            .from('entitlements')
            .upsert([
                { tenant_id: tenantId, key: 'max_users', value: '5' },
                { tenant_id: tenantId, key: 'max_routes', value: '3' },
                { tenant_id: tenantId, key: 'search_history_days', value: '30' }
            ]);
        
        console.log('✅ Entitlements created');
        
        // Create default routes
        const defaultRoutes = [
            {
                tenant_id: tenantId,
                name: 'All expenses to Telegram',
                priority: 1,
                enabled: true,
                match: { kind: 'expense' },
                action: [{ connector: 'telegram_dm', target: '{{user.tg_chat_id}}' }]
            },
            {
                tenant_id: tenantId,
                name: 'All tasks to Telegram',
                priority: 1,
                enabled: true,
                match: { kind: 'task' },
                action: [{ connector: 'telegram_dm', target: '{{user.tg_chat_id}}' }]
            }
        ];
        
        for (const route of defaultRoutes) {
            await supabase
                .from('routes')
                .upsert(route);
        }
        
        console.log('✅ Default routes created');
        
        console.log('🎉 Setup completed!');
        console.log('\n📋 Next steps:');
        console.log('1. Make sure you applied supabase-schema.sql in Supabase Dashboard');
        console.log('2. Start the server: npm run dev');
        console.log('3. Test with Telegram bot');
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
        
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
            console.log('\n🔧 You need to apply the new schema first:');
            console.log('1. Go to Supabase Dashboard → SQL Editor');
            console.log('2. Copy/paste content from supabase-schema.sql');
            console.log('3. Run it');
            console.log('4. Then run this setup again');
        }
    }
}

// Check if new tables exist
async function checkSchema() {
    try {
        const { error } = await supabase.from('tenants').select('count').limit(1);
        return !error;
    } catch {
        return false;
    }
}

async function main() {
    const hasNewSchema = await checkSchema();
    
    if (!hasNewSchema) {
        console.log('❌ New schema not found!');
        console.log('\n🔧 Please apply the schema first:');
        console.log('1. Go to https://supabase.com/dashboard/project/hbswrnjykwyedltjroxw');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy content from supabase-schema.sql and execute it');
        console.log('4. Then run: npm run setup');
        return;
    }
    
    await setupBasicData();
}

if (require.main === module) {
    main();
}

module.exports = { setupBasicData, checkSchema };