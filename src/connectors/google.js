/**
 * Google Connectors
 * Handles Google Sheets and Google Calendar integrations
 */

const { getSheetsAPI, getCalendarAPI } = require('../config/google');

class GoogleSheetsConnector {
    constructor() {
        this.name = 'google_sheets';
    }

    async deliver(record, delivery) {
        const { target } = delivery;
        
        try {
            const sheets = await getSheetsAPI();
            if (!sheets) {
                throw new Error('Google Sheets API недоступен');
            }

            // Определяем лист для записи
            let sheetName = 'Записи';
            switch (record.kind) {
                case 'expense':
                    sheetName = 'Расходы';
                    break;
                case 'task':
                    sheetName = 'Задачи';
                    break;
                case 'bookmark':
                    sheetName = 'Закладки';
                    break;
                case 'reminder':
                    sheetName = 'Напоминания';
                    break;
            }

            // Формируем данные для записи
            const rowData = this.formatRecordForSheets(record);
            
            // Записываем в Google Sheets
            const response = await sheets.spreadsheets.values.append({
                spreadsheetId: target,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [rowData]
                }
            });

            return {
                success: true,
                message: `✅ Запись сохранена в Google Sheets (${sheetName})`,
                spreadsheet_id: target,
                sheet_name: sheetName,
                row_count: response.data.updates?.updatedRows || 1
            };

        } catch (error) {
            console.error('Google Sheets delivery error:', error);
            throw error;
        }
    }

    formatRecordForSheets(record) {
        const now = new Date().toLocaleString('ru-RU');
        
        switch (record.kind) {
            case 'expense':
                return [
                    now,
                    record.title,
                    record.amount || '',
                    record.currency || 'RUB',
                    record.body || '',
                    record.tags?.join(', ') || '',
                    record.user_id || ''
                ];
                
            case 'task':
                return [
                    now,
                    record.title,
                    record.body || '',
                    record.assignee?.display_name || '',
                    record.due_at ? new Date(record.due_at).toLocaleDateString('ru-RU') : '',
                    record.tags?.join(', ') || '',
                    record.user_id || ''
                ];
                
            case 'bookmark':
                return [
                    now,
                    record.title,
                    record.url || '',
                    record.body || '',
                    record.tags?.join(', ') || '',
                    record.user_id || ''
                ];
                
            case 'reminder':
                return [
                    now,
                    record.title,
                    record.body || '',
                    record.assignee?.display_name || '',
                    record.due_at ? new Date(record.due_at).toLocaleDateString('ru-RU') : '',
                    'Напоминание',
                    record.user_id || ''
                ];
                
            default:
                return [
                    now,
                    record.title,
                    record.body || '',
                    record.kind,
                    record.tags?.join(', ') || '',
                    record.user_id || ''
                ];
        }
    }

    async validateTarget(target) {
        try {
            const sheets = await getSheetsAPI();
            if (!sheets) return { valid: false, error: 'Google Sheets API недоступен' };

            const response = await sheets.spreadsheets.get({
                spreadsheetId: target,
                ranges: ['A1'],
                fields: 'properties.title,sheets.properties.title'
            });

            return {
                valid: true,
                title: response.data.properties.title,
                sheets: response.data.sheets.map(s => s.properties.title)
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

class GoogleCalendarConnector {
    constructor() {
        this.name = 'google_calendar';
    }

    async deliver(record, delivery) {
        const { target } = delivery;
        
        try {
            const calendar = await getCalendarAPI();
            if (!calendar) {
                throw new Error('Google Calendar API недоступен');
            }

            // Получаем информацию о календаре участника
            const calendarInfo = await this.getCalendarInfo(target);
            if (!calendarInfo) {
                throw new Error('Информация о календаре не найдена');
            }

            // Создаем событие в календаре
            const event = this.formatRecordForCalendar(record);
            
            const response = await calendar.events.insert({
                calendarId: calendarInfo.calendar_id,
                resource: event,
                sendUpdates: 'all'
            });

            return {
                success: true,
                message: `✅ Напоминание создано в Google Calendar`,
                calendar_id: calendarInfo.calendar_id,
                event_id: response.data.id,
                event_link: response.data.htmlLink,
                member_name: calendarInfo.member_name
            };

        } catch (error) {
            console.error('Google Calendar delivery error:', error);
            throw error;
        }
    }

    async getCalendarInfo(connectionId) {
        try {
            // Здесь должна быть логика получения информации о календаре
            // из базы данных по connection_id
            // Пока что возвращаем заглушку
            return {
                calendar_id: 'primary', // или конкретный calendar_id
                member_name: 'Участник команды'
            };
        } catch (error) {
            console.error('Ошибка получения информации о календаре:', error);
            return null;
        }
    }

    formatRecordForCalendar(record) {
        const now = new Date();
        const dueDate = record.due_at ? new Date(record.due_at) : new Date(now.getTime() + 60 * 60 * 1000); // +1 час по умолчанию
        
        return {
            summary: `Напоминание: ${record.title}`,
            description: `${record.body || ''}\n\nСоздано ботом`,
            start: {
                dateTime: dueDate.toISOString(),
                timeZone: 'Europe/Moscow'
            },
            end: {
                dateTime: new Date(dueDate.getTime() + 60 * 60 * 1000).toISOString(), // +1 час
                timeZone: 'Europe/Moscow'
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 }, // За день
                    { method: 'popup', minutes: 30 }       // За 30 минут
                ]
            }
        };
    }

    async validateTarget(target) {
        try {
            const calendar = await getCalendarAPI();
            if (!calendar) return { valid: false, error: 'Google Calendar API недоступен' };

            // Проверяем доступность календаря
            const response = await calendar.calendars.get({
                calendarId: 'primary'
            });

            return {
                valid: true,
                calendar_id: response.data.id,
                summary: response.data.summary,
                timezone: response.data.timeZone
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

module.exports = { 
    GoogleSheetsConnector, 
    GoogleCalendarConnector 
};