/**
 * Проверка существующих интеграций пользователя
 */

const { supabase } = require('./src/config/database');
require('dotenv').config();

const TENANT_ID = '3292135f-f4f9-4767-a6ce-71774c170cb0';

async function checkIntegrations() {
    console.log('🔍 Проверка интеграций для тенанта:', TENANT_ID);
    console.log('=' .repeat(50));
    
    try {
        // 1. Проверяем connections (Google API)
        const { data: connections, error: connError } = await supabase
            .from('connections')
            .select('*')
            .eq('tenant_id', TENANT_ID);
            
        if (connError) {
            console.log('❌ Ошибка получения connections:', connError.message);
        } else {
            console.log('🔗 Connections найдено:', connections.length);
            connections.forEach(conn => {
                console.log('  📋 ID:', conn.id);
                console.log('  🔧 Provider:', conn.provider);
                console.log('  🔑 Scopes:', conn.scopes);
                console.log('  📅 Создан:', new Date(conn.created_at).toLocaleString('ru'));
                console.log('  ---');
            });
        }
        
        // 2. Проверяем destinations (Google Sheets/Calendar)
        const { data: destinations, error: destError } = await supabase
            .from('destinations')
            .select('*')
            .eq('tenant_id', TENANT_ID);
            
        if (destError) {
            console.log('❌ Ошибка получения destinations:', destError.message);
        } else {
            console.log('\n📋 Destinations найдено:', destinations.length);
            destinations.forEach(dest => {
                console.log('  📋 ID:', dest.id);
                console.log('  📊 Type:', dest.type);
                console.log('  🔧 Provider:', dest.provider);
                console.log('  🆔 External ID:', dest.external_id);
                console.log('  📅 Создан:', new Date(dest.created_at).toLocaleString('ru'));
                console.log('  ---');
            });
        }
        
        // 3. Проверяем team_members
        const { data: members, error: membersError } = await supabase
            .from('team_members')
            .select('*')
            .eq('tenant_id', TENANT_ID);
            
        if (membersError) {
            console.log('❌ Ошибка получения team_members:', membersError.message);
        } else {
            console.log('\n👥 Team Members найдено:', members.length);
            members.forEach(member => {
                console.log('  📋 ID:', member.id);
                console.log('  👤 Display Name:', member.display_name);
                console.log('  📱 TG Chat ID:', member.tg_chat_id);
                console.log('  📅 GCal Connection ID:', member.gcal_connection_id);
                console.log('  ✅ Active:', member.is_active);
                console.log('  📅 Создан:', new Date(member.created_at).toLocaleString('ru'));
                console.log('  ---');
            });
        }
        
        // 4. Проверяем пользователя
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('tenant_id', TENANT_ID)
            .single();
            
        if (userError) {
            console.log('❌ Ошибка получения пользователя:', userError.message);
        } else {
            console.log('\n👤 Информация о пользователе:');
            console.log('  📋 ID:', user.id);
            console.log('  📱 TG Chat ID:', user.tg_chat_id);
            console.log('  👤 Username:', user.username);
            console.log('  🎭 First Name:', user.first_name);
            console.log('  📊 Tier:', user.tier);
            console.log('  📋 Meta:', JSON.stringify(user.meta, null, 2));
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log('📊 Итоги:');
        console.log('• Google Connections:', connections ? connections.length : 0);
        console.log('• Destinations (Sheets/Calendar):', destinations ? destinations.length : 0);
        console.log('• Team Members:', members ? members.length : 0);
        
        return {
            connections: connections || [],
            destinations: destinations || [],
            members: members || [],
            user: user
        };
        
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
        return null;
    }
}

// Запуск проверки
if (require.main === module) {
    checkIntegrations().then(result => {
        if (result) {
            console.log('\n💡 Рекомендации:');
            
            if (result.connections.length === 0) {
                console.log('• Нет Google API подключений - нужно настроить через /setup');
            }
            
            if (result.destinations.length === 0) {
                console.log('• Нет Google Sheets/Calendar - нужно добавить через /sheets или /team');
            }
            
            if (result.members.length === 0) {
                console.log('• Нет участников команды - можно добавить через /team');
            }
            
            console.log('\n🔧 Для настройки Google Calendar:');
            console.log('1. В Google Cloud Console добавьте сервисный аккаунт как редактора вашего календаря');
            console.log('2. Используйте /team для настройки календаря команды');
            console.log('3. Email сервисного аккаунта можно найти в credentials.json');
        }
    }).catch(console.error);
}

module.exports = { checkIntegrations };