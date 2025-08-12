/**
 * Тест AI инструментов
 */

const { ToolsService } = require('./src/tools');

async function testTools() {
    console.log('🧪 Тестирование AI инструментов...\n');

    const toolsService = new ToolsService();

    // Тест 1: Получение списка инструментов
    console.log('📋 Тест 1: Получение списка инструментов...');
    const tools = toolsService.getTools();
    console.log(`✅ Найдено ${tools.length} инструментов:`);
    tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
    });

    // Тест 2: Тестирование resolve_person
    console.log('\n📋 Тест 2: resolve_person...');
    try {
        const result = await toolsService.executeTool('resolve_person', {
            name: 'test_user'
        }, {
            tenant_id: 'test_tenant',
            user_id: 'test_user'
        });
        console.log('✅ resolve_person result:', result);
    } catch (error) {
        console.log('⚠️ resolve_person error (ожидаемо без БД):', error.message);
    }

    // Тест 3: Тестирование add_expense
    console.log('\n📋 Тест 3: add_expense...');
    try {
        const result = await toolsService.executeTool('add_expense', {
            title: 'Test Expense',
            amount: -1000,
            currency: 'RUB',
            body: 'Test expense for testing'
        }, {
            tenant_id: 'test_tenant',
            user_id: 'test_user'
        });
        console.log('✅ add_expense result:', result);
    } catch (error) {
        console.log('⚠️ add_expense error (ожидаемо без БД):', error.message);
    }

    // Тест 4: Тестирование add_task
    console.log('\n📋 Тест 4: add_task...');
    try {
        const result = await toolsService.executeTool('add_task', {
            title: 'Test Task',
            body: 'Test task for testing',
            assignee: 'test_user',
            due_at: new Date().toISOString()
        }, {
            tenant_id: 'test_tenant',
            user_id: 'test_user'
        });
        console.log('✅ add_task result:', result);
    } catch (error) {
        console.log('⚠️ add_task error (ожидаемо без БД):', error.message);
    }

    // Тест 5: Тестирование add_bookmark
    console.log('\n📋 Тест 5: add_bookmark...');
    try {
        const result = await toolsService.executeTool('add_bookmark', {
            title: 'Test Bookmark',
            url: 'https://example.com',
            body: 'Test bookmark for testing'
        }, {
            tenant_id: 'test_tenant',
            user_id: 'test_user'
        });
        console.log('✅ add_bookmark result:', result);
    } catch (error) {
        console.log('⚠️ add_bookmark error (ожидаемо без БД):', error.message);
    }

    // Тест 6: Тестирование search
    console.log('\n📋 Тест 6: search...');
    try {
        const result = await toolsService.executeTool('search', {
            query: 'test',
            kind: 'expense',
            limit: 5
        }, {
            tenant_id: 'test_tenant',
            user_id: 'test_user'
        });
        console.log('✅ search result:', result);
    } catch (error) {
        console.log('⚠️ search error (ожидаемо без БД):', error.message);
    }

    // Тест 7: Тестирование route
    console.log('\n📋 Тест 7: route...');
    try {
        const result = await toolsService.executeTool('route', {
            record: {
                id: 1,
                title: 'Test Record',
                kind: 'expense',
                tenant_id: 'test_tenant'
            }
        }, {
            tenant_id: 'test_tenant',
            user_id: 'test_user'
        });
        console.log('✅ route result:', result);
    } catch (error) {
        console.log('⚠️ route error (ожидаемо без БД):', error.message);
    }

    console.log('\n🎉 Тестирование AI инструментов завершено!');
}

testTools().catch(console.error);
