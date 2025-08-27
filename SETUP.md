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
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"ai-assistant-sheets","private_key_id":"1dec1a0b1d69ada650622acf6284e490a38de84f","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCy40759u+4c2vq\nv1sxUwcDby/uvQMJAnBTPKgNYpnp47Dl064kCedxNyzxa7cmiWXgTOjuf3Fk1khL\nyJRSHEviQK+S3jsHmHhlBnleyV7UpzjBvwuUaUc51J8m+SeWzfbnSb2dHLtKY2L9\naHj9Ajbj0CaQUZU6cDY5PVDkaWg+IqLBQrvvf4Jj2p1JXaly7eXhr4w9DrVpMhGe\nvwke0RP1+BXOUEGJ8By62Z8R4X1f4qEFtPF4kejWHQV4WU4ULzCpEDah1XPxkKsv\ntwnVEAchn78MnHii0XA/GUWNvcyQscvrI6HSvOkzyMH7dvTKlUXvbFKwc92gtr0C\nq8HqyY07AgMBAAECggEAA8l+bfVuola860bBzlTxXH73PfRZR4eMi3+2YVtOK2xI\n3d3bFDXzwGHWFAZWCkY+X5plyt2jQg8+IbgENPjNhwgcHSa3QljDapb2NkARrU7T\n1MY0VkSSBE5C4pKfL12M4293pCvZ1FcK3yld5li+zCq5pkbKux1pmr7mIu/GDAqr\nKnrcKLzG9RTv5SRdjQsnJwFZvpS4MHGp7aTcuH9SmTYWJ/+B/SJ3k3tDwlwku6oe\n0VOEvhkVzcwKIeiHaJm85YkuTiojPOHrWqK8WX3dsUtVvGfJfB49iTocaISsl3a5\n32Ap9CgFaDPF1A6mXBiiAR75t0ajehEnY1ymzozYgQKBgQDjQebSzD8e1jPVT1Jb\nlwKoRjHxRAQzrtQ8LueYVXcDFSVovUNbE7r7/WmKVr/yM8fIAkjXlyxuDNllpBkI\nNc+cv32PqMRmXwPbNjTbAvMAsWqPrKjUh7aZzRCSR3IVU5UO5p4EhftaquZnq/Ke\nbFstALtJUgfjBF2KDXus7z+7zQKBgQDJg07gdfOv99h47/rH588NjUTz+VMQK0N1\naA0y2vOkmg3WVFQFBndQ/JjraphuvWWr4hhRrKg9NOQcn3alZYrYyoHqyLHmveHA\nKYSwkjtUnccTzGA1Tz2/jv0d6bvNCeP6T22KXhrjr62TfRUu2ZAP9oYgrTkShSQ2\nV42FNXy1JwKBgQCXuckNFhZSVTq4AMSAp9q7VFpFtV6EzwWdxMcU+oKByV13h1zv\n8sVVNkR/exmd8BpDG9tcLO8Z7nQ6mwunYp3hDiwbfNbbbjZZ5d/2FQr+fHUjxWfW\ntWEhYDrfHto5CNus3iXD6Vv+lblMoA1U3g0lh6aC9kSTubdl00iuFfHcRQKBgQC2\n6EbKGoYMbSzB6SF6HgCkTlwOD3rDrGFYyg9g37hS6boxlu2EejAHBKBQ3rppmeQV\nNe3ZBJzYoY+EI4Hv8tEqofV2hKBlzmiAoa7dDn5n+aZfZBzXhouHumQpqKRcIeQa\nqcnF1FEX5bfprZlyouvOcXehZVnuY4dRA/tis//z9QKBgQDG4R5YkO4lCMIrYl+l\nq72WzjltGjeDiPs5bkNJcrg8iB/RrFbu4whTOPVwEJE+nlLXQIhrhmvc1G9E2TlC\nC1i8ksaytpI9lBAwnpqvdmAbnTqU5lGWZFdrxJ2WzduClnyTS8npbtd/x1YlMBsV\nI6fTZfTlefq5vLuZmzh2yAIWxQ==\n-----END PRIVATE KEY-----\n","client_email":"ai-assistant-bot-270@ai-assistant-sheets.iam.gserviceaccount.com","client_id":"106923129060449156363","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/ai-assistant-bot-270%40ai-assistant-sheets.iam.gserviceaccount.com","universe_domain":"googleapis.com"}

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
