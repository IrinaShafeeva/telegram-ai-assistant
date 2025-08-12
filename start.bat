@echo off
echo 🤖 Starting AI Assistant v2.0...
echo.

echo 📦 Installing dependencies...
npm install

echo.
echo 🚀 Starting backend server...
npm run dev

echo.
echo ✅ Application is running on http://localhost:3000
echo 📱 Webhook URL: http://localhost:3000/webhook
echo.
pause 