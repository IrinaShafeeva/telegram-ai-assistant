# 👥 Настройка команды для Google Calendar и Telegram уведомлений

## 📋 Обзор возможностей

Система поддерживает:
- ✅ **Google Calendar интеграцию** - создание напоминаний в календарях участников команды
- ✅ **Telegram уведомления** - отправка уведомлений участникам и подтверждений отправителю
- ✅ **Умную обработку** - автоматическое распознавание команд типа "Напомнить Ире о встрече завтра в 15:00"
- ✅ **Базу данных** - хранение информации об участниках команды и их настройках

## 🚀 Быстрая настройка

### 1. Подготовка базы данных

```bash
# Примените схему в Supabase Dashboard
# Скопируйте содержимое supabase-schema.sql в SQL Editor
```

### 2. Запуск настройки команды

```bash
npm run setup:team
```

Скрипт соберет:
- 👤 Имена участников команды
- 🏷️ Псевдонимы для распознавания
- 📱 Telegram Chat ID
- 📅 Google Calendar Email и ID

### 3. Настройка Google API

Создайте `google-credentials.json` в корне проекта:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "ai-assistant@your-project.iam.gserviceaccount.com",
  "client_id": "client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/ai-assistant%40your-project.iam.gserviceaccount.com"
}
```

## 📱 Получение Telegram Chat ID

### Метод 1: Через бота @userinfobot
1. Найдите @userinfobot в Telegram
2. Отправьте любое сообщение
3. Бот вернет ваш Chat ID

### Метод 2: Через @RawDataBot
1. Найдите @RawDataBot
2. Отправьте сообщение
3. В ответе найдите `"id": 123456789`

### Метод 3: Программно
```javascript
// В консоли браузера на telegram.org
// Отправьте сообщение боту и выполните:
window.Telegram.WebApp.initDataUnsafe.user.id
```

## 📅 Настройка Google Calendar

### 1. Создание Service Account
1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите Google Calendar API
4. Создайте Service Account
5. Скачайте JSON ключ

### 2. Предоставление доступа к календарю
1. Откройте настройки календаря участника
2. В разделе "Доступ для определенных людей"
3. Добавьте email из `client_email` в JSON ключе
4. Установите права "Вносить изменения в события"

### 3. Получение Calendar ID
- **Основной календарь**: `primary`
- **Другой календарь**: в настройках календаря найдите "Calendar ID"

## 🔧 Детальная настройка

### Структура базы данных

```sql
-- Участники команды
CREATE TABLE team_members (
    id UUID PRIMARY KEY,
    tenant_id UUID,
    display_name TEXT NOT NULL,
    aliases TEXT[], -- псевдонимы
    tg_chat_id TEXT, -- Telegram Chat ID
    gcal_connection_id UUID, -- связь с Google Calendar
    meta JSONB -- дополнительные настройки
);

-- Подключения к внешним сервисам
CREATE TABLE connections (
    id UUID PRIMARY KEY,
    tenant_id UUID,
    provider TEXT, -- 'google'
    secret_ref TEXT, -- ссылка на credentials
    scopes TEXT[], -- разрешения
    meta JSONB -- настройки календаря
);

-- Маршруты уведомлений
CREATE TABLE routes (
    id UUID PRIMARY KEY,
    tenant_id UUID,
    name TEXT,
    match JSONB, -- условия срабатывания
    action JSONB -- действия (коннекторы)
);
```

### Примеры команд

```bash
# Напоминания для команды
"Напомнить Ире о встрече завтра в 15:00"
"Напомнить Маше купить продукты завтра"
"Напомнить Ване позвонить в банк сегодня в 18:00"

# Задачи для команды
"Задача для Иры: сделай бота"
"Попроси Ваню позвонить в банк"
"Поручи Маше купить продукты"
```

## 🧪 Тестирование

### 1. Проверка базы данных
```bash
# Проверьте, что участники созданы
npm run setup:team
```

### 2. Тест напоминаний
```
Пользователь: "Напомнить Ире о встрече завтра в 15:00"
Бот должен: 
✅ Найти Иру в базе данных
✅ Создать событие в Google Calendar
✅ Отправить уведомление в Telegram
✅ Записать в Google Sheets
```

### 3. Проверка логов
```bash
npm run dev
# Следите за логами в консоли
```

## ❌ Частые проблемы

### "Google Calendar API недоступен"
- ✅ Проверьте `google-credentials.json`
- ✅ Убедитесь, что Google Calendar API включен
- ✅ Проверьте права доступа к календарю

### "Участник команды не найден"
- ✅ Запустите `npm run setup:team`
- ✅ Проверьте правильность имени
- ✅ Убедитесь, что псевдонимы настроены

### "Telegram уведомления не отправляются"
- ✅ Проверьте `TELEGRAM_BOT_TOKEN`
- ✅ Убедитесь, что Chat ID корректный
- ✅ Проверьте, что бот не заблокирован

## 🔄 Обновление настроек

### Добавление нового участника
```bash
npm run setup:team
# Выберите "Добавить участника"
```

### Изменение настроек
```sql
-- Обновить Google Calendar ID
UPDATE team_members 
SET meta = jsonb_set(meta, '{gcal_id}', '"new-calendar-id"')
WHERE display_name = 'Имя участника';

-- Обновить Telegram Chat ID
UPDATE team_members 
SET tg_chat_id = 'new-chat-id'
WHERE display_name = 'Имя участника';
```

## 📊 Мониторинг

### Логи системы
```bash
# Запуск с подробными логами
DEBUG=* npm run dev
```

### Проверка статуса
```bash
# Проверка подключений
curl http://localhost:3000/api/health

# Проверка базы данных
curl http://localhost:3000/api/records?tenant_id=YOUR_TENANT_ID
```

## 🎯 Следующие шаги

После настройки команды:
1. 🧪 Протестируйте напоминания
2. 📊 Настройте Google Sheets для логирования
3. 🔔 Настройте дополнительные уведомления
4. 🚀 Интегрируйте с другими сервисами

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи в консоли
2. Убедитесь, что все API ключи корректны
3. Проверьте права доступа в Google Calendar
4. Убедитесь, что база данных настроена правильно

---

**Успешной настройки команды! 🎉**
