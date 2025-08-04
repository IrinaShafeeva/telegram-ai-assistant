console.log('Testing Node.js...');
console.log('Loading dotenv...');
require('dotenv').config();
console.log('PORT:', process.env.PORT);
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('Test completed.'); 