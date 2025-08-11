const { getSheetsAPI } = require('../config/google');

// Функция для записи данных в Google Sheets
async function writeToSheet(spreadsheetId, sheetName, data) {
    try {
        const sheets = await getSheetsAPI();
        if (!sheets) {
            throw new Error('Google Sheets API недоступен');
        }

        // Проверяем существование листа, создаем если нет
        await ensureSheetExists(sheets, spreadsheetId, sheetName);

        // Добавляем данные в конец листа
        const range = `${sheetName}!A:Z`;
        const values = [data];

        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values }
        });

        console.log(`✅ Данные записаны в ${sheetName}:`, response.data);
        return true;

    } catch (error) {
        console.error(`❌ Ошибка записи в ${sheetName}:`, error);
        return false;
    }
}

// Функция для создания листа если его нет
async function ensureSheetExists(sheets, spreadsheetId, sheetName) {
    try {
        // Получаем список листов
        const response = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheets = response.data.sheets.map(sheet => sheet.properties.title);

        if (!existingSheets.includes(sheetName)) {
            // Создаем новый лист
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName,
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 26
                                }
                            }
                        }
                    }]
                }
            });

            // Добавляем заголовки
            const headers = getHeadersForSheet(sheetName);
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetName}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
                valueInputOption: 'RAW',
                resource: { values: [headers] }
            });

            console.log(`✅ Лист ${sheetName} создан с заголовками`);
        }
    } catch (error) {
        console.error(`❌ Ошибка создания листа ${sheetName}:`, error);
    }
}

// Функция для получения заголовков для разных типов листов
function getHeadersForSheet(sheetName) {
    switch (sheetName) {
        case 'Расходы':
            return ['Дата', 'Время', 'Сумма', 'Описание', 'Категория', 'Telegram ID'];
        case 'Задачи':
            return ['Дата', 'Время', 'Название', 'Описание', 'Статус', 'Telegram ID'];
        case 'Закладки':
            return ['Дата', 'Время', 'Название', 'Описание', 'Ссылка', 'Telegram ID'];
        case 'Напоминания':
            return ['Дата', 'Время', 'Кому', 'Что', 'Когда', 'Статус', 'Telegram ID'];
        case 'Контакты':
            return ['Имя', 'Роль', 'Telegram ID', 'Email', 'Телефон', 'Google Calendar ID', 'Дата добавления'];
        default:
            return ['Дата', 'Время', 'Данные', 'Telegram ID'];
    }
}

// Функция для записи расхода
async function writeExpense(spreadsheetId, amount, description, category, telegramId) {
    const data = [
        new Date().toLocaleDateString('ru-RU'),
        new Date().toLocaleTimeString('ru-RU'),
        amount,
        description,
        category || 'Общие расходы',
        telegramId
    ];

    return await writeToSheet(spreadsheetId, 'Расходы', data);
}

// Функция для записи задачи
async function writeTask(spreadsheetId, title, description, telegramId) {
    const data = [
        new Date().toLocaleDateString('ru-RU'),
        new Date().toLocaleTimeString('ru-RU'),
        title,
        description,
        'Новая',
        telegramId
    ];

    return await writeToSheet(spreadsheetId, 'Задачи', data);
}

// Функция для записи закладки
async function writeBookmark(spreadsheetId, title, description, link, telegramId) {
    const data = [
        new Date().toLocaleDateString('ru-RU'),
        new Date().toLocaleTimeString('ru-RU'),
        title,
        description,
        link,
        telegramId
    ];

    return await writeToSheet(spreadsheetId, 'Закладки', data);
}

// Функция для записи напоминания
async function writeReminder(spreadsheetId, toWhom, what, when, telegramId) {
    const data = [
        new Date().toLocaleDateString('ru-RU'),
        new Date().toLocaleTimeString('ru-RU'),
        toWhom,
        what,
        when,
        'Активно',
        telegramId
    ];

    return await writeToSheet(spreadsheetId, 'Напоминания', data);
}

// Функция для записи контакта
async function writeContact(spreadsheetId, name, role, telegramId, email = '', phone = '', calendarId = '') {
    const data = [
        name,
        role || 'Участник',
        telegramId,
        email,
        phone,
        calendarId,
        new Date().toLocaleDateString('ru-RU')
    ];

    return await writeToSheet(spreadsheetId, 'Контакты', data);
}

module.exports = {
    writeToSheet,
    writeExpense,
    writeTask,
    writeBookmark,
    writeReminder,
    writeContact,
    ensureSheetExists
};
