// Сервис для работы с Google Calendar
const { getCalendarAPI } = require('../config/google');

// Функция для создания события в календаре
async function createCalendarEvent(calendarId, summary, description, startTime, endTime, attendees = [], timezone = 'Europe/Moscow') {
    try {
        console.log(`🔗 Подключаемся к Google Calendar API...`);
        const calendar = await getCalendarAPI();
        if (!calendar) {
            console.error('❌ Google Calendar API недоступен');
            throw new Error('Google Calendar API недоступен');
        }
        console.log(`✅ Google Calendar API подключен`);
        
        console.log(`📅 Создаём событие в календаре ${calendarId}:`);
        console.log(`   Заголовок: ${summary}`);
        console.log(`   Время: ${startTime}`);
        console.log(`   Часовой пояс: ${timezone}`);
        console.log(`   Участники: ${attendees.join(', ')}`);
        

        // Форматируем время
        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000); // +1 час по умолчанию

        const event = {
            summary: summary,
            description: description,
            start: {
                dateTime: start.toISOString(),
                timeZone: timezone,
            },
            end: {
                dateTime: end.toISOString(),
                timeZone: timezone,
            },
            attendees: attendees.map(email => ({ email })),
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 }, // За день
                    { method: 'popup', minutes: 30 },     // За 30 минут
                ],
            },
        };

        const response = await calendar.events.insert({
            calendarId: calendarId,
            resource: event,
            sendUpdates: 'all', // Отправляем уведомления участникам
        });

        console.log(`✅ Событие создано в календаре ${calendarId}:`, response.data.htmlLink);
        return {
            success: true,
            eventId: response.data.id,
            eventLink: response.data.htmlLink,
            message: `📅 Событие создано в календаре: ${summary}`
        };

    } catch (error) {
        console.error(`❌ Ошибка создания события в календаре ${calendarId}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Функция для создания напоминания в календаре команды
async function createTeamReminder(contactName, what, when, tenantId) {
    try {
        console.log(`📅 Создаю напоминание для ${contactName}: ${what} в ${when}`);

        // Получаем информацию о контакте включая календарь и часовой пояс
        const contactInfo = await getContactInfo(tenantId, contactName);
        
        if (!contactInfo || !contactInfo.calendarId) {
            console.log(`⚠️ Google Calendar ID не найден для ${contactName}`);
            return {
                success: false,
                message: `⚠️ Google Calendar не настроен для ${contactName}`
            };
        }

        const { calendarId, timezone } = contactInfo;

        // Парсим время напоминания
        const reminderTime = parseReminderTime(when);
        if (!reminderTime) {
            return {
                success: false,
                message: `❌ Не удалось распарсить время: ${when}`
            };
        }

        // Создаем событие в календаре
        console.log(`📅 Создаём событие в календаре: ${calendarId}`);
        console.log(`⏰ Время события: ${reminderTime}`);
        console.log(`🌍 Часовой пояс: ${timezone}`);
        
        const result = await createCalendarEvent(
            calendarId,
            `Напоминание: ${what}`,
            `Напоминание для ${contactName}\n\n${what}\n\nСоздано ботом`,
            reminderTime,
            null, // Длительность 1 час по умолчанию
            [], // Участники
            timezone
        );

        console.log(`📅 Результат создания события:`, result);
        return result;

    } catch (error) {
        console.error('❌ Ошибка создания напоминания в календаре:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Функция для получения Google Calendar email контакта из базы данных
async function getContactCalendarId(tenantId, contactName) {
    try {
        const { supabase } = require('../config/database');
        
        console.log(`🔍 Ищем Google Calendar email для ${contactName} в базе данных...`);

        // Генерируем варианты имени для поиска
        const nameVariations = generateNameVariations(contactName);
        console.log(`🔍 Варианты имени для поиска:`, nameVariations);

        // Пробуем найти по каждому варианту имени
        for (const variation of nameVariations) {
            console.log(`🔍 Ищем по варианту: "${variation}"`);
            
            const { data, error } = await supabase
                .from('team_members')
                .select('id, display_name, aliases, meta')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .ilike('display_name', variation);

            if (error) {
                console.error(`❌ Ошибка поиска по варианту "${variation}":`, error);
                continue;
            }

            if (data && data.length > 0) {
                const member = data[0];
                const gcalEmail = member.meta?.gcal_email;
                
                console.log(`✅ Найден участник "${variation}" → ${member.display_name}`);
                console.log(`📧 Meta данные:`, member.meta);
                
                if (gcalEmail) {
                    console.log(`✅ Найден Google Calendar email для ${contactName}: ${gcalEmail}`);
                    return gcalEmail;
                } else {
                    console.log(`⚠️ Google Calendar email не настроен для ${member.display_name}`);
                    return null;
                }
            }
        }

        console.log(`❌ Участник команды ${contactName} не найден ни по одному варианту`);
        return null;

    } catch (error) {
        console.error('❌ Ошибка получения Google Calendar email:', error);
        return null;
    }
}

// Функция для получения информации о контакте (календарь + часовой пояс)
async function getContactInfo(tenantId, contactName) {
    try {
        const { supabase } = require('../config/database');
        
        console.log(`🔍 Ищем информацию о контакте ${contactName} в базе данных...`);

        // Генерируем варианты имени для поиска
        const nameVariations = generateNameVariations(contactName);
        console.log(`🔍 Варианты имени для поиска:`, nameVariations);

        // Пробуем найти по каждому варианту имени
        for (const variation of nameVariations) {
            console.log(`🔍 Ищем по варианту: "${variation}"`);
            
            const { data, error } = await supabase
                .from('team_members')
                .select('id, display_name, aliases, meta')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .ilike('display_name', variation);

            if (error) {
                console.error(`❌ Ошибка поиска по варианту "${variation}":`, error);
                continue;
            }

            if (data && data.length > 0) {
                const member = data[0];
                const gcalEmail = member.meta?.gcal_email;
                const timezone = member.meta?.timezone || 'Europe/Moscow';
                
                console.log(`✅ Найден участник "${variation}" → ${member.display_name}`);
                console.log(`📧 Meta данные:`, member.meta);
                
                if (gcalEmail) {
                    console.log(`✅ Найден Google Calendar email для ${contactName}: ${gcalEmail}`);
                    console.log(`🌍 Часовой пояс: ${timezone}`);
                    return {
                        calendarId: gcalEmail,
                        timezone: timezone,
                        memberInfo: member
                    };
                } else {
                    console.log(`⚠️ Google Calendar email не настроен для ${member.display_name}`);
                    return null;
                }
            }
        }

        console.log(`❌ Участник команды ${contactName} не найден ни по одному варианту`);
        return null;

    } catch (error) {
        console.error('❌ Ошибка получения информации о контакте:', error);
        return null;
    }
}

// Функция для генерации вариантов имени (вынесена для переиспользования)
function generateNameVariations(name) {
    const variations = [name];
    
    // Простые правила для русских имен
    if (name.endsWith('и')) {
        // "Марии" → "Мария"
        variations.push(name.slice(0, -1) + 'я');
        // "Марии" → "Мари"
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

// Функция для парсинга времени напоминания
function parseReminderTime(timeString) {
    try {
        const lower = timeString.toLowerCase();
        const now = new Date();

        if (lower.includes('завтра')) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            // Извлекаем время
            const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
                tomorrow.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
            } else {
                tomorrow.setHours(9, 0, 0, 0); // По умолчанию 9:00
            }
            return tomorrow;
        }

        if (lower.includes('сегодня')) {
            const today = new Date(now);
            const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
                today.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
                // Если время уже прошло, переносим на завтра
                if (today <= now) {
                    today.setDate(today.getDate() + 1);
                }
            } else {
                today.setHours(now.getHours() + 1, 0, 0, 0); // Через час
            }
            return today;
        }

        // Пытаемся распарсить дату с текстовым месяцем (например, "15 августа")
        const monthNames = {
            'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
            'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
        };
        
        const textDateMatch = timeString.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
        if (textDateMatch) {
            const day = parseInt(textDateMatch[1]);
            const monthName = textDateMatch[2].toLowerCase();
            const month = monthNames[monthName];
            const year = now.getFullYear();
            
            console.log(`📅 Парсим дату: ${day} ${monthName} (месяц ${month})`);
            
            const date = new Date(year, month, day);
            const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
                date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
                console.log(`⏰ Установлено время: ${timeMatch[1]}:${timeMatch[2]}`);
            } else {
                // Если не указано время, но есть число в тексте, используем его как час
                const hourMatch = timeString.match(/в\s+(\d{1,2})/);
                if (hourMatch) {
                    date.setHours(parseInt(hourMatch[1]), 0, 0, 0);
                    console.log(`⏰ Установлен час из текста: ${hourMatch[1]}:00`);
                } else {
                    date.setHours(12, 0, 0, 0); // По умолчанию 12:00
                    console.log(`⏰ Установлено время по умолчанию: 12:00`);
                }
            }
            
            console.log(`📅 Результат парсинга: ${date.toISOString()}`);
            return date;
        }

        // Пытаемся распарсить конкретную дату в формате дд.мм.гггг
        const dateMatch = timeString.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]) - 1;
            const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
            
            const date = new Date(year, month, day);
            const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
                date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
            } else {
                date.setHours(12, 0, 0, 0);
            }
            return date;
        }

        // Если ничего не распарсили, возвращаем время через час
        const defaultTime = new Date(now);
        defaultTime.setHours(now.getHours() + 1, 0, 0, 0);
        return defaultTime;

    } catch (error) {
        console.error('❌ Ошибка парсинга времени:', error);
        return null;
    }
}

// Функция для создания личного напоминания в календаре
async function createPersonalCalendarEvent(calendarId, what, when, timezone = 'Europe/Moscow') {
    try {
        console.log(`📅 Создаю личное событие в календаре ${calendarId}: ${what} в ${when} (${timezone})`);
        
        // Парсим время
        const reminderTime = parseReminderTime(when);
        console.log(`⏰ Парсированное время:`, reminderTime);
        
        if (!reminderTime) {
            return {
                success: false,
                error: 'Не удалось распознать время'
            };
        }
        
        // Создаем событие
        const result = await createCalendarEvent(
            calendarId,
            `Напоминание: ${what}`,
            `Личное напоминание\n\n${what}\n\nСоздано ботом`,
            reminderTime,
            null, // Длительность 1 час по умолчанию  
            [], // Участники
            timezone
        );

        console.log(`📅 Результат создания личного события:`, result);
        return result;

    } catch (error) {
        console.error('❌ Ошибка создания личного напоминания в календаре:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    createCalendarEvent,
    createTeamReminder,
    getContactCalendarId,
    getContactInfo,
    parseReminderTime,
    createPersonalCalendarEvent
};
