@echo off
echo Установка Vercel CLI...
npm install -g vercel

echo Деплой на Vercel...
vercel --prod

echo Готово! Проект задеплоен на Vercel.
pause 