/**
 * Тест Google Sheets интеграции
 */

const { writeExpense, writeTask, writeBookmark } = require('./src/services/googleSheets');

async function testGoogleSheets() {
    console.log('🧪 Тестирование Google Sheets интеграции...\n');

    const testSpreadsheetId = '1UJ4nq5XeEC7TZw5toufpVE_ryAgOlZQ-4ssKOaoy9Zo';
    const testTelegramId = '123456789';

    // Тест 1: Запись расхода
    console.log('📋 Тест 1: Запись расхода...');
    try {
        const result = await writeExpense(testSpreadsheetId, -1000, 'Тестовый расход', 'Продукты', testTelegramId);
        console.log('✅ Запись расхода result:', result);
    } catch (error) {
        console.log('⚠️ Запись расхода error:', error.message);
    }

    // Тест 2: Запись задачи
    console.log('\n📋 Тест 2: Запись задачи...');
    try {
        const result = await writeTask(testSpreadsheetId, 'Тестовая задача', 'Описание тестовой задачи', testTelegramId);
        console.log('✅ Запись задачи result:', result);
    } catch (error) {
        console.log('⚠️ Запись задачи error:', error.message);
    }

    // Тест 3: Запись закладки
    console.log('\n📋 Тест 3: Запись закладки...');
    try {
        const result = await writeBookmark(testSpreadsheetId, 'Тестовая закладка', 'Описание закладки', 'https://example.com', testTelegramId);
        console.log('✅ Запись закладки result:', result);
    } catch (error) {
        console.log('⚠️ Запись закладки error:', error.message);
    }

    // Тест 4: Запись расхода с положительной суммой (доход)
    console.log('\n📋 Тест 4: Запись дохода...');
    try {
        const result = await writeExpense(testSpreadsheetId, 50000, 'Зарплата', 'Доходы', testTelegramId);
        console.log('✅ Запись дохода result:', result);
    } catch (error) {
        console.log('⚠️ Запись дохода error:', error.message);
    }

    // Тест 5: Запись задачи с длинным описанием
    console.log('\n📋 Тест 5: Запись задачи с длинным описанием...');
    try {
        const longDescription = 'Это очень длинное описание задачи, которое содержит много текста для тестирования обработки длинных строк в Google Sheets. Задача включает в себя несколько этапов и требует внимательного подхода к выполнению.';
        const result = await writeTask(testSpreadsheetId, 'Сложная задача', longDescription, testTelegramId);
        console.log('✅ Запись сложной задачи result:', result);
    } catch (error) {
        console.log('⚠️ Запись сложной задачи error:', error.message);
    }

    console.log('\n🎉 Тестирование Google Sheets завершено!');
    console.log('📊 Проверьте таблицу: https://docs.google.com/spreadsheets/d/' + testSpreadsheetId);
}

testGoogleSheets().catch(console.error);
