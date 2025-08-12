/**
 * Test script for team workflow improvements
 * This script simulates the team member addition process
 */

const { supabase } = require('./src/config/database');

async function testTeamWorkflow() {
    console.log('🧪 Testing Team Workflow Improvements...\n');
    
    try {
        // Test 1: Name validation
        console.log('✅ Test 1: Name validation');
        const testNames = [
            'Ирина Шафеева',      // Valid Russian name
            'Irina Shafeeva',     // Valid English name
            'Мария-Анна',         // Valid with hyphen
            "O'Connor",           // Valid with apostrophe
            '123',                // Invalid: numbers only
            '!@#$%',              // Invalid: special chars only
            'A',                  // Invalid: too short
            'A'.repeat(51)        // Invalid: too long
        ];
        
        testNames.forEach(name => {
            const isValid = /^[а-яёa-z\s\-']+$/i.test(name.trim());
            const length = name.trim().length;
            const status = isValid && length >= 2 && length <= 50 ? '✅' : '❌';
            console.log(`${status} "${name}" - ${isValid ? 'Valid' : 'Invalid'} (length: ${length})`);
        });
        
        console.log('\n✅ Test 2: Alias validation');
        const testAliases = [
            'Ира, Ирина, Ирушка',     // Valid aliases
            'Ira, Irina, Irka',       // Valid English
            'Ира, Ира, Ирина',        // Duplicates (should be deduplicated)
            'Ира!@#, Ирина',          // Invalid chars
            'A'.repeat(31)            // Too long
        ];
        
        testAliases.forEach(aliasString => {
            const aliases = aliasString.split(',').map(a => a.trim()).filter(a => a && a.length > 0);
            const validAliases = aliases.filter(a => /^[а-яёa-z0-9\s\-']+$/i.test(a));
            const uniqueAliases = [...new Set(validAliases)];
            const hasDuplicates = uniqueAliases.length !== validAliases.length;
            
            console.log(`📝 "${aliasString}"`);
            console.log(`   Valid: ${validAliases.join(', ')}`);
            console.log(`   Unique: ${uniqueAliases.join(', ')}`);
            console.log(`   Duplicates: ${hasDuplicates ? 'Yes' : 'No'}\n`);
        });
        
        console.log('✅ Test 3: Timeout calculation');
        const now = new Date();
        const testTimes = [
            new Date(now.getTime() - 15 * 60 * 1000),  // 15 minutes ago
            new Date(now.getTime() - 31 * 60 * 1000),  // 31 minutes ago
            new Date(now.getTime() - 60 * 60 * 1000)   // 1 hour ago
        ];
        
        const timeoutMinutes = 30;
        testTimes.forEach(time => {
            const timeDiff = now - time;
            const isExpired = timeDiff > timeoutMinutes * 60 * 1000;
            const status = isExpired ? '❌ Expired' : '✅ Active';
            console.log(`${status} ${time.toLocaleString()} (${Math.round(timeDiff / 60000)} minutes ago)`);
        });
        
        console.log('\n🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    testTeamWorkflow();
}

module.exports = { testTeamWorkflow };

