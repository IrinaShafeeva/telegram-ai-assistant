/**
 * Тест функциональности настройки команды в боте
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Инициализация Supabase клиента
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function testTeamSetup() {
    console.log('🧪 Тестирование функциональности настройки команды\n');

    try {
        // Проверяем подключение к базе
        console.log('1️⃣ Проверка подключения к базе данных...');
        const { data: testData, error: testError } = await supabase
            .from('tenants')
            .select('*')
            .limit(1);

        if (testError) {
            console.log('❌ Ошибка подключения к базе:', testError.message);
            return;
        }

        console.log('✅ Подключение к базе успешно');

        // Проверяем существующих участников команды
        console.log('\n2️⃣ Проверка существующих участников команды...');
        const { data: teamMembers, error: membersError } = await supabase
            .from('team_members')
            .select('*')
            .limit(5);

        if (membersError) {
            console.log('❌ Ошибка получения участников:', membersError.message);
        } else if (teamMembers && teamMembers.length > 0) {
            console.log(`✅ Найдено ${teamMembers.length} участников команды:`);
            teamMembers.forEach((member, index) => {
                console.log(`   ${index + 1}. ${member.display_name}`);
                if (member.tg_chat_id) console.log(`      📱 Telegram: ${member.tg_chat_id}`);
                if (member.meta?.gcal_email) console.log(`      📅 Google Calendar: ${member.meta.gcal_email}`);
            });
        } else {
            console.log('📝 Участники команды не найдены');
        }

        // Проверяем структуру таблиц
        console.log('\n3️⃣ Проверка структуры таблиц...');
        const tables = ['team_members', 'connections', 'destinations', 'routes'];
        
        for (const table of tables) {
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .limit(1);
                
                if (error) {
                    console.log(`❌ Таблица ${table}: ${error.message}`);
                } else {
                    console.log(`✅ Таблица ${table}: доступна`);
                }
            } catch (e) {
                console.log(`❌ Таблица ${table}: ошибка доступа`);
            }
        }

        console.log('\n🎯 Тестирование завершено!');
        console.log('\n📋 Следующие шаги:');
        console.log('1. Запустите бота: npm run dev');
        console.log('2. Отправьте команду /team');
        console.log('3. Следуйте инструкциям по настройке команды');

    } catch (error) {
        console.error('❌ Ошибка тестирования:', error);
    }
}

// Запуск теста
if (require.main === module) {
    testTeamSetup();
}

module.exports = { testTeamSetup };
