/**
 * Простой тест API endpoints
 */

async function testAPI() {
    console.log('🧪 Простое тестирование API endpoints...\n');

    // Тест 1: Health check
    try {
        console.log('📋 Тест 1: Health check...');
        const response = await fetch('http://localhost:3001/');
        const data = await response.json();
        console.log('✅ Health check:', data);
    } catch (error) {
        console.error('❌ Health check error:', error.message);
    }

    // Тест 2: Webhook endpoint
    try {
        console.log('\n📋 Тест 2: Webhook endpoint...');
        const response = await fetch('http://localhost:3001/webhook');
        const data = await response.json();
        console.log('✅ Webhook endpoint:', data);
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
    }

    // Тест 3: Records API
    try {
        console.log('\n📋 Тест 3: Records API...');
        const response = await fetch('http://localhost:3001/api/records?tenant_id=test&limit=5');
        const data = await response.json();
        console.log('✅ Records API:', data);
    } catch (error) {
        console.log('⚠️ Records API error:', error.message);
    }

    // Тест 4: Search API
    try {
        console.log('\n📋 Тест 4: Search API...');
        const response = await fetch('http://localhost:3001/api/search?tenant_id=test&query=test');
        const data = await response.json();
        console.log('✅ Search API:', data);
    } catch (error) {
        console.log('⚠️ Search API error:', error.message);
    }

    console.log('\n🎉 Простое API тестирование завершено!');
}

testAPI().catch(console.error);
