@echo off
echo Установка зависимостей frontend...
cd frontend
npm install
echo.
echo Установка зависимостей backend...
cd ..
npm install
echo.
echo Готово! Теперь можно собирать проект.
pause 