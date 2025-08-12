const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('🔧 Простое исправление структуры таблицы users...\n');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Ошибка: Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function simpleFixUsers() {
    try {
        console.log('📊 Проверяем текущую структуру таблицы users...\n');
        
        // Сначала попробуем создать пользователя с минимальными полями
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                name: 'test_simple_' + Date.now(),
                plan: 'free'
            })
            .select()
            .single();
            
        if (tenantError) {
            console.log('❌ Ошибка создания tenant:', tenantError.message);
            return;
        }
        
        console.log('✅ Tenant создан:', tenant.id);
        
        // Пробуем создать пользователя с разными наборами полей
        const testCases = [
            {
                name: 'Базовые поля (без role и meta)',
                data: {
                    tenant_id: tenant.id,
                    tg_chat_id: 'test_basic_' + Date.now()
                }
            },
            {
                name: 'С полем role',
                data: {
                    tenant_id: tenant.id,
                    tg_chat_id: 'test_role_' + Date.now(),
                    role: 'user'
                }
            },
            {
                name: 'С полем meta',
                data: {
                    tenant_id: tenant.id,
                    tg_chat_id: 'test_meta_' + Date.now(),
                    meta: { test: 'value' }
                }
            },
            {
                name: 'С полями username, first_name, last_name',
                data: {
                    tenant_id: tenant.id,
                    tg_chat_id: 'test_names_' + Date.now(),
                    username: 'testuser',
                    first_name: 'Test',
                    last_name: 'User'
                }
            },
            {
                name: 'Полный набор полей',
                data: {
                    tenant_id: tenant.id,
                    tg_chat_id: 'test_full_' + Date.now(),
                    username: 'testuser',
                    first_name: 'Test',
                    last_name: 'User',
                    role: 'user',
                    meta: { test: 'value', setup_date: new Date().toISOString() }
                }
            }
        ];
        
        for (const testCase of testCases) {
            console.log(`\n🧪 Тест: ${testCase.name}`);
            console.log(`📝 Данные:`, testCase.data);
            
            try {
                const { data: user, error: userError } = await supabase
                    .from('users')
                    .insert(testCase.data)
                    .select()
                    .single();
                    
                if (userError) {
                    console.log(`❌ Ошибка: ${userError.message}`);
                    
                    // Если ошибка связана с отсутствующими колонками, попробуем создать пользователя без них
                    if (userError.message.includes('Could not find') && userError.message.includes('column')) {
                        console.log(`🔄 Пробуем создать пользователя без проблемных полей...`);
                        
                        const minimalData = {
                            tenant_id: testCase.data.tenant_id,
                            tg_chat_id: testCase.data.tg_chat_id
                        };
                        
                        const { data: minimalUser, error: minimalError } = await supabase
                            .from('users')
                            .insert(minimalData)
                            .select()
                            .single();
                            
                        if (minimalError) {
                            console.log(`❌ Ошибка создания минимального пользователя: ${minimalError.message}`);
                        } else {
                            console.log(`✅ Минимальный пользователь создан: ${minimalUser.id}`);
                            
                            // Пробуем обновить пользователя, добавив поля по одному
                            console.log(`🔄 Пробуем добавить поля по одному...`);
                            
                            const updates = [];
                            if (testCase.data.username) updates.push({ username: testCase.data.username });
                            if (testCase.data.first_name) updates.push({ first_name: testCase.data.first_name });
                            if (testCase.data.last_name) updates.push({ last_name: testCase.data.last_name });
                            if (testCase.data.role) updates.push({ role: testCase.data.role });
                            if (testCase.data.meta) updates.push({ meta: testCase.data.meta });
                            
                            for (const update of updates) {
                                try {
                                    const { error: updateError } = await supabase
                                        .from('users')
                                        .update(update)
                                        .eq('id', minimalUser.id);
                                        
                                    if (updateError) {
                                        console.log(`⚠️ Не удалось обновить ${Object.keys(update)[0]}: ${updateError.message}`);
                                    } else {
                                        console.log(`✅ Поле ${Object.keys(update)[0]} обновлено`);
                                    }
                                } catch (updateErr) {
                                    console.log(`❌ Ошибка обновления ${Object.keys(update)[0]}: ${updateErr.message}`);
                                }
                            }
                            
                            // Удаляем тестового пользователя
                            await supabase.from('users').delete().eq('id', minimalUser.id);
                        }
                    }
                } else {
                    console.log(`✅ Пользователь создан успешно: ${user.id}`);
                    console.log(`📋 Структура:`, Object.keys(user));
                    
                    // Удаляем тестового пользователя
                    await supabase.from('users').delete().eq('id', user.id);
                }
            } catch (error) {
                console.log(`❌ Критическая ошибка: ${error.message}`);
            }
        }
        
        // Удаляем тестовый tenant
        await supabase.from('tenants').delete().eq('id', tenant.id);
        
        console.log('\n📋 Рекомендации:');
        console.log('1. Проверьте схему базы данных в Supabase Dashboard');
        console.log('2. Убедитесь, что таблица users имеет все необходимые колонки');
        console.log('3. Если колонки отсутствуют, добавьте их через SQL Editor в Supabase');
        console.log('4. Необходимые колонки: meta (JSONB), role (TEXT), username (TEXT), first_name (TEXT), last_name (TEXT)');
        
    } catch (error) {
        console.log('❌ Критическая ошибка:', error.message);
        console.log('Stack trace:', error.stack);
    }
}

simpleFixUsers().then(() => {
    console.log('\n🎯 Проверка завершена!');
    process.exit(0);
}).catch(console.error);

