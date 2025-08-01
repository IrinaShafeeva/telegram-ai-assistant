@echo off
echo Фиксация изменений...
git add .
git commit -m "Fix Settings import conflict"
git push

echo Передеплой на Vercel...
vercel --prod
pause 