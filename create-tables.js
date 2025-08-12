require('dotenv').config();
const { supabase } = require('./src/config/database');

async function createTables() {
    console.log('🔧 Создание таблиц через Supabase API...\n');
    
    try {
        // 1. Создаем таблицу tenants
        console.log('1️⃣ Создаю таблицу tenants...');
        const { error: tenantsError } = await supabase
            .from('tenants')
            .insert({
                name: 'default_tenant',
                plan: 'free'
            })
            .select();
            
        if (tenantsError) {
            console.log('⚠️ Таблица tenants уже существует или ошибка:', tenantsError.message);
        } else {
            console.log('✅ Таблица tenants создана');
        }
        
        // 2. Создаем таблицу records
        console.log('\n2️⃣ Создаю таблицу records...');
        const { error: recordsError } = await supabase
            .from('records')
            .insert({
                tenant_id: '00000000-0000-0000-0000-000000000000', // placeholder
                user_id: '00000000-0000-0000-0000-000000000000',   // placeholder
                kind: 'test',
                title: 'Test Record',
                body: 'This is a test record'
            })
            .select();
            
        if (recordsError) {
            console.log('⚠️ Таблица records уже существует или ошибка:', recordsError.message);
        } else {
            console.log('✅ Таблица records создана');
        }
        
        // 3. Проверяем существующие таблицы
        console.log('\n3️⃣ Проверяю существующие таблицы...');
        const { data: tables, error: tablesError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public');
            
        if (tablesError) {
            console.log('⚠️ Не удалось получить список таблиц:', tablesError.message);
        } else {
            console.log('📋 Существующие таблицы:');
            tables.forEach(table => {
                console.log(`   • ${table.table_name}`);
            });
        }
        
        console.log('\n🎉 Проверка завершена!');
        
    } catch (error) {
        console.error('❌ Ошибка создания таблиц:', error);
    }
}

createTables();
