#!/bin/bash

# DigitalOcean Droplet Setup Script for Voice AI Expense Tracker

echo "🚀 Setting up DigitalOcean Droplet for Voice AI Expense Tracker..."

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
sudo mkdir -p /var/www/voice-ai-tracker
sudo chown $USER:$USER /var/www/voice-ai-tracker

# Clone repository (replace with your repo URL)
cd /var/www/voice-ai-tracker
git clone YOUR_REPO_URL_HERE .

# Install dependencies
npm install --production

# Copy .env file from template
cp .env.example .env

echo "⚠️  IMPORTANT: Edit the .env file with your actual credentials:"
echo "   nano .env"

# Setup PM2 ecosystem
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'voice-ai-tracker',
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
sudo tee /etc/nginx/sites-available/voice-ai-tracker << EOF
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
sudo ln -s /etc/nginx/sites-available/voice-ai-tracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup firewall
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

echo "✅ Setup complete! Your Voice AI Tracker bot should be running on port 3000"
echo "📊 Check status: pm2 status"
echo "📝 View logs: pm2 logs voice-ai-tracker"
echo "🔄 Restart: pm2 restart voice-ai-tracker"
echo ""
echo "⚠️  Don't forget to:"
echo "   1. Edit .env with your actual credentials: nano .env"
echo "   2. Update YOUR_REPO_URL_HERE in this script"
echo "   3. Replace your-domain.com in Nginx config"
