# 🤖 AI Assistant v2.0 - Modern Architecture

Современный AI-ассистент с масштабируемой архитектурой, построенный на принципах сервис-ориентированного дизайна.

## 🚀 Возможности

- **AI-обработка сообщений** - автоматическое распознавание и классификация
- **Голосовые сообщения** - поддержка Whisper API для транскрипции
- **Модульная архитектура** - легко расширяемые сервисы и коннекторы
- **Маршрутизация данных** - гибкая система доставки уведомлений
- **Мультиплатформенность** - поддержка Vercel, Netlify, DigitalOcean
- **Telegram Bot API** - удобный интерфейс через мессенджер

## 🏗 Архитектура

```
src/
├── app.js              # Основное приложение
├── config/
│   └── database.js     # Конфигурация Supabase
├── connectors/         # Интеграции с внешними сервисами
│   ├── telegram.js     # Telegram Bot API
│   └── google.js       # Google Sheets & Calendar
├── services/           # Бизнес-логика
│   └── routing.js      # Система маршрутизации
└── tools/              # AI инструменты
    └── index.js        # Доступные функции
```

## 🛠 Технологии

- **Backend**: Node.js + Express
- **AI**: OpenAI GPT-3.5-turbo + Whisper
- **База данных**: Supabase (PostgreSQL)
- **Интеграции**: Google Sheets, Google Calendar
- **Деплой**: Vercel, Netlify, DigitalOcean

## 📦 Установка

### 1. Клонирование и зависимости

```bash
git clone <repository-url>
cd ai-assist
npm install
```

### 2. Переменные окружения

Создайте `.env` файл:

```bash
# Обязательные
TELEGRAM_BOT_TOKEN=your_bot_token_here
OPENAI_API_KEY=your_openai_key_here

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# Google (опционально)
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account_email
GOOGLE_SHEETS_PRIVATE_KEY=your_private_key

# Сервер
PORT=3000
NODE_ENV=development
```

### 3. Настройка базы данных

Выполните SQL скрипт `supabase-schema.sql` в Supabase Dashboard.

### 4. Запуск

```bash
# Разработка
npm run dev

# Продакшн
npm start
```

### 5. Настройка команды (опционально)

```bash
# Настройка участников команды для Google Calendar и Telegram
npm run setup:team
```

📖 **Подробная инструкция**: [TEAM_SETUP_README.md](./TEAM_SETUP_README.md)

## 🚀 Деплой

### Vercel
```bash
vercel --prod
```

### Netlify
```bash
netlify deploy --prod
```

### DigitalOcean
```bash
# Используйте Dockerfile или app.yaml
```

## 📱 Использование

### Основные команды

- `/start` - Запуск и настройка
- `/setup` - Настройка интеграций
- `/team` - Управление командой
- `/help` - Справка по командам
- `/search` - Поиск по записям

### Командные функции

- **Напоминания**: "Напомнить Ире о встрече завтра в 15:00"
- **Задачи**: "Задача для Маши: купить продукты"
- **Автоуведомления**: в Google Calendar + Telegram

### Примеры использования

```
Пользователь: "Потратил 5000 на продукты"
Бот: "💰 Расход сохранен: Продукты (-5000 RUB)"

Пользователь: "Задача для Ивана: позвонить в банк"
Бот: "📋 Задача создана: Позвонить в банк (Иван)"

Пользователь: "Сохрани https://example.com"
Бот: "🔖 Закладка сохранена: example.com"
```

## 🔧 API Endpoints

- `POST /webhook` - Telegram webhook
- `GET /api/records` - Получение записей
- `GET /api/search` - Поиск по записям
- `GET /` - Проверка состояния

## 📊 Структура данных

### Записи (Records)
- **expense** - Расходы и доходы
- **task** - Задачи и напоминания
- **bookmark** - Закладки и ссылки

### Маршрутизация
- Автоматическая доставка в Telegram
- Интеграция с Google Sheets
- Гибкие правила маршрутизации

## 🤝 Разработка

### Добавление нового коннектора

1. Создайте файл в `src/connectors/`
2. Реализуйте интерфейс коннектора
3. Зарегистрируйте в `app.js`

### Добавление нового инструмента

1. Добавьте функцию в `src/tools/index.js`
2. Обновите системный промпт в `app.js`

## 📝 Лицензия

MIT License 