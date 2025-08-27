# 🚀 Деплой на DigitalOcean

## 📋 Пошаговая инструкция

### 1. Создание Droplet

1. Зайдите в [DigitalOcean Dashboard](https://cloud.digitalocean.com)
2. Нажмите "Create" → "Droplets"
3. Выберите:
   - **Image**: Ubuntu 22.04 LTS
   - **Size**: Basic → $6/month (1GB RAM, 1 CPU)
   - **Datacenter**: Выберите ближайший к вам
   - **Authentication**: SSH Key (рекомендуется) или Password
4. Нажмите "Create Droplet"

### 2. Подключение к серверу

```bash
# Через SSH (замените IP на ваш)
ssh root@YOUR_SERVER_IP

# Или через DigitalOcean Console
```

### 3. Запуск скрипта настройки

```bash
# Скачайте скрипт
wget https://raw.githubusercontent.com/IrinaShafeeva/telegram-ai-assistant/main/deploy-digitalocean.sh

# Сделайте исполняемым
chmod +x deploy-digitalocean.sh

# Запустите
./deploy-digitalocean.sh
```

### 4. Настройка переменных окружения

После запуска скрипта отредактируйте `.env` файл:

```bash
nano /var/www/expense-tracker-bot/.env
```

Замените значения на ваши:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` 
- `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY` (если есть)

### 5. Перезапуск бота

```bash
# Перезапустите бота
pm2 restart expense-tracker-bot

# Проверьте статус
pm2 status

# Посмотрите логи
pm2 logs expense-tracker-bot
```

## 🔧 Управление ботом

### Команды PM2:
```bash
# Статус
pm2 status

# Логи
pm2 logs expense-tracker-bot

# Перезапуск
pm2 restart expense-tracker-bot

# Остановка
pm2 stop expense-tracker-bot

# Запуск
pm2 start expense-tracker-bot
```

### Обновление кода:
```bash
cd /var/www/expense-tracker-bot
git pull
npm install --production
pm2 restart expense-tracker-bot
```

## 🌐 Настройка домена (опционально)

1. Купите домен (например, на Namecheap)
2. Настройте DNS на ваш IP сервера
3. Отредактируйте Nginx конфиг:
```bash
nano /etc/nginx/sites-available/expense-tracker-bot
```
4. Замените `your-domain.com` на ваш домен
5. Перезапустите Nginx:
```bash
sudo systemctl restart nginx
```

## 🔒 SSL сертификат (опционально)

```bash
# Установите Certbot
sudo apt install certbot python3-certbot-nginx

# Получите сертификат
sudo certbot --nginx -d your-domain.com
```

## 💰 Стоимость

- **Droplet**: $6/месяц (1GB RAM, 1 CPU)
- **Домен**: ~$10/год (опционально)
- **Итого**: ~$6-7/месяц

## ✅ Преимущества DigitalOcean

- ✅ **Полный контроль** над сервером
- ✅ **Стабильная работа** 24/7
- ✅ **Простое масштабирование**
- ✅ **Низкая стоимость**
- ✅ **Надежность**

## 🚨 Мониторинг

```bash
# Проверка использования ресурсов
htop

# Проверка диска
df -h

# Проверка памяти
free -h

# Проверка логов
tail -f /var/log/nginx/access.log
```
