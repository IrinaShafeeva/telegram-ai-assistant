const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log('🧪 Тестирование подключения к Supabase...\n');

// Проверяем переменные окружения
console.log('📋 Переменные окружения:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Установлен' : '❌ Отсутствует');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Установлен' : '❌ Отсутствует');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? '✅ Установлен' : '❌ Отсутствует');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Установлен' : '❌ Отсутствует');
console.log('');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Ошибка: Отсутствуют обязательные переменные окружения для Supabase');
    console.log('Создайте файл .env с настройками:');
    console.log('SUPABASE_URL=ваш_url_supabase');
    console.log('SUPABASE_ANON_KEY=ваш_ключ_supabase');
    process.exit(1);
}

// Инициализируем клиент Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testSupabaseConnection() {
    try {
        console.log('🔗 Тестирование подключения...');
        
        // Тест 1: Проверка подключения
        const { data, error } = await supabase
            .from('tenants')
            .select('count')
            .limit(1);
            
        if (error) {
            console.log('❌ Ошибка подключения:', error.message);
            
            if (error.message.includes('relation "tenants" does not exist')) {
                console.log('\n💡 Решение: Нужно выполнить схему базы данных');
                console.log('1. Откройте SQL Editor в Supabase');
                console.log('2. Скопируйте содержимое файла supabase-schema.sql');
                console.log('3. Выполните SQL команды');
                console.log('4. Перезапустите сервер');
            }
            return;
        }
        
        console.log('✅ Подключение к Supabase успешно!');
        
        // Тест 2: Проверка таблиц
        console.log('\n📊 Проверка таблиц...');
        
        const tables = ['tenants', 'users', 'records', 'team_members'];
        
        for (const table of tables) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('count')
                    .limit(1);
                    
                if (error) {
                    console.log(`❌ Таблица ${table}: ${error.message}`);
                } else {
                    console.log(`✅ Таблица ${table}: доступна`);
                }
            } catch (err) {
                console.log(`❌ Таблица ${table}: ошибка - ${err.message}`);
            }
        }
        
        // Тест 3: Создание тестового tenant
        console.log('\n🧪 Тестирование создания данных...');
        
        const testTenant = {
            name: 'test_chat_123',
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
            console.log('✅ Tenant создан успешно:', tenantData.id);
            
            // Удаляем тестовый tenant
            await supabase
                .from('tenants')
                .delete()
                .eq('id', tenantData.id);
                
            console.log('✅ Тестовый tenant удален');
        }
        
    } catch (error) {
        console.log('❌ Критическая ошибка:', error.message);
    }
}

testSupabaseConnection().then(() => {
    console.log('\n🎯 Тестирование завершено!');
    process.exit(0);
}).catch(console.error);
