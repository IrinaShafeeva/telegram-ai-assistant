@echo off
echo Инициализация Git репозитория...
git init

echo Добавление файлов...
git add .

echo Создание первого коммита...
git commit -m "Initial commit"

echo Переименование ветки в main...
git branch -M main

echo Добавление удаленного репозитория...
git remote add origin https://github.com/IrinaShafeeva/telegram-ai-assistant.git

echo Загрузка в GitHub...
git push -u origin main

echo Готово! Проект загружен в GitHub.
pause 