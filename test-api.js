/**
 * Тест API endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
    console.log('🧪 Тестирование API endpoints...\n');

    // Тест 1: Health check
    try {
        console.log('📋 Тест 1: Health check...');
        const response = await axios.get(`${BASE_URL}/`);
        console.log('✅ Health check:', response.data);
    } catch (error) {
        console.error('❌ Health check error:', error.message);
    }

    // Тест 2: Webhook endpoint
    try {
        console.log('\n📋 Тест 2: Webhook endpoint...');
        const response = await axios.get(`${BASE_URL}/webhook`);
        console.log('✅ Webhook endpoint:', response.data);
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
    }

    // Тест 3: Records API без параметров
    try {
        console.log('\n📋 Тест 3: Records API без параметров...');
        const response = await axios.get(`${BASE_URL}/api/records`);
        console.log('✅ Records API:', response.data);
    } catch (error) {
        console.log('⚠️ Records API error (ожидаемо):', error.response?.data || error.message);
    }

    // Тест 4: Records API с параметрами
    try {
        console.log('\n📋 Тест 4: Records API с параметрами...');
        const response = await axios.get(`${BASE_URL}/api/records`, {
            params: {
                tenant_id: 'test_tenant',
                limit: 5
            }
        });
        console.log('✅ Records API с параметрами:', response.data);
    } catch (error) {
        console.log('⚠️ Records API с параметрами error:', error.response?.data || error.message);
    }

    // Тест 5: Search API
    try {
        console.log('\n📋 Тест 5: Search API...');
        const response = await axios.get(`${BASE_URL}/api/search`, {
            params: {
                tenant_id: 'test_tenant',
                query: 'test'
            }
        });
        console.log('✅ Search API:', response.data);
    } catch (error) {
        console.log('⚠️ Search API error:', error.response?.data || error.message);
    }

    console.log('\n🎉 API тестирование завершено!');
}

testAPI().catch(console.error);
