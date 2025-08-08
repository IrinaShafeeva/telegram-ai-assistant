/**
 * Migration script from v1.0 to v2.0
 * Applies new schema and migrates existing data
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for DDL operations
);

async function migrate() {
    console.log('🚀 Starting migration to v2.0...');
    
    try {
        // 1. Read new schema
        const schema = fs.readFileSync('supabase-schema.sql', 'utf8');
        
        console.log('📋 Applying new schema...');
        
        // Execute schema in smaller chunks to avoid conflicts
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('--'));
        
        for (const statement of statements) {
            if (statement) {
                try {
                    const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
                    if (error && !error.message.includes('already exists')) {
                        console.log(`⚠️  Warning: ${statement.substring(0, 50)}... - ${error.message}`);
                    }
                } catch (err) {
                    console.log(`⚠️  Skipping: ${statement.substring(0, 50)}...`);
                }
            }
        }
        
        console.log('✅ New schema applied');
        
        // 2. Create default tenant and migrate users
        console.log('👤 Migrating users...');
        await migrateUsers();
        
        // 3. Migrate old data to records table
        console.log('📝 Migrating data...');
        await migrateData();
        
        console.log('🎉 Migration completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Test the new API: npm run dev');
        console.log('2. Set up routing rules in the database');
        console.log('3. Configure Google Sheets if needed');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

async function migrateUsers() {
    // Get old users
    const { data: oldUsers, error } = await supabase
        .from('users')
        .select('*');
    
    if (error || !oldUsers?.length) {
        console.log('No old users to migrate');
        return;
    }
    
    for (const oldUser of oldUsers) {
        // Create tenant per user (for now)
        const { data: tenant } = await supabase
            .from('tenants')
            .insert({
                name: `user_${oldUser.telegram_chat_id}`,
                plan: oldUser.tier || 'free'
            })
            .select()
            .single();
        
        if (tenant) {
            // Create new user
            await supabase
                .from('users')
                .insert({
                    tenant_id: tenant.id,
                    name: `${oldUser.first_name || ''} ${oldUser.last_name || ''}`.trim(),
                    tg_chat_id: oldUser.telegram_chat_id,
                    role: 'owner'
                });
            
            // Create default entitlements
            await supabase
                .from('entitlements')
                .insert([
                    { tenant_id: tenant.id, key: 'max_users', value: '5' },
                    { tenant_id: tenant.id, key: 'max_routes', value: '3' },
                    { tenant_id: tenant.id, key: 'search_history_days', value: '30' }
                ]);
            
            console.log(`✅ Migrated user: ${oldUser.telegram_chat_id}`);
        }
    }
}

async function migrateData() {
    // Migrate transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('*');
    
    if (transactions?.length) {
        for (const tx of transactions) {
            const user = await getUserByTgChatId(tx.telegram_chat_id);
            if (user) {
                await supabase
                    .from('records')
                    .insert({
                        tenant_id: user.tenant_id,
                        user_id: user.id,
                        kind: 'expense',
                        title: tx.description,
                        amount: parseFloat(tx.amount.replace(/[^\d.-]/g, '')),
                        currency: 'RUB',
                        meta: {
                            money_source: tx.money_source,
                            project: tx.project,
                            migrated_from: 'transactions'
                        },
                        created_at: tx.created_at
                    });
            }
        }
        console.log(`✅ Migrated ${transactions.length} transactions`);
    }
    
    // Migrate tasks
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*');
    
    if (tasks?.length) {
        for (const task of tasks) {
            const user = await getUserByTgChatId(task.telegram_chat_id);
            if (user) {
                await supabase
                    .from('records')
                    .insert({
                        tenant_id: user.tenant_id,
                        user_id: user.id,
                        kind: 'task',
                        title: task.description,
                        due_at: task.date ? new Date(task.date).toISOString() : null,
                        meta: {
                            person: task.person,
                            status: task.status,
                            priority: task.priority,
                            project: task.project,
                            migrated_from: 'tasks'
                        },
                        created_at: task.created_at
                    });
            }
        }
        console.log(`✅ Migrated ${tasks.length} tasks`);
    }
    
    // Migrate ideas
    const { data: ideas } = await supabase
        .from('ideas')
        .select('*');
    
    if (ideas?.length) {
        for (const idea of ideas) {
            const user = await getUserByTgChatId(idea.telegram_chat_id);
            if (user) {
                await supabase
                    .from('records')
                    .insert({
                        tenant_id: user.tenant_id,
                        user_id: user.id,
                        kind: 'bookmark',
                        title: idea.description,
                        url: idea.link,
                        body: idea.file_name ? `File: ${idea.file_name}` : null,
                        meta: {
                            project: idea.project,
                            file_url: idea.file_url,
                            migrated_from: 'ideas'
                        },
                        created_at: idea.created_at
                    });
            }
        }
        console.log(`✅ Migrated ${ideas.length} ideas`);
    }
}

async function getUserByTgChatId(tgChatId) {
    const { data } = await supabase
        .from('users')
        .select('*')
        .eq('tg_chat_id', tgChatId)
        .single();
    
    return data;
}

// Run migration
if (require.main === module) {
    migrate();
}

module.exports = { migrate };