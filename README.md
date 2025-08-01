# Telegram AI Assistant - BLG Family Assistant

Полнофункциональный Telegram AI ассистент для управления задачами, расходами и идеями семьи с интеграцией Google Sheets, Notion и Supabase.

## 🚀 Возможности

- **AI классификация сообщений** - автоматическое распознавание транзакций, задач, идей и напоминаний
- **Голосовые сообщения** - поддержка Whisper API для транскрипции
- **Мультиплатформенное хранение** - Google Sheets, Notion, Supabase
- **Telegram WebApp** - современный React интерфейс
- **Аналитика** - детальная статистика по проектам и периодам
- **Напоминания** - автоматические уведомления о задачах
- **Повторяющиеся задачи** - ежедневные, еженедельные, ежемесячные

## 📦 Архитектура

- **Backend**: Node.js + Express
- **Frontend**: React + Telegram WebApp
- **AI**: OpenAI GPT-3.5-turbo + Whisper
- **База данных**: Supabase (PostgreSQL)
- **Хранение**: Google Sheets, Notion
- **Бот**: Telegram Bot API

## 🛠 Установка

### 1. Клонирование и установка зависимостей

```bash
git clone <repository-url>
cd telegram-ai-assistant
npm install
cd frontend
npm install
```

### 2. Настройка переменных окружения

Скопируйте `env.example` в `.env` и заполните:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Google Sheets Configuration
GOOGLE_SHEETS_CLIENT_EMAIL=your_service_account_email@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY=your_private_key_here
GOOGLE_SHEETS_SPREADSHEET_ID=your_default_spreadsheet_id_here

# Notion Configuration
NOTION_API_KEY=your_notion_api_key_here
NOTION_DATABASE_ID=your_default_notion_database_id_here

# Server Configuration
PORT=3000
NODE_ENV=development
```

### 3. Настройка базы данных

Выполните SQL скрипт `supabase-schema.sql` в вашей Supabase базе данных.

### 4. Настройка Telegram Bot

1. Создайте бота через @BotFather
2. Получите токен и добавьте в `.env`
3. Настройте webhook: `https://your-domain.com/webhook`

### 5. Настройка Google Sheets

1. Создайте Service Account в Google Cloud Console
2. Скачайте JSON ключ
3. Добавьте email и private key в `.env`
4. Создайте Google Sheets и поделитесь с service account email

### 6. Настройка Notion (опционально)

1. Создайте интеграцию в Notion
2. Получите API ключ
3. Создайте базы данных для задач и идей
4. Добавьте ID баз данных в `.env`

## 🚀 Запуск

### Разработка

```bash
# Backend
npm run dev

# Frontend (в отдельном терминале)
cd frontend
npm start
```

### Продакшн

```bash
# Сборка фронтенда
cd frontend
npm run build

# Запуск сервера
npm start
```

## 📱 Использование

### Telegram Bot

1. Найдите вашего бота в Telegram
2. Отправьте `/start` для начала работы
3. Отправляйте сообщения:
   - "Потратил 500 на продукты" → транзакция
   - "Саша - подготовить доклад" → задача
   - "Идея для проекта" → идея
   - "Напомни через 2 часа забрать посылку" → напоминание

### WebApp

1. Откройте бота в Telegram
2. Нажмите кнопку "Открыть приложение"
3. Используйте веб-интерфейс для:
   - Просмотра статистики
   - Добавления записей
   - Настройки параметров

## 🧠 AI Классификация

Система автоматически классифицирует сообщения:

### Транзакции
- Ключевые слова: потратил, оплатил, купил, получил, доход
- Формат: "Потратил 500 на продукты" → `{type: "transaction", amount: "-500", description: "продукты"}`

### Задачи
- Ключевые слова: задача, сделать, подготовить
- Формат: "Саша - подготовить доклад" → `{type: "task", person: "Саша", description: "подготовить доклад"}`

### Идеи
- Ключевые слова: идея, думаю, можно
- Формат: "Идея для проекта" → `{type: "idea", description: "Идея для проекта"}`

### Напоминания
- Ключевые слова: напомни, через
- Формат: "Напомни через 2 часа забрать посылку" → `{type: "reminder", remindAt: "2025-08-01T17:45:00+02:00"}`

## 📊 Проекты

Поддерживаемые проекты:
- **GO** - основной проект
- **Glamping** - глэмпинг проект
- **Family** - семейные дела
- **Cars** - автомобильные расходы

## 🔔 Уведомления

Система отправляет уведомления:
- При создании записей
- Ежедневно в 7:00, 13:00, 19:00 (время Албании)
- Для повторяющихся задач

## 📈 Аналитика

Доступные отчеты:
- Расходы по проектам
- Статистика задач
- Доходы/расходы по периодам
- Активность пользователей

## 🔧 API Endpoints

### Основные
- `POST /webhook` - Telegram webhook
- `POST /api/submit` - Добавление записи
- `GET /api/analytics` - Получение аналитики
- `GET /api/recent` - Последние записи

### Настройки
- `GET /api/settings` - Получение настроек
- `POST /api/settings` - Сохранение настроек

## 🛡 Безопасность

- Валидация Telegram WebApp данных
- Проверка подписи Telegram
- Защита от SQL инъекций
- Rate limiting для API

## 📝 Логирование

Система ведет логи:
- Обработка сообщений
- Ошибки AI классификации
- Сохранение данных
- Уведомления

## 🔄 Развертывание

### Vercel
```bash
vercel --prod
```

### Netlify
```bash
netlify deploy --prod
```

### Docker
```bash
docker build -t telegram-ai-assistant .
docker run -p 3000:3000 telegram-ai-assistant
```

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch
3. Внесите изменения
4. Создайте Pull Request

## 📄 Лицензия

MIT License

## 🆘 Поддержка

При возникновении проблем:
1. Проверьте логи сервера
2. Убедитесь в правильности настроек
3. Проверьте подключение к внешним сервисам
4. Создайте Issue в репозитории

## 🔮 Планы развития

- [ ] Поддержка других языков
- [ ] Интеграция с календарем
- [ ] Экспорт данных
- [ ] Мобильное приложение
- [ ] Расширенная аналитика
- [ ] Интеграция с банковскими API 