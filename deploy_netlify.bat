@echo off
echo 🚀 Deploying to Netlify...
echo.

echo 📦 Installing dependencies...
npm install

echo.
echo 🔧 Building project...
npm run build

echo.
echo 📤 Deploying to Netlify...
echo.
echo ✅ If you have Netlify CLI installed, run: netlify deploy --prod
echo 📋 Or push to your connected Git repository
echo.

pause 