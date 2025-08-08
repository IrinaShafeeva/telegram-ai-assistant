/**
 * Google Sheets Connector
 * Handles delivery to Google Sheets
 */

const { google } = require('googleapis');

class GoogleSheetsConnector {
    constructor() {
        this.name = 'google_sheets';
        this.sheets = null;
        this.auth = null;
        this.initializeAuth();
    }

    initializeAuth() {
        if (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
            this.auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n')
                },
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
        }
    }

    async deliver(record, delivery) {
        if (!this.sheets) {
            throw new Error('Google Sheets not configured');
        }

        const { target } = delivery;
        const [spreadsheetId, sheetName] = target.split('!');
        
        try {
            const values = this.formatRowData(record);
            
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [values] }
            });

            return {
                spreadsheet_id: spreadsheetId,
                sheet_name: sheetName,
                rows_added: 1,
                range: response.data.updates.updatedRange
            };
        } catch (error) {
            console.error('Google Sheets delivery error:', error);
            throw error;
        }
    }

    formatRowData(record) {
        const { kind, title, body, amount, currency, url, tags, assignee, created_at } = record;
        
        const date = new Date(created_at).toLocaleDateString('ru-RU');
        const time = new Date(created_at).toLocaleTimeString('ru-RU');
        
        switch (kind) {
            case 'expense':
                return [
                    date,
                    time,
                    title,
                    amount || '',
                    currency || 'RUB',
                    body || '',
                    tags ? tags.join(', ') : ''
                ];
                
            case 'task':
                return [
                    date,
                    time,
                    title,
                    body || '',
                    assignee?.display_name || '',
                    record.due_at ? new Date(record.due_at).toLocaleDateString('ru-RU') : '',
                    'Новая',
                    tags ? tags.join(', ') : ''
                ];
                
            case 'bookmark':
                return [
                    date,
                    time,
                    title,
                    url || '',
                    body || '',
                    tags ? tags.join(', ') : ''
                ];
                
            default:
                return [
                    date,
                    time,
                    kind,
                    title,
                    body || '',
                    tags ? tags.join(', ') : ''
                ];
        }
    }

    async createSheetHeaders(spreadsheetId, sheetName, kind) {
        if (!this.sheets) return;

        const headers = this.getHeaders(kind);
        
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetName}!A1:Z1`,
                valueInputOption: 'RAW',
                resource: { values: [headers] }
            });

            // Format header row
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        repeatCell: {
                            range: {
                                sheetId: 0,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: headers.length
                            },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: { bold: true },
                                    backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                                }
                            },
                            fields: 'userEnteredFormat(textFormat,backgroundColor)'
                        }
                    }]
                }
            });

            return { success: true, headers };
        } catch (error) {
            console.error('Create headers error:', error);
            throw error;
        }
    }

    getHeaders(kind) {
        switch (kind) {
            case 'expense':
                return ['Дата', 'Время', 'Описание', 'Сумма', 'Валюта', 'Детали', 'Теги'];
            case 'task':
                return ['Дата', 'Время', 'Задача', 'Описание', 'Ответственный', 'Срок', 'Статус', 'Теги'];
            case 'bookmark':
                return ['Дата', 'Время', 'Название', 'Ссылка', 'Заметка', 'Теги'];
            default:
                return ['Дата', 'Время', 'Тип', 'Название', 'Описание', 'Теги'];
        }
    }

    async validateTarget(target) {
        if (!this.sheets) {
            return { valid: false, error: 'Google Sheets not configured' };
        }

        const [spreadsheetId, sheetName] = target.split('!');
        
        try {
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId,
                ranges: [sheetName]
            });

            return {
                valid: true,
                spreadsheet_title: response.data.properties.title,
                sheet_exists: true
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
        this.calendar = null;
        this.initializeAuth();
    }

    initializeAuth() {
        if (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
            const auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n')
                },
                scopes: ['https://www.googleapis.com/auth/calendar']
            });
            this.calendar = google.calendar({ version: 'v3', auth });
        }
    }

    async deliver(record, delivery) {
        if (!this.calendar || record.kind !== 'task') {
            throw new Error('Google Calendar not configured or record is not a task');
        }

        const { target } = delivery; // calendar ID
        
        try {
            const event = this.createEvent(record);
            
            const response = await this.calendar.events.insert({
                calendarId: target,
                resource: event
            });

            return {
                calendar_id: target,
                event_id: response.data.id,
                event_link: response.data.htmlLink
            };
        } catch (error) {
            console.error('Google Calendar delivery error:', error);
            throw error;
        }
    }

    createEvent(record) {
        const { title, body, due_at, assignee } = record;
        
        const startTime = due_at ? new Date(due_at) : new Date();
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour

        return {
            summary: title,
            description: body || '',
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'Europe/Moscow'
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'Europe/Moscow'
            },
            attendees: assignee?.email ? [{ email: assignee.email }] : [],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 10 }
                ]
            }
        };
    }
}

module.exports = { GoogleSheetsConnector, GoogleCalendarConnector };