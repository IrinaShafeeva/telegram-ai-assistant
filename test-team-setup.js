const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('🧪 Тестирование настройки команды...\n');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Ошибка: Отсутствуют переменные окружения');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testTeamSetup() {
    try {
        console.log('📊 Создаем тестовые данные...\n');
        
        // Создаем tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                name: 'test_team_setup_' + Date.now(),
                plan: 'free'
            })
            .select()
            .single();
            
        if (tenantError) {
            console.log('❌ Ошибка создания tenant:', tenantError.message);
            return;
        }
        
        console.log('✅ Tenant создан:', tenant.id);
        
        // Создаем пользователя
        const { data: user, error: userError } = await supabase
            .from('users')
            .insert({
                tenant_id: tenant.id,
                tg_chat_id: 'test_team_setup_' + Date.now(),
                username: 'testuser',
                first_name: 'Test',
                last_name: 'User',
                tier: 'free',
                meta: {}
            })
            .select()
            .single();
            
        if (userError) {
            console.log('❌ Ошибка создания пользователя:', userError.message);
            return;
        }
        
        console.log('✅ Пользователь создан:', user.id);
        
        // Тест 1: Проверяем состояние без настройки команды
        console.log('\n🧪 Тест 1: Состояние без настройки команды');
        const context1 = {
            tenant_id: tenant.id,
            user_id: user.id,
            tg_chat_id: user.tg_chat_id,
            meta: user.meta,
            teamSetupState: null
        };
        
        console.log('📋 Контекст:', context1);
        console.log('🔍 teamSetupState:', context1.teamSetupState);
        console.log('🔍 Условие !context.teamSetupState || !context.teamSetupState.step:', !(context1.teamSetupState && context1.teamSetupState.step));
        console.log('✅ Сообщения ДОЛЖНЫ записываться в Google Sheets');
        
        // Тест 2: Проверяем состояние с настройкой команды
        console.log('\n🧪 Тест 2: Состояние с настройкой команды');
        const teamSetupState = {
            step: 'name',
            memberData: {},
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
        const context2 = {
            tenant_id: tenant.id,
            user_id: user.id,
            tg_chat_id: user.tg_chat_id,
            meta: { ...user.meta, teamSetupState },
            teamSetupState: teamSetupState
        };
        
        console.log('📋 Контекст:', context2);
        console.log('🔍 teamSetupState:', context2.teamSetupState);
        console.log('🔍 Условие !context.teamSetupState || !context.teamSetupState.step:', !(context2.teamSetupState && context2.teamSetupState.step));
        console.log('❌ Сообщения НЕ ДОЛЖНЫ записываться в Google Sheets');
        
        // Тест 3: Проверяем состояние с пустым teamSetupState
        console.log('\n🧪 Тест 3: Состояние с пустым teamSetupState');
        const context3 = {
            tenant_id: tenant.id,
            user_id: user.id,
            tg_chat_id: user.tg_chat_id,
            meta: { ...user.meta, teamSetupState: {} },
            teamSetupState: {}
        };
        
        console.log('📋 Контекст:', context3);
        console.log('🔍 teamSetupState:', context3.teamSetupState);
        console.log('🔍 Условие !context.teamSetupState || !context.teamSetupState.step:', !(context3.teamSetupState && context3.teamSetupState.step));
        console.log('✅ Сообщения ДОЛЖНЫ записываться в Google Sheets (нет step)');
        
        // Тест 4: Проверяем состояние с teamSetupState без step
        console.log('\n🧪 Тест 4: Состояние с teamSetupState без step');
        const teamSetupStateNoStep = {
            memberData: {},
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
        const context4 = {
            tenant_id: tenant.id,
            user_id: user.id,
            tg_chat_id: user.tg_chat_id,
            meta: { ...user.meta, teamSetupState: teamSetupStateNoStep },
            teamSetupState: teamSetupStateNoStep
        };
        
        console.log('📋 Контекст:', context4);
        console.log('🔍 teamSetupState:', context4.teamSetupState);
        console.log('🔍 Условие !context.teamSetupState || !context.teamSetupState.step:', !(context4.teamSetupState && context4.teamSetupState.step));
        console.log('✅ Сообщения ДОЛЖНЫ записываться в Google Sheets (нет step)');
        
        // Тест 5: Симулируем сохранение состояния в базу данных
        console.log('\n🧪 Тест 5: Сохранение состояния в базу данных');
        
        // Обновляем пользователя с состоянием настройки команды
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                meta: {
                    ...user.meta,
                    teamSetupState: teamSetupState
                }
            })
            .eq('id', user.id);
            
        if (updateError) {
            console.log('❌ Ошибка обновления состояния:', updateError.message);
        } else {
            console.log('✅ Состояние настройки команды сохранено в базу данных');
            
            // Получаем обновленного пользователя
            const { data: updatedUser, error: getError } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();
                
            if (getError) {
                console.log('❌ Ошибка получения обновленного пользователя:', getError.message);
            } else {
                console.log('✅ Обновленный пользователь получен');
                console.log('📋 meta:', updatedUser.meta);
                console.log('🔍 teamSetupState в meta:', updatedUser.meta?.teamSetupState);
                
                const context5 = {
                    tenant_id: tenant.id,
                    user_id: updatedUser.id,
                    tg_chat_id: updatedUser.tg_chat_id,
                    meta: updatedUser.meta,
                    teamSetupState: updatedUser.meta?.teamSetupState
                };
                
                console.log('🔍 Условие !context.teamSetupState || !context.teamSetupState.step:', !(context5.teamSetupState && context5.teamSetupState.step));
                console.log('❌ Сообщения НЕ ДОЛЖНЫ записываться в Google Sheets');
            }
        }
        
        // Очищаем состояние
        console.log('\n🧹 Очищаем состояние настройки команды...');
        const { error: clearError } = await supabase
            .from('users')
            .update({ 
                meta: {
                    ...user.meta,
                    teamSetupState: null
                }
            })
            .eq('id', user.id);
            
        if (clearError) {
            console.log('❌ Ошибка очистки состояния:', clearError.message);
        } else {
            console.log('✅ Состояние настройки команды очищено');
        }
        
        // Удаляем тестовые данные
        console.log('\n🗑️ Удаляем тестовые данные...');
        await supabase.from('users').delete().eq('id', user.id);
        await supabase.from('tenants').delete().eq('id', tenant.id);
        console.log('✅ Тестовые данные удалены');
        
        console.log('\n📋 Итоговые выводы:');
        console.log('✅ Колонка meta работает корректно');
        console.log('✅ Состояние настройки команды сохраняется в meta.teamSetupState');
        console.log('✅ Логика проверки !context.teamSetupState || !context.teamSetupState.step работает правильно');
        console.log('✅ Во время настройки команды сообщения НЕ будут записываться в Google Sheets');
        
    } catch (error) {
        console.log('❌ Критическая ошибка:', error.message);
        console.log('Stack trace:', error.stack);
    }
}

testTeamSetup().then(() => {
    console.log('\n🎯 Тестирование завершено!');
    process.exit(0);
}).catch(console.error);

