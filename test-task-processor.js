/**
 * Тест taskProcessor
 */

const { processTask } = require('./src/services/taskProcessor');

async function testTaskProcessor() {
    console.log('🧪 Тестирование taskProcessor...\n');

    const mockContext = {
        tenant_id: 'test_tenant',
        user_id: 'test_user'
    };

    const mockChatId = 123456789;

    // Тест 1: Личная задача
    console.log('📋 Тест 1: Личная задача...');
    try {
        const result = await processTask('Задача: купить молоко', mockContext, mockChatId);
        console.log('✅ Личная задача result:', result);
    } catch (error) {
        console.log('⚠️ Личная задача error:', error.message);
    }

    // Тест 2: Задача для конкретного человека
    console.log('\n📋 Тест 2: Задача для человека...');
    try {
        const result = await processTask('Задача для Ивана: позвонить в банк', mockContext, mockChatId);
        console.log('✅ Задача для человека result:', result);
    } catch (error) {
        console.log('⚠️ Задача для человека error:', error.message);
    }

    // Тест 3: Задача с глаголом
    console.log('\n📋 Тест 3: Задача с глаголом...');
    try {
        const result = await processTask('Иван сделай отчет', mockContext, mockChatId);
        console.log('✅ Задача с глаголом result:', result);
    } catch (error) {
        console.log('⚠️ Задача с глаголом error:', error.message);
    }

    // Тест 4: Задача покупки
    console.log('\n📋 Тест 4: Задача покупки...');
    try {
        const result = await processTask('Маша купи продукты', mockContext, mockChatId);
        console.log('✅ Задача покупки result:', result);
    } catch (error) {
        console.log('⚠️ Задача покупки error:', error.message);
    }

    // Тест 5: Задача звонка
    console.log('\n📋 Тест 5: Задача звонка...');
    try {
        const result = await processTask('Попроси Ваню позвонить клиенту', mockContext, mockChatId);
        console.log('✅ Задача звонка result:', result);
    } catch (error) {
        console.log('⚠️ Задача звонка error:', error.message);
    }

    console.log('\n🎉 Тестирование taskProcessor завершено!');
}

testTaskProcessor().catch(console.error);
