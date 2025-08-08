const axios = require('axios');

// Тестирование API endpoints
async function testAPI() {
    const baseURL = 'http://localhost:3000';
    
    console.log('🧪 Тестирование AI Assistant API...\n');
    
    // Тест 1: Проверка доступности сервера
    try {
        const response = await axios.get(`${baseURL}/api/records?tenant_id=test&limit=5`);
        console.log('✅ API доступен');
        console.log('📊 Записи:', response.data);
    } catch (error) {
        console.log('❌ API недоступен:', error.message);
    }
    
    // Тест 2: Поиск записей
    try {
        const response = await axios.get(`${baseURL}/api/search?tenant_id=test&query=продукты&limit=5`);
        console.log('\n🔍 Результаты поиска:', response.data);
    } catch (error) {
        console.log('\n❌ Ошибка поиска:', error.message);
    }
}

// Тестирование обработки сообщений
async function testMessageProcessing() {
    console.log('\n📝 Тестирование обработки сообщений...\n');
    
    const testMessages = [
        'Потратил 5000 на продукты',
        'Задача: купить молоко',
        'Сохрани ссылку на рецепт',
        'Доход 50000 зарплата',
        'Задача для Ивана: позвонить в банк'
    ];
    
    for (const message of testMessages) {
        console.log(`📤 Тестирую: "${message}"`);
        // Здесь можно добавить логику тестирования LLM обработки
    }
}

// Запуск тестов
async function runTests() {
    await testAPI();
    await testMessageProcessing();
    console.log('\n🎯 Тестирование завершено!');
}

runTests().catch(console.error);
