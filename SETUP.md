# 🚀 Настройка Expense Tracker Bot

## 📋 Быстрая настройка

### 1. Переменные окружения (.env)

```bash
# Telegram Bot
BOT_TOKEN=8450163657:AAG0c4YmaZga83Iye6ymxWt5syMfgjMvYvs

# OpenAI (для AI-парсинга и аналитики)
OPENAI_API_KEY=your_openai_api_key

# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Google Sheets (ОБЯЗАТЕЛЬНО для работы с таблицами)
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_service_account_private_key

# App Settings
NODE_ENV=production
PORT=3000
```

### 2. Настройка Google Sheets API

#### Шаг 1: Создание проекта в Google Cloud Console
1. Перейдите в [Google Cloud Console](https://console.cloud.google.com)
2. Создайте новый проект или выберите существующий
3. Включите Google Sheets API и Google Drive API

#### Шаг 2: Создание Service Account
1. В меню слева выберите "APIs & Services" → "Credentials"
2. Нажмите "Create Credentials" → "Service Account"
3. Заполните форму:
   - Name: `expense-tracker-bot`
   - Description: `Service account for Expense Tracker Bot`
4. Нажмите "Create and Continue"
5. Пропустите шаги 2 и 3, нажмите "Done"

#### Шаг 3: Получение ключей
1. В списке Service Accounts найдите созданный аккаунт
2. Нажмите на email аккаунта
3. Перейдите на вкладку "Keys"
4. Нажмите "Add Key" → "Create new key"
5. Выберите "JSON" и скачайте файл

#### Шаг 4: Настройка переменных окружения
Из скачанного JSON файла возьмите:
- `client_email` → `GOOGLE_CLIENT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY` (сохраните как есть, с переносами строк)

### 3. Настройка базы данных Supabase

Выполните SQL скрипт `supabase-tables.sql` в вашем Supabase проекте.

### 4. Запуск бота

```bash
npm install
npm start
```

## 📊 Как работает Google Sheets интеграция

### Для пользователей:

1. **Создание таблиц пользователем** - пользователь создает таблицу в своем Google аккаунте
2. **Подключение к боту** - пользователь подключает таблицу командой `/connect [ID_таблицы]`
3. **Полный контроль** - таблица полностью принадлежит пользователю и всегда доступна для редактирования
4. **Двусторонняя синхронизация**:
   - Расходы из бота → автоматически в таблицу
   - Расходы из таблицы → импорт командой `/sync`

### Структура таблицы:
- **A**: Дата (DD.MM.YYYY)
- **B**: Описание расхода
- **C**: Сумма
- **D**: Валюта
- **E**: Категория
- **F**: Автор (username)
- **G**: Источник (bot/manual)

### Команды для пользователей:
- `/connect [ID_таблицы]` - подключить существующую Google таблицу
- `/sync` - импортировать записи из Google Sheets в бот

### Как подключить таблицу:
1. Создайте новую таблицу в Google Sheets
2. Скопируйте ID таблицы из ссылки (часть после /d/)
3. Используйте команду: `/connect 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`
4. Или просто вставьте полную ссылку: `/connect https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit`

## 🔧 Устранение проблем

### Google Sheets не работает:
1. Проверьте переменные `GOOGLE_CLIENT_EMAIL` и `GOOGLE_PRIVATE_KEY`
2. Убедитесь, что включены Google Sheets API и Google Drive API
3. Проверьте логи бота на ошибки

### Пользователи не могут редактировать таблицы:
1. Убедитесь, что Google Drive API включен
2. Проверьте, что Service Account имеет права на создание и шаринг файлов
3. Пользователь должен использовать команду `/email` для получения доступа

## 📈 Лимиты

- **FREE план**: 1 синхронизация/день
- **PRO план**: 10 синхронизаций/день

## 🎯 Готово!

После настройки пользователи смогут:
1. Создавать таблицы в своем Google аккаунте
2. Подключать таблицы к боту командой `/connect`
3. Полностью контролировать свои таблицы
4. Синхронизировать данные между ботом и таблицами
5. Работать с таблицами как с обычными Google Sheets
