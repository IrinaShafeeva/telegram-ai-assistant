/**
 * Database configuration
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Clean environment variables to remove any extra quotes or characters
const supabaseUrl = process.env.SUPABASE_URL?.replace(/^["']|["']$/g, '').trim();
const supabaseKey = process.env.SUPABASE_ANON_KEY?.replace(/^["']|["']$/g, '').trim();

console.log('🔍 Supabase config:', {
    url: supabaseUrl,
    keyLength: supabaseKey?.length
});

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };