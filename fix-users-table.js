const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

console.log('🔧 Исправление структуры таблицы users...\n');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('❌ Ошибка: Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function fixUsersTable() {
    try {
        console.log('📊 Применяем исправления к таблице users...\n');
        
        // Читаем SQL файл
        const sqlContent = fs.readFileSync('fix-users-table.sql', 'utf8');
        
        // Выполняем SQL запросы
        const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
        
        if (error) {
            console.log('❌ Ошибка выполнения SQL:', error.message);
            
            // Попробуем выполнить запросы по частям
            console.log('\n🔄 Пробуем выполнить запросы по частям...');
            
            const queries = [
                // Добавляем колонку meta
                `DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'users' AND column_name = 'meta'
                    ) THEN
                        ALTER TABLE users ADD COLUMN meta JSONB DEFAULT '{}';
                        RAISE NOTICE 'Added meta column to users table';
                    ELSE
                        RAISE NOTICE 'Meta column already exists in users table';
                    END IF;
                END$$;`,
                
                // Добавляем колонку role
                `DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'users' AND column_name = 'role'
                    ) THEN
                        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
                        RAISE NOTICE 'Added role column to users table';
                    ELSE
                        RAISE NOTICE 'Role column already exists in users table';
                    END IF;
                END$$;`,
                
                // Добавляем колонку username
                `DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'users' AND column_name = 'username'
                    ) THEN
                        ALTER TABLE users ADD COLUMN username TEXT;
                        RAISE NOTICE 'Added username column to users table';
                    ELSE
                        RAISE NOTICE 'Username column already exists in users table';
                    END IF;
                END$$;`,
                
                // Добавляем колонку first_name
                `DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'users' AND column_name = 'first_name'
                    ) THEN
                        ALTER TABLE users ADD COLUMN first_name TEXT;
                        RAISE NOTICE 'Added first_name column to users table';
                    ELSE
                        RAISE NOTICE 'First_name column already exists in users table';
                    END IF;
                END$$;`,
                
                // Добавляем колонку last_name
                `DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'users' AND column_name = 'last_name'
                    ) THEN
                        ALTER TABLE users ADD COLUMN last_name TEXT;
                        RAISE NOTICE 'Added last_name column to users table';
                    ELSE
                        RAISE NOTICE 'Last_name column already exists in users table';
                    END IF;
                END$$;`
            ];
            
            for (let i = 0; i < queries.length; i++) {
                console.log(`📝 Выполняем запрос ${i + 1}/${queries.length}...`);
                try {
                    const { error: queryError } = await supabase.rpc('exec_sql', { sql: queries[i] });
                    if (queryError) {
                        console.log(`⚠️ Запрос ${i + 1} не выполнен:`, queryError.message);
                    } else {
                        console.log(`✅ Запрос ${i + 1} выполнен успешно`);
                    }
                } catch (execError) {
                    console.log(`❌ Ошибка выполнения запроса ${i + 1}:`, execError.message);
                }
            }
        } else {
            console.log('✅ SQL запросы выполнены успешно');
        }
        
        // Проверяем итоговую структуру
        console.log('\n📋 Проверяем итоговую структуру таблицы users...');
        
        const { data: columns, error: columnsError } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable, column_default')
            .eq('table_name', 'users')
            .order('ordinal_position');
            
        if (columnsError) {
            console.log('❌ Ошибка получения структуры таблицы:', columnsError.message);
        } else {
            console.log('\n📊 Структура таблицы users:');
            columns.forEach(col => {
                console.log(`• ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(not null)'} ${col.column_default ? `default: ${col.column_default}` : ''}`);
            });
        }
        
        // Тестируем создание пользователя с новыми полями
        console.log('\n🧪 Тестируем создание пользователя с новыми полями...');
        
        // Создаем тестовый tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .insert({
                name: 'test_fix_' + Date.now(),
                plan: 'free'
            })
            .select()
            .single();
            
        if (tenantError) {
            console.log('❌ Ошибка создания tenant:', tenantError.message);
            return;
        }
        
        // Создаем тестового пользователя
        const testUser = {
            tenant_id: tenant.id,
            tg_chat_id: 'test_fix_' + Date.now(),
            username: 'testuser',
            first_name: 'Test',
            last_name: 'User',
            role: 'user',
            meta: { test: 'value', setup_date: new Date().toISOString() }
        };
        
        const { data: user, error: userError } = await supabase
            .from('users')
            .insert(testUser)
            .select()
            .single();
            
        if (userError) {
            console.log('❌ Ошибка создания тестового пользователя:', userError.message);
        } else {
            console.log('✅ Тестовый пользователь создан успешно:', user.id);
            console.log('📋 Данные пользователя:', {
                username: user.username,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role,
                meta: user.meta
            });
            
            // Удаляем тестовые данные
            await supabase.from('users').delete().eq('id', user.id);
            await supabase.from('tenants').delete().eq('id', tenant.id);
        }
        
    } catch (error) {
        console.log('❌ Критическая ошибка:', error.message);
        console.log('Stack trace:', error.stack);
    }
}

fixUsersTable().then(() => {
    console.log('\n🎯 Исправление структуры таблицы завершено!');
    process.exit(0);
}).catch(console.error);

