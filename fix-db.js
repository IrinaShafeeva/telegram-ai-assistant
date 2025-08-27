require('dotenv').config();
const { supabase } = require('./src/services/supabase');

async function fixDatabase() {
  try {
    console.log('Checking projects table structure...');
    
    // Check current projects structure
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .limit(1);
    
    if (projectsError) {
      console.error('Error checking projects:', projectsError);
    } else {
      console.log('Current projects columns:', Object.keys(projects[0] || {}));
      
      if (projects.length > 0 && !projects[0].hasOwnProperty('google_sheet_url')) {
        console.log('Missing google_sheet_url column - this needs to be added manually in Supabase dashboard');
        console.log('Go to Supabase Dashboard > Table Editor > projects > Add column:');
        console.log('- Name: google_sheet_url');
        console.log('- Type: text');
        console.log('- Default: null');
      } else {
        console.log('✅ google_sheet_url column exists');
      }
    }
    
  } catch (err) {
    console.error('Exception:', err);
  }
  
  process.exit(0);
}

fixDatabase();