const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('🔍 Проверка структуры таблицы users...\n');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Ошибка: Отсутствуют переменные окружения');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkUsersStructure() {
    try {
        console.log('📊 Проверяем структуру таблицы users...\n');
        
        // Пробуем получить данные из таблицы users
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('*')
            .limit(1);
            
        if (usersError) {
            console.log('❌ Ошибка доступа к таблице users:', usersError.message);
            return;
        }
        
        console.log('✅ Таблица users доступна');
        
        // Пробуем создать тестового пользователя с разными полями
        console.log('\n🧪 Тестирование создания пользователя...');
        
        // Сначала создаем tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                name: 'test_structure_' + Date.now(),
                plan: 'free'
            })
            .select()
            .single();
            
        if (tenantError) {
            console.log('❌ Ошибка создания tenant:', tenantError.message);
            return;
        }
        
        console.log('✅ Tenant создан:', tenant.id);
        
        // Тест 1: Попытка создать пользователя с базовыми полями
        console.log('\n📝 Тест 1: Базовые поля...');
        const basicUser = {
            tenant_id: tenant.id,
            tg_chat_id: 'test_' + Date.now(),
            tier: 'free' // Пробуем 'free' вместо 'user'
        };
        
        const { data: basicUserData, error: basicUserError } = await supabase
            .from('users')
            .insert(basicUser)
            .select()
            .single();
            
        if (basicUserError) {
            console.log('❌ Ошибка создания пользователя с базовыми полями:', basicUserError.message);
        } else {
            console.log('✅ Пользователь с базовыми полями создан:', basicUserData.id);
            console.log('📋 Структура:', Object.keys(basicUserData));
            
            // Тест 2: Попытка обновить meta поле
            console.log('\n📝 Тест 2: Обновление meta поля...');
            const { error: updateError } = await supabase
                .from('users')
                .update({ 
                    meta: { test: 'value', timestamp: new Date().toISOString() }
                })
                .eq('id', basicUserData.id);
                
            if (updateError) {
                console.log('❌ Ошибка обновления meta поля:', updateError.message);
                console.log('💡 Колонка meta не существует или недоступна');
            } else {
                console.log('✅ Meta поле обновлено успешно');
                
                // Проверяем обновленные данные
                const { data: updatedUser, error: getError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', basicUserData.id)
                    .single();
                    
                if (!getError && updatedUser.meta) {
                    console.log('✅ Meta поле содержит данные:', updatedUser.meta);
                }
            }
            
            // Удаляем тестового пользователя
            await supabase.from('users').delete().eq('id', basicUserData.id);
        }
        
        // Удаляем тестовый tenant
        await supabase.from('tenants').delete().eq('id', tenant.id);
        
    } catch (error) {
        console.log('❌ Критическая ошибка:', error.message);
        console.log('Stack trace:', error.stack);
    }
}

checkUsersStructure().then(() => {
    console.log('\n🎯 Проверка завершена!');
    process.exit(0);
}).catch(console.error);
