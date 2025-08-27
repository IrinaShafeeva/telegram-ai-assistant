require('dotenv').config();
const { setupDatabase } = require('../src/services/supabase');
const logger = require('../src/utils/logger');

async function testDatabase() {
  try {
    logger.info('Testing database connection...');
    await setupDatabase();
    logger.info('✅ Database connection successful!');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

testDatabase();