@echo off
echo Фиксация ESLint ошибок...
git add .
git commit -m "Fix ESLint warnings - remove unused imports"
git push

echo Передеплой на Vercel...
vercel --prod
pause 