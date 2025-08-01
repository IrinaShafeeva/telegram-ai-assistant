# 🚀 Быстрый запуск Telegram AI Assistant

## 📋 Текущее состояние проекта

✅ **Готово:**
- Базовый Telegram бот с AI классификацией
- Интеграция с OpenAI для обработки сообщений
- Веб-интерфейс для управления данными
- Поддержка Supabase, Google Sheets, Notion
- Система выбора интеграций пользователями

🔄 **В процессе:**
- Настройка переменных окружения
- Тестирование интеграций

## 📋 Предварительные требования

- Node.js 18+ 
- npm или yarn
- Telegram Bot Token
- OpenAI API Key
- Supabase проект (опционально)

## ⚡ Быстрый старт (5 минут)

### 1. Клонирование и установка

```bash
git clone <repository-url>
cd telegram-ai-assistant
npm install
cd frontend && npm install
cd ..
```

### 2. Настройка переменных окружения

Создайте файл `.env` одним из способов:

**Способ 1:** Скопируйте `env.example` в `.env`:
```bash
cp env.example .env
```

**Способ 2:** Создайте файл `.env` вручную и скопируйте содержимое из `env_template.txt`

**Способ 3:** Создайте файл `.env` и заполните минимальные настройки:

```bash
# Обязательные
TELEGRAM_BOT_TOKEN=your_bot_token_here
OPENAI_API_KEY=your_openai_key_here

# Опциональные интеграции (пользователи выбирают куда отправлять)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account_email
GOOGLE_SHEETS_PRIVATE_KEY=your_private_key
NOTION_API_KEY=your_notion_key
```

### 3. Запуск в режиме разработки

```bash
# Backend
npm run dev

# Frontend (в новом терминале)
cd frontend
npm start
```

### 4. Тестирование

Откройте `http://localhost:3000/test-api.html` для тестирования API.

## 🤖 Настройка Telegram Bot

1. Найдите @BotFather в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен в `.env`

## 🧠 Настройка OpenAI

1. Зарегистрируйтесь на [OpenAI](https://platform.openai.com)
2. Создайте API ключ
3. Добавьте в `.env`

## 📊 Настройка интеграций (опционально)

### Supabase
1. Создайте проект на [Supabase](https://supabase.com)
2. Выполните SQL из `supabase-schema.sql`
3. Скопируйте URL и ключи в `.env`

### Google Sheets
1. Создайте Service Account в Google Cloud Console
2. Скачайте JSON ключ и добавьте данные в `.env`
3. Поделитесь таблицей с email из `GOOGLE_SHEETS_CLIENT_EMAIL`

### Notion
1. Создайте интеграцию на [Notion Developers](https://developers.notion.com)
2. Добавьте API ключ в `.env`
3. Поделитесь базой данных с интеграцией

**Важно:** Пользователи могут выбирать, куда отправлять данные через веб-интерфейс или команды бота.

## 🔧 Команды для разработки

```bash
# Запуск backend
npm run dev

# Запуск frontend
cd frontend && npm start

# Сборка для продакшна
cd frontend && npm run build

# Тестирование API
open http://localhost:3000/test-api.html
```

## 📱 Тестирование бота

1. Найдите вашего бота в Telegram
2. Отправьте `/start`
3. Попробуйте сообщения:
   - "Потратил 500 на продукты"
   - "Саша - подготовить доклад"
   - "Идея для проекта"

## ⚙️ Управление интеграциями

Пользователи могут выбирать, куда отправлять данные:

### Через веб-интерфейс
1. Откройте `http://localhost:3000`
2. Перейдите в раздел "Настройки"
3. Выберите активные интеграции

### Через команды бота
- `/settings` - открыть настройки
- `/integrations` - управление интеграциями
- `/export` - экспорт данных в выбранную систему

## 🚀 Развертывание

### Vercel
```bash
npm install -g vercel
vercel --prod
```

### Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod
```

### Docker
```bash
docker build -t telegram-ai-assistant .
docker run -p 3000:3000 telegram-ai-assistant
```

## 🔍 Отладка

### Проверка логов
```bash
# Backend логи
npm run dev

# Проверка переменных окружения
node -e "console.log(require('dotenv').config())"
```

### Тестирование API
```bash
# Проверка здоровья сервера
curl http://localhost:3000/health

# Тест добавления записи
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"type":"transaction","project":"Family","description":"тест","amount":"-100"}'
```

## 🆘 Частые проблемы

### Ошибка "Bot not found"
- Проверьте правильность TELEGRAM_BOT_TOKEN
- Убедитесь, что бот создан через @BotFather

### Ошибка "OpenAI API error"
- Проверьте правильность OPENAI_API_KEY
- Убедитесь в наличии средств на счете OpenAI

### Ошибка "Database connection failed"
- Проверьте настройки Supabase
- Убедитесь в выполнении SQL схемы

### Frontend не загружается
- Проверьте, что frontend собран: `cd frontend && npm run build`
- Убедитесь в правильности путей в конфигурации

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи сервера
2. Убедитесь в правильности всех переменных окружения
3. Проверьте подключение к интернету
4. Создайте Issue в репозитории

## 🎯 Следующие шаги

После успешного запуска:
1. Настройте webhook для бота
2. Добавьте интеграции с Google Sheets/Notion
3. Настройте уведомления
4. Кастомизируйте AI промпты под ваши нужды 