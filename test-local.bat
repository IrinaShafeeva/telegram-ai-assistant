@echo off
echo 🤖 Expense Tracker Bot - Local Testing Setup (Windows)
echo =====================================================
echo.

REM Проверка наличия .env файла
if not exist .env (
    echo ❌ Файл .env не найден!
    echo 📝 Создайте файл .env из шаблона:
    echo    copy local-test.env .env
    echo    Затем отредактируйте .env с вашими данными
    echo.
    pause
    exit /b 1
)

echo ✅ Файл .env найден
echo.

echo 🚀 Доступные команды:
echo    npm run local      - Запуск в режиме разработки
echo    npm run local:prod - Запуск в продакшн режиме
echo    npm run dev        - Обычный режим разработки
echo.

echo 📊 Проверка бота:
echo    http://localhost:3000/        - Статус сервера
echo    http://localhost:3000/test-bot - Проверка бота
echo.

echo 💡 После запуска найдите вашего бота в Telegram и отправьте /start
echo.

echo 🎯 Готово к тестированию!
echo.
pause
