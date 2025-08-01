@echo off
echo Starting Telegram AI Assistant...
echo.

echo Installing dependencies...
npm install

echo.
echo Starting backend server...
npm run dev

echo.
echo Application is running on http://localhost:3000
echo.
echo To start frontend development server:
echo cd frontend
echo npm start
echo.
pause 