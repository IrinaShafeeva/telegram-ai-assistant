/**
 * Reminder Service
 * Управляет напоминаниями для команды: Google Calendar + Telegram уведомления
 */

const { createTeamReminder } = require('./googleCalendar');
const { writeReminder } = require('./googleSheets');
const { supabase } = require('../config/database');

class ReminderService {
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Создает напоминание для команды
     * @param {Object} reminderData - данные напоминания
     * @param {string} reminderData.contact - имя контакта
     * @param {string} reminderData.what - что напомнить
     * @param {string} reminderData.when - когда напомнить
     * @param {string} reminderData.tenantId - ID тенанта
     * @param {string} reminderData.chatId - ID чата отправителя
     * @returns {Object} результат создания напоминания
     */
    async createTeamReminder(reminderData) {
        try {
            const { contact, what, when, tenantId, chatId } = reminderData;
            
            console.log(`📅 Создаю командное напоминание для ${contact}: ${what} в ${when}`);

            // 1. Получаем информацию о члене команды
            console.log(`🔍 Ищем участника команды: ${contact} в tenant: ${tenantId}`);
            const teamMember = await this.getTeamMember(tenantId, contact);
            console.log(`👤 Результат поиска участника:`, teamMember);
            
            if (!teamMember) {
                console.log(`❌ Участник команды "${contact}" не найден`);
                return {
                    success: false,
                    message: `❌ Участник команды "${contact}" не найден`
                };
            }
            
            console.log(`✅ Участник команды найден: ${teamMember.display_name}`);

            // 2. Получаем Google Sheets ID
            const spreadsheetId = await this.getUserGoogleSheetsId(tenantId);
            if (!spreadsheetId) {
                return {
                    success: false,
                    message: '❌ Google Sheets не настроен'
                };
            }

            // 3. Создаем напоминание в Google Calendar
            const calendarResult = await createTeamReminder(contact, what, when, tenantId);
            
            if (!calendarResult.success) {
                return {
                    success: false,
                    message: `❌ Ошибка создания в Google Calendar: ${calendarResult.message || calendarResult.error}`
                };
            }

            // 4. Записываем в Google Sheets
            await writeReminder(spreadsheetId, contact, what, when, chatId);

            // 5. Отправляем уведомления в Telegram
            const telegramResult = await this.sendTelegramNotifications(teamMember, what, when, chatId);

            return {
                success: true,
                message: `✅ Напоминание создано для ${contact}:\n\n📅 ${what}\n⏰ ${when}\n\n📱 Добавлено в Google Calendar\n📊 Записано в Google Sheets\n📨 Уведомления отправлены в Telegram`,
                calendarEvent: calendarResult,
                telegramNotifications: telegramResult
            };

        } catch (error) {
            console.error('❌ Ошибка создания командного напоминания:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Получает информацию о члене команды
     */
    async getTeamMember(tenantId, contactName) {
        try {
            // Генерируем варианты имени для поиска
            const nameVariations = this.generateNameVariations(contactName);
            console.log(`🔍 Ищем участника команды с вариантами:`, nameVariations);
            
            // Пробуем найти по каждому варианту имени напрямую в таблице team_members
            for (const variation of nameVariations) {
                console.log(`🔍 Поиск по варианту: "${variation}"`);
                
                const { data, error } = await supabase
                    .from('team_members')
                    .select('id, display_name, aliases, meta, tg_chat_id')
                    .eq('tenant_id', tenantId)
                    .eq('is_active', true)
                    .ilike('display_name', variation);

                if (error) {
                    console.error(`❌ Ошибка поиска по варианту "${variation}":`, error);
                    continue;
                }

                if (data && data.length > 0) {
                    const member = data[0];
                    console.log(`✅ Найден участник команды: "${variation}" → ${member.display_name}`);
                    console.log(`📧 Meta данные участника:`, member.meta);
                    
                    // Возвращаем в том же формате, что ожидает код
                    return {
                        member_id: member.id,
                        display_name: member.display_name,
                        tg_chat_id: member.tg_chat_id,
                        meta: member.meta,
                        gcal_connection_id: null // Не используется в текущем коде
                    };
                }
            }

            console.log(`❌ Участник команды "${contactName}" не найден ни по одному варианту`);
            return null;
            
        } catch (error) {
            console.error('❌ Ошибка получения члена команды:', error);
            return null;
        }
    }

    /**
     * Генерирует варианты имени для поиска (разные падежи)
     */
    generateNameVariations(name) {
        const variations = [name];
        
        // Простые правила для русских имен
        if (name.endsWith('и')) {
            // "Марии" → "Мария"
            variations.push(name.slice(0, -1) + 'я');
            // "Марии" → "Мария" (уже добавили)
            variations.push(name.slice(0, -1));
        }
        
        if (name.endsWith('е')) {
            // "Саше" → "Саша"
            variations.push(name.slice(0, -1) + 'а');
        }
        
        if (name.endsWith('у')) {
            // "Сашу" → "Саша"  
            variations.push(name.slice(0, -1) + 'а');
        }
        
        if (name.endsWith('ю')) {
            // "Машю" → "Маша"
            variations.push(name.slice(0, -1) + 'а');
        }
        
        // Добавляем базовые окончания
        if (!name.endsWith('а') && !name.endsWith('я')) {
            variations.push(name + 'а');
            variations.push(name + 'я');
        }
        
        // Убираем дубликаты
        return [...new Set(variations)];
    }

    /**
     * Получает Google Sheets ID пользователя
     */
    async getUserGoogleSheetsId(tenantId) {
        try {
            const { data: destinations, error } = await supabase
                .from('destinations')
                .select('external_id')
                .eq('tenant_id', tenantId)
                .eq('type', 'sheet')
                .eq('provider', 'google')
                .limit(1);

            if (error) {
                console.error('❌ Ошибка получения Google Sheets ID:', error);
                return null;
            }

            if (destinations && destinations.length > 0) {
                const externalId = destinations[0].external_id;
                const spreadsheetId = externalId.split('!')[0];
                return spreadsheetId;
            }

            return null;
        } catch (error) {
            console.error('❌ Ошибка получения Google Sheets ID:', error);
            return null;
        }
    }

    /**
     * Отправляет уведомления в Telegram
     */
    async sendTelegramNotifications(teamMember, what, when, senderChatId) {
        try {
            const results = [];

            // Отправляем уведомление самому участнику команды
            const memberChatId = teamMember.tg_chat_id || teamMember.meta?.tg_chat_id;
            if (memberChatId) {
                try {
                    const message = this.formatReminderMessage(what, when, 'personal');
                    await this.bot.sendMessage(memberChatId, message, {
                        parse_mode: 'Markdown'
                    });
                    
                    results.push({
                        target: memberChatId,
                        status: 'sent',
                        type: 'personal'
                    });
                    
                    console.log(`✅ Уведомление отправлено ${teamMember.display_name} в Telegram (${memberChatId})`);
                } catch (error) {
                    console.error(`❌ Ошибка отправки уведомления ${teamMember.display_name}:`, error);
                    results.push({
                        target: memberChatId,
                        status: 'failed',
                        error: error.message,
                        type: 'personal'
                    });
                }
            } else {
                console.log(`⚠️ Telegram chat_id не найден для ${teamMember.display_name}`);
            }

            // Отправляем подтверждение отправителю
            try {
                const confirmationMessage = this.formatReminderMessage(what, when, 'confirmation', teamMember.display_name);
                await this.bot.sendMessage(senderChatId, confirmationMessage, {
                    parse_mode: 'Markdown'
                });
                
                results.push({
                    target: senderChatId,
                    status: 'sent',
                    type: 'confirmation'
                });
            } catch (error) {
                console.error('❌ Ошибка отправки подтверждения отправителю:', error);
                results.push({
                    target: senderChatId,
                    status: 'failed',
                    error: error.message,
                    type: 'confirmation'
                });
            }

            return {
                success: true,
                results: results,
                totalSent: results.filter(r => r.status === 'sent').length,
                totalFailed: results.filter(r => r.status === 'failed').length
            };

        } catch (error) {
            console.error('❌ Ошибка отправки Telegram уведомлений:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Форматирует сообщение напоминания
     */
    formatReminderMessage(what, when, type, contactName = '') {
        const emoji = '⏰';
        const time = new Date().toLocaleString('ru-RU');
        
        switch (type) {
            case 'personal':
                return `${emoji} *Напоминание для вас*\n\n📅 ${what}\n⏰ ${when}\n\n_Создано: ${time}_`;
            
            case 'personal_calendar':
                return `${emoji} *Личное напоминание создано*\n\n📅 ${what}\n⏰ ${when}\n\n✅ Добавлено в ваш Google Calendar\n📊 Записано в Google Sheets\n\n_Создано: ${time}_`;
            
            case 'confirmation':
                return `${emoji} *Напоминание создано*\n\n👤 Для: ${contactName}\n📅 ${what}\n⏰ ${when}\n\n✅ Добавлено в Google Calendar\n📨 Уведомление отправлено\n\n_Время: ${time}_`;
            
            default:
                return `${emoji} *Напоминание*\n\n📅 ${what}\n⏰ ${when}\n\n_Время: ${time}_`;
        }
    }

    /**
     * Создает личное напоминание
     */
    async createPersonalReminder(reminderData) {
        try {
            const { what, when, tenantId, chatId } = reminderData;
            
            console.log(`📅 Создаю личное напоминание: ${what} в ${when}`);

            // Получаем личный Calendar ID пользователя
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('meta')
                .eq('tenant_id', tenantId)
                .eq('tg_chat_id', chatId.toString())
                .single();
                
            if (userError) {
                console.error('❌ Ошибка получения пользователя:', userError);
                return {
                    success: false,
                    message: '❌ Ошибка получения данных пользователя'
                };
            }
            
            const personalCalendarId = user.meta?.personal_calendar_id;
            const userTimezone = user.meta?.timezone || 'Europe/Moscow';
            console.log(`📅 Personal Calendar ID: ${personalCalendarId}`);
            console.log(`🌍 User Timezone: ${userTimezone}`);
            
            if (!personalCalendarId) {
                return {
                    success: false,
                    message: '❌ Личный календарь не настроен. Используйте /setup для настройки Google Calendar'
                };
            }

            // Создаем событие в личном календаре
            const { createPersonalCalendarEvent } = require('./googleCalendar');
            const calendarResult = await createPersonalCalendarEvent(personalCalendarId, what, when, userTimezone);
            
            if (!calendarResult.success) {
                console.error('❌ Ошибка создания события в календаре:', calendarResult.error);
                return {
                    success: false,
                    message: `❌ Ошибка создания в Google Calendar: ${calendarResult.error || calendarResult.message}`
                };
            }

            // Получаем Google Sheets ID и записываем туда тоже
            const spreadsheetId = await this.getUserGoogleSheetsId(tenantId);
            if (spreadsheetId) {
                await writeReminder(spreadsheetId, 'Я', what, when, chatId);
                console.log('✅ Напоминание записано в Google Sheets');
            }
            
            // Отправляем подтверждение
            const message = this.formatReminderMessage(what, when, 'personal_calendar');
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown'
            });

            return {
                success: true,
                message: `✅ Личное напоминание создано:\n\n📅 ${what}\n⏰ ${when}\n\n📆 Добавлено в Google Calendar\n📊 Записано в Google Sheets`
            };

        } catch (error) {
            console.error('❌ Ошибка создания личного напоминания:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Обрабатывает напоминание (определяет тип и создает)
     */
    async processReminder(text, context, chatId) {
        try {
            console.log('⏰ Обрабатываю напоминание:', text);
            
            // Извлекаем информацию о напоминании
            const reminderInfo = this.extractReminderInfo(text);
            console.log('📅 Информация о напоминании:', reminderInfo);
            
            if (reminderInfo.contact && reminderInfo.when) {
                // Напоминание для конкретного человека - проверяем конфликт часовых поясов
                const timezoneConflict = await this.checkTimezoneConflict(context.tenant_id, chatId.toString(), reminderInfo.contact);
                
                if (timezoneConflict) {
                    // Есть конфликт - спрашиваем пользователя
                    return await this.handleTimezoneConflict(timezoneConflict, reminderInfo, context, chatId);
                }
                
                // Нет конфликта или уже разрешен - создаем напоминание
                return await this.createTeamReminder({
                    ...reminderInfo,
                    tenantId: context.tenant_id,
                    chatId: chatId.toString()
                });
            } else {
                // Личное напоминание
                return await this.createPersonalReminder({
                    ...reminderInfo,
                    tenantId: context.tenant_id,
                    chatId: chatId.toString()
                });
            }
            
        } catch (error) {
            console.error('❌ Ошибка обработки напоминания:', error);
            return { success: false, message: '❌ Ошибка обработки напоминания' };
        }
    }

    /**
     * Проверяет конфликт часовых поясов между отправителем и получателем
     */
    async checkTimezoneConflict(tenantId, senderChatId, contactName) {
        try {
            // Получаем часовой пояс отправителя
            const { data: sender, error: senderError } = await supabase
                .from('users')
                .select('meta')
                .eq('tenant_id', tenantId)
                .eq('tg_chat_id', senderChatId)
                .single();
            
            if (senderError) {
                console.log('⚠️ Не удалось получить часовой пояс отправителя');
                return null;
            }

            // Получаем часовой пояс получателя через участника команды
            const teamMember = await this.getTeamMember(tenantId, contactName);
            
            if (!teamMember || !teamMember.meta) {
                console.log('⚠️ Не удалось получить часовой пояс получателя');
                return null;
            }

            const senderTimezone = sender.meta?.timezone || 'Europe/Moscow';
            const recipientTimezone = teamMember.meta?.timezone || 'Europe/Moscow';

            console.log(`🌍 Часовой пояс отправителя: ${senderTimezone}`);
            console.log(`🌍 Часовой пояс получателя: ${recipientTimezone}`);

            if (senderTimezone !== recipientTimezone) {
                return {
                    senderTimezone,
                    recipientTimezone,
                    senderName: 'Вы',
                    recipientName: contactName
                };
            }

            return null; // Нет конфликта
            
        } catch (error) {
            console.error('❌ Ошибка проверки конфликта часовых поясов:', error);
            return null;
        }
    }

    /**
     * Обрабатывает конфликт часовых поясов - спрашивает пользователя
     */
    async handleTimezoneConflict(conflict, reminderInfo, context, chatId) {
        try {
            const message = `🌍 *Конфликт часовых поясов*\n\n` +
                `Вы создаёте напоминание для *${conflict.recipientName}*:\n` +
                `📅 ${reminderInfo.what}\n` +
                `⏰ ${reminderInfo.when}\n\n` +
                `Ваш часовой пояс: *${conflict.senderTimezone}*\n` +
                `Часовой пояс ${conflict.recipientName}: *${conflict.recipientTimezone}*\n\n` +
                `По чьему времени создать напоминание?`;

            const keyboard = {
                inline_keyboard: [
                    [
                        {
                            text: `🕐 По вашему времени (${conflict.senderTimezone})`,
                            callback_data: `timezone_conflict_sender_${chatId}_${Date.now()}`
                        }
                    ],
                    [
                        {
                            text: `🕑 По времени ${conflict.recipientName} (${conflict.recipientTimezone})`,
                            callback_data: `timezone_conflict_recipient_${chatId}_${Date.now()}`
                        }
                    ]
                ]
            };

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            return {
                success: true,
                message: 'Ожидаю выбор часового пояса...',
                pendingTimezoneConflict: true
            };

        } catch (error) {
            console.error('❌ Ошибка обработки конфликта часовых поясов:', error);
            return { success: false, message: '❌ Ошибка обработки конфликта часовых поясов' };
        }
    }

    /**
     * Извлекает информацию о напоминании из текста
     */
    extractReminderInfo(text) {
        const lowerText = text.toLowerCase();
        
        // Слова, указывающие на личное напоминание
        const personalPronouns = ['мне', 'себе', 'мной', 'собой'];
        
        // Сначала проверяем, личное ли это напоминание
        const hasPersonalPronoun = personalPronouns.some(pronoun => 
            lowerText.includes(pronoun)
        );
        
        if (hasPersonalPronoun) {
            // Это личное напоминание
            console.log('🔍 Определено как личное напоминание');
            
            // Извлекаем что напомнить (убираем "напомни мне")
            const personalMatch = text.match(/(?:напомни|напомнить)\s+(?:мне|себе)\s+(.+?)(?:\s+(?:завтра|сегодня|\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}))/i) ||
                                text.match(/(?:напомни|напомнить)\s+(?:мне|себе)\s+(.+)/i);
            
            let what = '';
            if (personalMatch) {
                what = personalMatch[1].trim();
                // Убираем временные маркеры из описания
                what = what.replace(/(?:завтра|сегодня|\d{1,2}:\d{2}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}|в\s+\d{1,2})\s*/gi, '').trim();
            }
            
            // Извлекаем время
            const dayMatch = text.match(/(?:завтра|сегодня|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}\.?\d{0,4})/i);
            const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
            const hourMatch = text.match(/в\s+(\d{1,2})(?!\d)/); // "в 12" но не "в 12:00"
            
            let whenParts = [];
            if (dayMatch) whenParts.push(dayMatch[0]);
            if (timeMatch) {
                whenParts.push(timeMatch[0]);
            } else if (hourMatch) {
                whenParts.push(hourMatch[1] + ':00');
            }
            
            const when = whenParts.length > 0 ? whenParts.join(' в ') : 'завтра';
            
            return {
                contact: null, // Личное напоминание
                what: what || 'напоминание',
                when: when,
                originalText: text,
                isPersonal: true
            };
        }
        
        // Паттерны для извлечения команд.ых напоминаний (для других людей)
        const contactPatterns = [
            /(?:напомни|напомнить)\s+(?:для\s+)?([а-яё]+)\s+(?:о\s+)?(.+?)(?:\s+(?:завтра|сегодня|\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}))/i,
            /(?:напомни|напомнить)\s+([а-яё]+)\s+(?:о\s+)?(.+?)(?:\s+(?:завтра|сегодня|\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}))/i
        ];
        
        let contact = null;
        let what = '';
        let when = '';
        
        for (const pattern of contactPatterns) {
            const match = text.match(pattern);
            if (match) {
                const potentialContact = match[1];
                
                // Проверяем, не является ли это личным местоимением
                if (!personalPronouns.includes(potentialContact.toLowerCase())) {
                    contact = potentialContact;
                    what = match[2].trim();
                    
                    // Извлекаем время
                    const dayMatch = text.match(/(?:завтра|сегодня|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}\.?\d{0,4})/i);
                    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
                    const hourMatch = text.match(/в\s+(\d{1,2})(?!\d)/);
                    
                    let whenParts = [];
                    if (dayMatch) whenParts.push(dayMatch[0]);
                    if (timeMatch) {
                        whenParts.push(timeMatch[0]);
                    } else if (hourMatch) {
                        whenParts.push(hourMatch[1] + ':00');
                    }
                    
                    when = whenParts.length > 0 ? whenParts.join(' в ') : 'завтра';
                    break;
                }
            }
        }
        
        // Если не нашли контакт, это личное напоминание по умолчанию
        if (!contact) {
            console.log('🔍 Определено как личное напоминание (по умолчанию)');
            
            const fallbackMatch = text.match(/(?:напомни|напомнить)\s+(.+)/i);
            if (fallbackMatch) {
                what = fallbackMatch[1].trim();
                // Убираем временные маркеры из описания
                what = what.replace(/(?:завтра|сегодня|\d{1,2}:\d{2}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}|в\s+\d{1,2})\s*/gi, '').trim();
            }
            
            const dayMatch = text.match(/(?:завтра|сегодня|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}\.?\d{0,4})/i);
            const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
            const hourMatch = text.match(/в\s+(\d{1,2})(?!\d)/);
            
            let whenParts = [];
            if (dayMatch) whenParts.push(dayMatch[0]);
            if (timeMatch) {
                whenParts.push(timeMatch[0]);
            } else if (hourMatch) {
                whenParts.push(hourMatch[1] + ':00');
            }
            
            when = whenParts.length > 0 ? whenParts.join(' в ') : 'завтра';
        }
        
        return {
            contact,
            what: what || text,
            when: when || 'завтра',
            originalText: text,
            isPersonal: !contact
        };
    }
}

module.exports = ReminderService;
