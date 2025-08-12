/**
 * Team Setup Script
 * Собирает данные участников команды для Google Calendar и Telegram уведомлений
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setupTeam() {
    console.log('👥 Настройка команды для Google Calendar и Telegram уведомлений\n');
    
    try {
        // Получаем или создаем tenant
        const { data: tenants, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .limit(1);
            
        if (tenantError) throw tenantError;
        
        let tenantId;
        if (tenants && tenants.length > 0) {
            tenantId = tenants[0].id;
            console.log(`✅ Используем существующий tenant: ${tenants[0].name}`);
        } else {
            const { data: tenant, error } = await supabase
                .from('tenants')
                .insert({ name: 'default_tenant', plan: 'free' })
                .select()
                .single();
                
            if (error) throw error;
            tenantId = tenant.id;
            console.log('✅ Создан новый tenant');
        }
        
        console.log('\n📋 Сбор данных участников команды...\n');
        
        const teamMembers = [];
        let continueAdding = true;
        
        while (continueAdding) {
            console.log(`\n--- Участник ${teamMembers.length + 1} ---`);
            
            const displayName = await question('👤 Имя участника: ');
            if (!displayName.trim()) break;
            
            const aliases = await question('🏷️ Псевдонимы (через запятую, Enter для пропуска): ');
            const tgChatId = await question('📱 Telegram Chat ID (Enter для пропуска): ');
            const gcalEmail = await question('📅 Google Calendar Email (Enter для пропуска): ');
            const gcalId = await question('🆔 Google Calendar ID (Enter для пропуска): ');
            
            teamMembers.push({
                tenant_id: tenantId,
                display_name: displayName.trim(),
                aliases: aliases.trim() ? aliases.split(',').map(a => a.trim()) : [],
                tg_chat_id: tgChatId.trim() || null,
                gcal_connection_id: null, // Будет настроено позже
                meta: {
                    gcal_email: gcalEmail.trim() || null,
                    gcal_id: gcalId.trim() || null,
                    setup_date: new Date().toISOString()
                },
                is_active: true
            });
            
            const more = await question('\nДобавить еще участника? (y/n): ');
            continueAdding = more.toLowerCase() === 'y' || more.toLowerCase() === 'да';
        }
        
        if (teamMembers.length === 0) {
            console.log('\n❌ Не добавлено ни одного участника');
            return;
        }
        
        console.log('\n💾 Сохранение участников команды...');
        
        // Сохраняем участников команды
        const { data: savedMembers, error: saveError } = await supabase
            .from('team_members')
            .upsert(teamMembers, { 
                onConflict: 'tenant_id,display_name',
                ignoreDuplicates: false 
            })
            .select();
            
        if (saveError) throw saveError;
        
        console.log(`✅ Сохранено ${savedMembers.length} участников команды`);
        
        // Создаем Google Calendar connections
        console.log('\n🔗 Настройка Google Calendar подключений...');
        
        for (const member of savedMembers) {
            if (member.meta.gcal_email || member.meta.gcal_id) {
                const { data: connection, error: connError } = await supabase
                    .from('connections')
                    .upsert({
                        tenant_id: tenantId,
                        provider: 'google',
                        secret_ref: `gcal_${member.id}`,
                        scopes: ['https://www.googleapis.com/auth/calendar'],
                        owner_user_id: null,
                        meta: {
                            member_id: member.id,
                            gcal_email: member.meta.gcal_email,
                            gcal_id: member.meta.gcal_id,
                            type: 'calendar'
                        }
                    }, { 
                        onConflict: 'tenant_id,provider,secret_ref',
                        ignoreDuplicates: false 
                    })
                    .select()
                    .single();
                    
                if (connError) {
                    console.log(`⚠️ Ошибка создания подключения для ${member.display_name}:`, connError.message);
                } else {
                    // Обновляем member с connection_id
                    await supabase
                        .from('team_members')
                        .update({ gcal_connection_id: connection.id })
                        .eq('id', member.id);
                        
                    console.log(`✅ Google Calendar подключение для ${member.display_name}`);
                }
            }
        }
        
        // Создаем destinations для Google Sheets
        console.log('\n📊 Настройка Google Sheets destinations...');
        
        const { data: destinations, error: destError } = await supabase
            .from('destinations')
            .upsert([
                {
                    tenant_id: tenantId,
                    type: 'sheet',
                    provider: 'google',
                    external_id: 'TEAM_SHEETS_ID', // Замените на реальный ID
                    meta: { name: 'Team Google Sheets' }
                },
                {
                    tenant_id: tenantId,
                    type: 'calendar',
                    provider: 'google',
                    external_id: 'TEAM_CALENDAR_ID', // Замените на реальный ID
                    meta: { name: 'Team Google Calendar' }
                }
            ], { 
                onConflict: 'tenant_id,type,provider',
                ignoreDuplicates: false 
            })
            .select();
            
        if (destError) {
            console.log('⚠️ Ошибка создания destinations:', destError.message);
        } else {
            console.log('✅ Google destinations созданы');
        }
        
        // Создаем маршруты для уведомлений
        console.log('\n🛣️ Настройка маршрутов уведомлений...');
        
        const routes = [
            {
                tenant_id: tenantId,
                name: 'Team reminders to Google Calendar',
                priority: 1,
                enabled: true,
                match: { kind: 'reminder', type: 'team' },
                action: [{ connector: 'google_calendar', target: '{{assignee.gcal_connection_id}}' }]
            },
            {
                tenant_id: tenantId,
                name: 'Team notifications to Telegram',
                priority: 2,
                enabled: true,
                match: { kind: 'reminder', type: 'team' },
                action: [{ connector: 'telegram_dm', target: '{{assignee.tg_chat_id}}' }]
            }
        ];
        
        for (const route of routes) {
            await supabase
                .from('routes')
                .upsert(route, { 
                    onConflict: 'tenant_id,name',
                    ignoreDuplicates: false 
                });
        }
        
        console.log('✅ Маршруты уведомлений созданы');
        
        // Выводим итоговую информацию
        console.log('\n🎉 Настройка команды завершена!');
        console.log('\n📋 Что настроено:');
        console.log(`• Участников команды: ${savedMembers.length}`);
        console.log(`• Google Calendar подключений: ${savedMembers.filter(m => m.meta.gcal_email || m.meta.gcal_id).length}`);
        console.log(`• Telegram уведомлений: ${savedMembers.filter(m => m.tg_chat_id).length}`);
        
        console.log('\n📝 Следующие шаги:');
        console.log('1. Настройте Google API credentials (google-credentials.json)');
        console.log('2. Замените TEAM_SHEETS_ID и TEAM_CALENDAR_ID на реальные ID');
        console.log('3. Запустите бота: npm run dev');
        console.log('4. Протестируйте: "Напомнить [Имя] о встрече завтра в 15:00"');
        
        // Выводим список участников
        console.log('\n👥 Участники команды:');
        for (const member of savedMembers) {
            console.log(`• ${member.display_name}`);
            if (member.meta.gcal_email) console.log(`  📅 Google Calendar: ${member.meta.gcal_email}`);
            if (member.tg_chat_id) console.log(`  📱 Telegram: ${member.tg_chat_id}`);
            if (member.aliases.length > 0) console.log(`  🏷️ Псевдонимы: ${member.aliases.join(', ')}`);
        }
        
    } catch (error) {
        console.error('❌ Ошибка настройки команды:', error);
        
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
            console.log('\n🔧 Сначала примените схему базы данных:');
            console.log('1. Выполните supabase-schema.sql в Supabase Dashboard');
            console.log('2. Затем запустите этот скрипт снова');
        }
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    setupTeam();
}

module.exports = { setupTeam };
