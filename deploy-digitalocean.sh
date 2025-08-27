#!/bin/bash

# DigitalOcean Droplet Setup Script for Expense Tracker Bot

echo "🚀 Setting up DigitalOcean Droplet for Expense Tracker Bot..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install Git
sudo apt install git -y

# Install Nginx
sudo apt install nginx -y

# Create app directory
sudo mkdir -p /var/www/expense-tracker-bot
sudo chown $USER:$USER /var/www/expense-tracker-bot

# Clone repository (replace with your repo URL)
cd /var/www/expense-tracker-bot
git clone https://github.com/IrinaShafeeva/telegram-ai-assistant.git .

# Install dependencies
npm install --production

# Create .env file
cat > .env << EOF
# Telegram Bot
BOT_TOKEN=8450163657:AAG0c4YmaZga83Iye6ymxWt5syMfgjMvYvs

# OpenAI (для AI-парсинга и аналитики)
OPENAI_API_KEY=your_openai_api_key

# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Google Sheets
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"ai-assistant-sheets","private_key_id":"1dec1a0b1d69ada650622acf6284e490a38de84f","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCy40759u+4c2vq\nv1sxUwcDby/uvQMJAnBTPKgNYpnp47Dl064kCedxNyzxa7cmiWXgTOjuf3Fk1khL\nyJRSHEviQK+S3jsHmHhlBnleyV7UpzjBvwuUaUc51J8m+SeWzfbnSb2dHLtKY2L9\naHj9Ajbj0CaQUZU6cDY5PVDkaWg+IqLBQrvvf4Jj2p1JXaly7eXhr4w9DrVpMhGe\nvwke0RP1+BXOUEGJ8By62Z8R4X1f4qEFtPF4kejWHQV4WU4ULzCpEDah1XPxkKsv\ntwnVEAchn78MnHii0XA/GUWNvcyQscvrI6HSvOkzyMH7dvTKlUXvbFKwc92gtr0C\nq8HqyY07AgMBAAECggEAA8l+bfVuola860bBzlTxXH73PfRZR4eMi3+2YVtOK2xI\n3d3bFDXzwGHWFAZWCkY+X5plyt2jQg8+IbgENPjNhwgcHSa3QljDapb2NkARrU7T\n1MY0VkSSBE5C4pKfL12M4293pCvZ1FcK3yld5li+zCq5pkbKux1pmr7mIu/GDAqr\nKnrcKLzG9RTv5SRdjQsnJwFZvpS4MHGp7aTcuH9SmTYWJ/+B/SJ3k3tDwlwku6oe\n0VOEvhkVzcwKIeiHaJm85YkuTiojPOHrWqK8WX3dsUtVvGfJfB49iTocaISsl3a5\n32Ap9CgFaDPF1A6mXBiiAR75t0ajehEnY1ymzozYgQKBgQDjQebSzD8e1jPVT1Jb\nlwKoRjHxRAQzrtQ8LueYVXcDFSVovUNbE7r7/WmKVr/yM8fIAkjXlyxuDNllpBkI\nNc+cv32PqMRmXwPbNjTbAvMAsWqPrKjUh7aZzRCSR3IVU5UO5p4EhftaquZnq/Ke\nbFstALtJUgfjBF2KDXus7z+7zQKBgQDJg07gdfOv99h47/rH588NjUTz+VMQK0N1\naA0y2vOkmg3WVFQFBndQ/JjraphuvWWr4hhRrKg9NOQcn3alZYrYyoHqyLHmveHA\nKYSwkjtUnccTzGA1Tz2/jv0d6bvNCeP6T22KXhrjr62TfRUu2ZAP9oYgrTkShSQ2\nV42FNXy1JwKBgQCXuckNFhZSVTq4AMSAp9q7VFpFtV6EzwWdxMcU+oKByV13h1zv\n8sVVNkR/exmd8BpDG9tcLO8Z7nQ6mwunYp3hDiwbfNbbbjZZ5d/2FQr+fHUjxWfW\ntWEhYDrfHto5CNus3iXD6Vv+lblMoA1U3g0lh6aC9kSTubdl00iuFfHcRQKBgQC2\n6EbKGoYMbSzB6SF6HgCkTlwOD3rDrGFYyg9g37hS6boxlu2EejAHBKBQ3rppmeQV\nNe3ZBJzYoY+EI4Hv8tEqofV2hKBlzmiAoa7dDn5n+aZfZBzXhouHumQpqKRcIeQa\nqcnF1FEX5bfprZlyouvOcXehZVnuY4dRA/tis//z9QKBgQDG4R5YkO4lCMIrYl+l\nq72WzjltGjeDiPs5bkNJcrg8iB/RrFbu4whTOPVwEJE+nlLXQIhrhmvc1G9E2TlC\nC1i8ksaytpI9lBAwnpqvdmAbnTqU5lGWZFdrxJ2WzduClnyTS8npbtd/x1YlMBsV\nI6fTZfTlefq5vLuZmzh2yAIWxQ==\n-----END PRIVATE KEY-----\n","client_email":"ai-assistant-bot-270@ai-assistant-sheets.iam.gserviceaccount.com","client_id":"106923129060449156363","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/ai-assistant-bot-270%40ai-assistant-sheets.iam.gserviceaccount.com","universe_domain":"googleapis.com"}

# App Settings
NODE_ENV=production
PORT=3000
EOF

# Setup PM2 ecosystem
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'expense-tracker-bot',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

# Start the bot with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Setup Nginx reverse proxy
sudo tee /etc/nginx/sites-available/expense-tracker-bot << EOF
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/expense-tracker-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

echo "✅ Setup complete! Your bot should be running on port 3000"
echo "📊 Check status: pm2 status"
echo "📝 View logs: pm2 logs expense-tracker-bot"
echo "🔄 Restart: pm2 restart expense-tracker-bot"
