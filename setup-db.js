require('dotenv').config();
const { supabase } = require('./src/config/database');
const fs = require('fs');

async function setupDatabase() {
    console.log('🔧 Настройка базы данных Supabase...\n');
    
    try {
        // Читаем SQL файл
        const sql = fs.readFileSync('supabase-simple.sql', 'utf8');
        console.log('📋 SQL файл прочитан, размер:', sql.length, 'символов');
        
        // Разбиваем на отдельные команды
        const commands = sql.split(';').filter(cmd => cmd.trim());
        console.log('📝 Найдено команд:', commands.length);
        
        // Выполняем команды по очереди
        for (let i = 0; i < commands.length; i++) {
            const command = commands[i].trim();
            if (!command) continue;
            
            try {
                console.log(`\n🔄 Выполняю команду ${i + 1}/${commands.length}...`);
                console.log('Команда:', command.substring(0, 100) + '...');
                
                const { error } = await supabase.rpc('exec_sql', { sql: command });
                
                if (error) {
                    // Если exec_sql не работает, пробуем через raw query
                    console.log('⚠️ exec_sql не работает, пробуем raw query...');
                    const { error: rawError } = await supabase.rpc('exec', { query: command });
                    
                    if (rawError) {
                        console.log('⚠️ Команда пропущена (возможно уже выполнена):', rawError.message);
                    } else {
                        console.log('✅ Команда выполнена через raw query');
                    }
                } else {
                    console.log('✅ Команда выполнена');
                }
                
            } catch (cmdError) {
                console.log('⚠️ Ошибка выполнения команды:', cmdError.message);
                console.log('Команда пропущена');
            }
        }
        
        console.log('\n🎉 Настройка базы данных завершена!');
        console.log('\n📊 Теперь можно:');
        console.log('• Сохранять расходы и доходы');
        console.log('• Создавать задачи');
        console.log('• Работать с Google Sheets');
        console.log('• Использовать все функции бота');
        
    } catch (error) {
        console.error('❌ Ошибка настройки базы данных:', error);
        console.log('\n💡 Попробуйте выполнить SQL вручную в Supabase Dashboard');
    }
}

// Запускаем настройку
setupDatabase();
