#!/bin/bash

# Quick update script for DigitalOcean server
echo "🔄 Updating Voice AI Tracker on server..."

# Navigate to app directory
cd /var/www/voice-ai-tracker || exit 1

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Copy Google credentials file if exists locally
if [ -f "../ai-assistant-sheets-ddaae7505964.json" ]; then
  cp ../ai-assistant-sheets-ddaae7505964.json .
  echo "📄 Google credentials file copied"
fi

# Update Google credentials in .env if file exists
if [ -f "ai-assistant-sheets-ddaae7505964.json" ]; then
  # Remove existing Google credentials line
  grep -v "GOOGLE_APPLICATION_CREDENTIALS_JSON" .env > .env.tmp && mv .env.tmp .env
  
  # Add new credentials
  echo "GOOGLE_APPLICATION_CREDENTIALS_JSON=$(cat ai-assistant-sheets-ddaae7505964.json | tr -d '\n')" >> .env
  echo "✅ Google credentials updated in .env"
fi

# Install any new dependencies  
echo "📦 Installing dependencies..."
npm install --production

# Restart the bot
echo "🔄 Restarting bot..."
pm2 restart voice-ai-tracker

# Show status
echo "📊 Current status:"
pm2 status voice-ai-tracker

echo "✅ Update complete!"
echo "📝 Check logs: pm2 logs voice-ai-tracker"