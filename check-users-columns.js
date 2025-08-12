const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('🔍 Проверка колонок таблицы users...\n');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Ошибка: Отсутствуют переменные окружения');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkUsersColumns() {
    try {
        console.log('📊 Проверяем колонки таблицы users...\n');
        
        // Создаем тестовый tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                name: 'test_columns_' + Date.now(),
                plan: 'free'
            })
            .select()
            .single();
            
        if (tenantError) {
            console.log('❌ Ошибка создания tenant:', tenantError.message);
            return;
        }
        
        console.log('✅ Tenant создан:', tenant.id);
        
        // Пробуем создать пользователя с минимальными полями
        console.log('\n📝 Тестирование создания пользователя...');
        
        // Тест 1: Только обязательные поля
        const minimalUser = {
            tenant_id: tenant.id,
            tg_chat_id: 'test_' + Date.now()
        };
        
        console.log('🔍 Пробуем создать пользователя с полями:', Object.keys(minimalUser));
        
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert(minimalUser)
            .select()
            .single();
            
        if (userError) {
            console.log('❌ Ошибка создания пользователя:', userError.message);
            
            // Пробуем понять, какие поля нужны
            if (userError.message.includes('role')) {
                console.log('💡 Нужна колонка role');
            }
            if (userError.message.includes('meta')) {
                console.log('💡 Нужна колонка meta');
            }
            if (userError.message.includes('name')) {
                console.log('💡 Нужна колонка name');
            }
        } else {
            console.log('✅ Пользователь создан:', userData.id);
            console.log('📋 Доступные колонки:', Object.keys(userData));
            console.log('📋 Данные:', userData);
            
            // Удаляем тестового пользователя
            await supabase.from('users').delete().eq('id', userData.id);
        }
        
        // Удаляем тестовый tenant
        await supabase.from('tenants').delete().eq('id', tenant.id);
        
    } catch (error) {
        console.log('❌ Критическая ошибка:', error.message);
        console.log('Stack trace:', error.stack);
    }
}

checkUsersColumns().then(() => {
    console.log('\n🎯 Проверка завершена!');
    process.exit(0);
}).catch(console.error);
