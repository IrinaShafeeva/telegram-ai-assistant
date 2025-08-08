const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('🔍 Проверка существующих таблиц в Supabase...\n');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Ошибка: Отсутствуют переменные окружения');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkTables() {
    try {
        console.log('📊 Проверяем таблицы...\n');
        
        // Список таблиц, которые должны быть
        const expectedTables = [
            'tenants',
            'users', 
            'team_members',
            'records',
            'routes',
            'deliveries',
            'connections',
            'destinations',
            'attachments',
            'categories',
            'merchant_rules',
            'user_tags',
            'entitlements'
        ];
        
        for (const tableName of expectedTables) {
            try {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('count')
                    .limit(1);
                    
                if (error) {
                    console.log(`❌ ${tableName}: ${error.message}`);
                } else {
                    console.log(`✅ ${tableName}: доступна`);
                }
            } catch (err) {
                console.log(`❌ ${tableName}: ошибка - ${err.message}`);
            }
        }
        
        console.log('\n🧪 Тестирование создания данных...');
        
        // Тест создания tenant
        const testTenant = {
            name: 'test_chat_' + Date.now(),
            plan: 'free'
        };
        
        const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .insert(testTenant)
            .select()
            .single();
            
        if (tenantError) {
            console.log('❌ Ошибка создания tenant:', tenantError.message);
        } else {
            console.log('✅ Tenant создан:', tenantData.id);
            
            // Тест создания user
            const testUser = {
                tenant_id: tenantData.id,
                name: 'Test User',
                tg_chat_id: '123456789',
                role: 'user'
            };
            
            const { data: userData, error: userError } = await supabase
                .from('users')
                .insert(testUser)
                .select()
                .single();
                
            if (userError) {
                console.log('❌ Ошибка создания user:', userError.message);
            } else {
                console.log('✅ User создан:', userData.id);
                
                // Тест создания record
                const testRecord = {
                    tenant_id: tenantData.id,
                    user_id: userData.id,
                    kind: 'expense',
                    title: 'Тестовый расход',
                    amount: 1000,
                    currency: 'RUB'
                };
                
                const { data: recordData, error: recordError } = await supabase
                    .from('records')
                    .insert(testRecord)
                    .select()
                    .single();
                    
                if (recordError) {
                    console.log('❌ Ошибка создания record:', recordError.message);
                } else {
                    console.log('✅ Record создан:', recordData.id);
                    
                    // Удаляем тестовые данные
                    await supabase.from('records').delete().eq('id', recordData.id);
                    await supabase.from('users').delete().eq('id', userData.id);
                    await supabase.from('tenants').delete().eq('id', tenantData.id);
                    
                    console.log('✅ Тестовые данные удалены');
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Критическая ошибка:', error.message);
    }
}

checkTables().then(() => {
    console.log('\n🎯 Проверка завершена!');
    console.log('\n💡 Если все таблицы доступны, ваш бот должен работать!');
    process.exit(0);
}).catch(console.error);
