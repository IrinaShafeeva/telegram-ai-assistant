const fs = require('fs');
const path = require('path');

console.log('🔧 Database Setup Helper');
console.log('========================\n');

// Read the schema file
const schemaPath = path.join(__dirname, 'supabase-schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

console.log('📋 To set up your database, follow these steps:\n');

console.log('1️⃣ Go to your Supabase project dashboard:');
console.log('   https://supabase.com/dashboard/project/[your-project-id]');
console.log('');

console.log('2️⃣ Navigate to SQL Editor (in the left sidebar)');
console.log('');

console.log('3️⃣ Copy and paste the following SQL schema:');
console.log('   (The schema is also saved in supabase-schema.sql)');
console.log('');

console.log('4️⃣ Click "Run" to execute the schema');
console.log('');

console.log('5️⃣ After execution, restart your server with: npm run dev');
console.log('');

console.log('📝 Schema preview (first 500 characters):');
console.log('─'.repeat(50));
console.log(schema.substring(0, 500) + '...');
console.log('─'.repeat(50));
console.log('');

console.log('✅ Once the schema is executed, your agent will be able to:');
console.log('   • Save transactions, tasks, and ideas');
console.log('   • Display analytics');
console.log('   • Show recent items');
console.log('   • Work with the Telegram bot');
console.log('');

console.log('🚀 Ready to set up your database!'); 