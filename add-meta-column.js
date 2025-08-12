const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addMetaColumn() {
    console.log('🔧 Adding meta column to users table...');
    
    try {
        const sql = `
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'meta'
                ) THEN
                    ALTER TABLE users ADD COLUMN meta JSONB DEFAULT '{}';
                    RAISE NOTICE 'Added meta column to users table';
                ELSE
                    RAISE NOTICE 'Meta column already exists in users table';
                END IF;
            END$$;
        `;
        
        const { error } = await supabase.rpc('exec_sql', { sql });
        
        if (error) {
            console.error('❌ Error executing SQL:', error);
        } else {
            console.log('✅ Meta column added successfully!');
        }
        
    } catch (error) {
        console.error('❌ Failed to add meta column:', error);
    }
}

// Run the script
if (require.main === module) {
    addMetaColumn();
}

module.exports = { addMetaColumn };
