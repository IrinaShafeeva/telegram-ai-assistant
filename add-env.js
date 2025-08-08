// Script to add environment variables to Vercel
const { exec } = require('child_process');
require('dotenv').config();

const envVars = [
    'OPENAI_API_KEY',
    'SUPABASE_URL', 
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
];

async function addEnvVar(name, value) {
    return new Promise((resolve, reject) => {
        const cmd = `echo "${value}" | vercel env add ${name} production`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error adding ${name}:`, error);
                reject(error);
            } else {
                console.log(`✅ Added ${name}`);
                resolve(stdout);
            }
        });
    });
}

async function main() {
    console.log('Adding environment variables to Vercel...\n');
    
    for (const envVar of envVars) {
        const value = process.env[envVar];
        if (value) {
            try {
                await addEnvVar(envVar, value);
                // Wait a bit between requests
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Failed to add ${envVar}`);
            }
        } else {
            console.warn(`⚠️ ${envVar} not found in .env file`);
        }
    }
    
    console.log('\n🎯 Done! Environment variables added to Vercel.');
}

main().catch(console.error);