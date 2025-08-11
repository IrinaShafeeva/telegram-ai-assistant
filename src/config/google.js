const { google } = require('googleapis');
const path = require('path');

// Google API настройки
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar'
];

// Функция для создания Google API клиента
function createGoogleClient() {
    try {
        // Путь к JSON файлу с ключами
        const keyFilePath = path.join(__dirname, '../../google-credentials.json');
        
        // Создаем JWT клиент
        const auth = new google.auth.GoogleAuth({
            keyFile: keyFilePath,
            scopes: SCOPES
        });

        return auth;
    } catch (error) {
        console.error('❌ Ошибка создания Google клиента:', error);
        return null;
    }
}

// Функция для получения Google Sheets API
async function getSheetsAPI() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, '../../google-credentials.json'),
            scopes: SCOPES
        });

        const authClient = await auth.getClient();
        return google.sheets({ version: 'v4', auth: authClient });
    } catch (error) {
        console.error('❌ Ошибка получения Sheets API:', error);
        return null;
    }
}

// Функция для получения Google Calendar API
async function getCalendarAPI() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, '../../google-credentials.json'),
            scopes: SCOPES
        });

        const authClient = await auth.getClient();
        return google.calendar({ version: 'v3', auth: authClient });
    } catch (error) {
        console.error('❌ Ошибка получения Calendar API:', error);
        return null;
    }
}

module.exports = {
    createGoogleClient,
    getSheetsAPI,
    getCalendarAPI,
    SCOPES
};
