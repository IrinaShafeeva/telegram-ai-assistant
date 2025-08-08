const express = require('express');
const cors = require('cors');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://bespoke-platypus-5c4604.netlify.app',
        'https://blg-miniapp-backend.onrender.com',
        'http://localhost:3000',
        'http://localhost:3001'
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const GOOGLE_SHEETS_CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const GOOGLE_SHEETS_PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
// Notion removed - focusing on Supabase and Google Sheets only

// Initialize clients
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Google Sheets setup (optional)
let auth, sheets;
if (GOOGLE_SHEETS_CLIENT_EMAIL && GOOGLE_SHEETS_PRIVATE_KEY) {
    auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: GOOGLE_SHEETS_CLIENT_EMAIL,
            private_key: GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n')
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
}

// AI Classification System
class AIClassifier {
    constructor() {
        this.systemPrompt = `Ты — семейный цифровой помощник. Твоя задача — помогать в повседневных делах: записывать важное, находить нужное, напоминать, вести учёт и просто быть рядом, когда хочется поговорить.

Если сообщение не содержит чёткой команды — не пытайся классифицировать его. Не дави. Просто ответь по-человечески, поддержи диалог.

Не навязывай идею о сохранении. Если пользователь захочет — он сам даст понять.

🧠 У тебя есть память. Если пользователь хочет что-то записать — сохрани. Если хочет вспомнить — найди. Если хочет просто поболтать — поддержи.

---

📌 Твоя основная задача — распознавать, когда сообщение пользователя нужно **сохранить** как запись. Это может быть:

- транзакция (расход или доход),
- задача,
- идея,
- напоминание.

Если сообщение **однозначно** относится к одной из этих категорий — верни **ТОЛЬКО JSON-объект** по примеру ниже:

\`\`\`json
{
  "type": "transaction" | "task" | "idea" | "reminder",
  "project": "string", // пользователь сам придумывает название проекта
  "amount": string, // для транзакций: "+5000" или "-3000"
  "money_source": string, // для транзакций: "Карта", "Наличные", "Зарплата"
  "description": string,
  "date": string, // YYYY-MM-DD
  "person": string, // для задач: кто ответственный
  "status": string, // для задач: "Новая", "В работе", "Сделано", "Отменена"
  "priority": string, // для задач: "Низкий", "Средний", "Высокий", "Критический"
  "telegramChatId": string,
  "repeatType": string, // для задач: "ежедневно", "еженедельно", "ежемесячно"
  "repeatUntil": string, // YYYY-MM-DD
  "remindAt": string, // для напоминаний: ISO timestamp
  "link": string, // для идей: URL ссылка
  "file": string  // для идей: название файла
}
\`\`\`

⚠️ Никогда не мешай JSON и обычный текст.
✅ Либо возвращай только JSON, либо обычный ответ (без JSON).

Если команда неясная или данных не хватает — **всё равно верни JSON хотя бы с полем telegramChatId**, чтобы сохранить его и использовать при следующем ответе пользователя.

Если команды нет — не возвращай JSON, просто поговори по-человечески.

---

📊 Структура данных:
- Транзакции: Дата | Сумма | Откуда деньги | Описание | Проект
- Задачи: Дата | Описание | Ответственный | Статус | Приоритет | Проект  
- Идеи: Описание | Ссылка | Файл | Проект
`;
        this.chatMap = new Map();
        this.userStates = new Map();
    }

    async classifyMessage(message, telegramChatId) {
        try {
            const today = new Date().toISOString().slice(0, 10);
            
            const prompt = `${this.systemPrompt}

Сообщение: ${message}
Дата: ${today}
Telegram Chat ID: ${telegramChatId}`;

            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: this.systemPrompt },
                    { role: "user", content: `Сообщение: ${message}\nДата: ${today}\nTelegram Chat ID: ${telegramChatId}` }
                ],
                temperature: 0.7,
                max_tokens: 1000
            });

            const response = completion.choices[0].message.content.trim();
            
            // Check if response is JSON
            if (response.startsWith('{') && response.endsWith('}')) {
                try {
                    const parsed = JSON.parse(response);
                    return this.processParsedData(parsed, telegramChatId);
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                    return { type: 'text', content: response };
                }
            } else {
                return { type: 'text', content: response };
            }
        } catch (error) {
            console.error('AI Classification error:', error);
            return { type: 'text', content: 'Извините, произошла ошибка при обработке сообщения.' };
        }
    }

    processParsedData(parsed, telegramChatId) {
        // Set telegramChatId if not present
        if (!parsed.telegramChatId) {
            parsed.telegramChatId = telegramChatId;
        }

        // Set date if not present
        if (!parsed.date) {
            parsed.date = new Date().toISOString().slice(0, 10);
        }

        // Process person mapping for tasks
        if (parsed.type === "task" && parsed.person) {
            if (this.chatMap.has(parsed.person)) {
                parsed.telegramChatId = this.chatMap.get(parsed.person);
            }
        }

        // Process repeatType for tasks
        if (parsed.type === "task" && parsed.description) {
            const description = parsed.description.toLowerCase();
            
            if (/ежедневно|каждый день|до \d+ числа/.test(description)) {
                parsed.repeatType = "ежедневно";
            } else if (/еженедельно|каждую неделю|по \w+ам/.test(description)) {
                parsed.repeatType = "еженедельно";
            } else if (/ежемесячно|каждый месяц/.test(description)) {
                parsed.repeatType = "ежемесячно";
            }

            const untilDateMatch = description.match(/до (\d+) числа/);
            if (untilDateMatch) {
                parsed.repeatType = "ежедневно";
                parsed.repeatUntil = `2025-07-${untilDateMatch[1].padStart(2, '0')}`;
            }
        }

        // Process reminders
        if (parsed.type === "reminder" && parsed.description) {
            const remindMatch = parsed.description.match(/через (\d+) (час|часа|часов)/);
            if (remindMatch) {
                const hours = parseInt(remindMatch[1]);
                const remindAt = new Date();
                remindAt.setHours(remindAt.getHours() + hours);
                parsed.remindAt = remindAt.toISOString();
            }
        }

        return { type: 'data', data: parsed };
    }
}

// Notification Service for collaboration
class NotificationService {
    constructor() {
        this.bot = bot;
    }

    async sendTransactionNotification(data) {
        try {
            const settings = await this.getNotificationSettings(data.telegramChatId, data.project);
            if (!settings) return;

            const message = `💰 Новая транзакция в проекте ${data.project}:
${data.description}
Сумма: ${data.amount}
${data.money_source ? 'Источник: ' + data.money_source : ''}
Дата: ${data.date}`;

            await this.sendNotifications(message, settings.transaction_notify_personal, 
                settings.transaction_notify_users, settings.transaction_notify_channels);
        } catch (error) {
            console.error('Transaction notification error:', error);
        }
    }

    async sendTaskNotification(data) {
        try {
            const settings = await this.getNotificationSettings(data.telegramChatId, data.project);
            if (!settings) return;

            const message = `📋 Новая задача в проекте ${data.project}:
${data.description}
${data.person ? 'Ответственный: ' + data.person : ''}
Статус: ${data.status || 'Новая'}
Приоритет: ${data.priority || 'Средний'}
Дата: ${data.date}`;

            await this.sendNotifications(message, settings.task_notify_personal,
                settings.task_notify_users, settings.task_notify_channels);
        } catch (error) {
            console.error('Task notification error:', error);
        }
    }

    async sendIdeaNotification(data) {
        try {
            const settings = await this.getNotificationSettings(data.telegramChatId, data.project);
            if (!settings) return;

            let message = `💡 Новая идея в проекте ${data.project}:
${data.description}`;

            if (data.link) {
                message += `\n🔗 Ссылка: ${data.link}`;
            }
            if (data.file_name) {
                message += `\n📎 Файл: ${data.file_name}`;
            }

            await this.sendNotifications(message, settings.idea_notify_personal,
                settings.idea_notify_users, settings.idea_notify_channels);
        } catch (error) {
            console.error('Idea notification error:', error);
        }
    }

    async getNotificationSettings(telegramChatId, project) {
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('telegram_chat_id', telegramChatId)
                .single();

            if (!userData) return null;

            const { data: settings } = await supabase
                .from('notification_settings')
                .select('*')
                .eq('user_id', userData.id)
                .eq('project_name', project)
                .single();

            return settings;
        } catch (error) {
            console.error('Get notification settings error:', error);
            return null;
        }
    }

    async sendNotifications(message, notifyPersonal, notifyUsers, notifyChannels) {
        try {
            // Send personal notification if enabled
            if (notifyPersonal) {
                // Personal notification is handled by the main bot response
            }

            // Send to users
            if (notifyUsers && notifyUsers.length > 0) {
                for (const chatId of notifyUsers) {
                    try {
                        await this.bot.sendMessage(chatId, message);
                    } catch (error) {
                        console.error(`Failed to send to user ${chatId}:`, error);
                    }
                }
            }

            // Send to channels
            if (notifyChannels && notifyChannels.length > 0) {
                for (const channelId of notifyChannels) {
                    try {
                        await this.bot.sendMessage(channelId, message);
                    } catch (error) {
                        console.error(`Failed to send to channel ${channelId}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Send notifications error:', error);
        }
    }
}

// Data Storage System
class DataStorage {
    constructor() {
        this.notificationService = new NotificationService();
    }

    async saveTransaction(data) {
        try {
            // Save to Supabase
            const { error } = await supabase
                .from('transactions')
                .insert({
                    id: uuidv4(),
                    project: data.project,
                    amount: data.amount,
                    money_source: data.money_source,
                    description: data.description,
                    date: data.date,
                    telegram_chat_id: data.telegramChatId,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Supabase error:', error);
                return false;
            }

            // Send notifications
            await this.notificationService.sendTransactionNotification(data);

            // Save to external storage if configured
            await this.saveToExternalStorage('transaction', data);

            return true;
        } catch (error) {
            console.error('Save transaction error:', error);
            return false;
        }
    }

    async saveTask(data) {
        try {
            // Save to Supabase
            const { error } = await supabase
                .from('tasks')
                .insert({
                    id: uuidv4(),
                    project: data.project,
                    description: data.description,
                    person: data.person,
                    date: data.date,
                    status: data.status || 'Новая',
                    priority: data.priority || 'Средний',
                    repeat_type: data.repeatType,
                    repeat_until: data.repeatUntil,
                    telegram_chat_id: data.telegramChatId,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Supabase error:', error);
                return false;
            }

            // Send notifications
            await this.notificationService.sendTaskNotification(data);

            // Save to external storage if configured
            await this.saveToExternalStorage('task', data);

            return true;
        } catch (error) {
            console.error('Save task error:', error);
            return false;
        }
    }

    async saveIdea(data) {
        try {
            // Save to Supabase
            const { error } = await supabase
                .from('ideas')
                .insert({
                    id: uuidv4(),
                    project: data.project,
                    description: data.description,
                    link: data.link,
                    file_url: data.file_url,
                    file_name: data.file_name,
                    telegram_chat_id: data.telegramChatId,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Supabase error:', error);
                return false;
            }

            // Send notifications
            await this.notificationService.sendIdeaNotification(data);

            // Save to external storage if configured
            await this.saveToExternalStorage('idea', data);

            return true;
        } catch (error) {
            console.error('Save idea error:', error);
            return false;
        }
    }

    async saveReminder(data) {
        try {
            // Save to Supabase
            const { error } = await supabase
                .from('reminders')
                .insert({
                    id: uuidv4(),
                    description: data.description,
                    remind_at: data.remindAt,
                    telegram_chat_id: data.telegramChatId,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Supabase error:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Save reminder error:', error);
            return false;
        }
    }

    async saveToExternalStorage(type, data) {
        try {
            // Get user storage settings
            const { data: userData } = await supabase
                .from('users')
                .select('id, storage_preference')
                .eq('telegram_chat_id', data.telegramChatId)
                .single();

            if (!userData) return;

            const { data: storageSettings } = await supabase
                .from('storage_settings')
                .select('*')
                .eq('user_id', userData.id)
                .single();

            if (!storageSettings) return;

            // Save to Google Sheets if enabled
            if (storageSettings.sheets_enabled && sheets) {
                await this.saveToGoogleSheets(type, data, storageSettings);
            }

            // Save to Notion if enabled
            if (storageSettings.notion_enabled) {
                await this.saveToNotion(type, data, storageSettings);
            }
        } catch (error) {
            console.error('External storage error:', error);
        }
    }

    async saveToGoogleSheets(type, data, settings) {
        if (!settings.sheets_spreadsheet_id) return;

        const sheetName = this.getSheetName(type);
        const values = this.formatDataForSheets(type, data);

        await sheets.spreadsheets.values.append({
            spreadsheetId: settings.sheets_spreadsheet_id,
            range: `${sheetName}!A:Z`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [values] }
        });
    }

    async saveToNotion(type, data, settings) {
        // Notion integration would go here
        // For now, just log
        console.log('Saving to Notion:', type, data);
    }

    getSheetName(type) {
        const sheetNames = {
            'transaction': 'Транзакции',
            'task': 'Задачи',
            'idea': 'Идеи'
        };
        return sheetNames[type] || type;
    }

    formatDataForSheets(type, data) {
        switch (type) {
            case 'transaction':
                return [
                    data.date,
                    data.amount,
                    data.money_source || '',
                    data.description,
                    data.project
                ];
            case 'task':
                return [
                    data.date,
                    data.description,
                    data.person || '',
                    data.status || 'Новая',
                    data.priority || 'Средний',
                    data.project
                ];
            case 'idea':
                return [
                    data.description,
                    data.link || '',
                    data.file_name || '',
                    data.project
                ];
            default:
                return [];
        }
    }
}

// Initialize systems
const aiClassifier = new AIClassifier();
const dataStorage = new DataStorage();

// Telegram Bot Handlers
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const voice = msg.voice;

    console.log('Received message:', { chatId, text, voice: !!voice });

    // Get or create user
    const user = await createUserIfNotExists(chatId.toString(), msg.from?.username, msg.from?.first_name, msg.from?.last_name);

    if (text === '/start') {
        await handleStartCommand(chatId, user);
        return;
    }

    if (text === '/setup') {
        await handleSetupCommand(chatId, user);
        return;
    }

    if (text === '/contacts') {
        await handleContactsCommand(chatId, user);
        return;
    }

    if (text === '/channels') {
        await handleChannelsCommand(chatId, user);
        return;
    }

    if (text === '/notifications') {
        await handleNotificationsCommand(chatId, user);
        return;
    }

    // Contact management commands
    if (text.startsWith('/addcontact')) {
        await handleAddContactCommand(chatId, user, text);
        return;
    }

    if (text.startsWith('/removecontact')) {
        await handleRemoveContactCommand(chatId, user, text);
        return;
    }

    // Channel management commands
    if (text.startsWith('/addchannel')) {
        await handleAddChannelCommand(chatId, user, text);
        return;
    }

    if (text.startsWith('/removechannel')) {
        await handleRemoveChannelCommand(chatId, user, text);
        return;
    }

    if (text === '/help') {
        await handleHelpCommand(chatId);
        return;
    }

    // Handle voice messages
    if (voice) {
        try {
            const file = await bot.getFile(voice.file_id);
            const audioBuffer = await axios.get(file.file_path, { responseType: 'arraybuffer' });
            
            const transcription = await openai.audio.transcriptions.create({
                file: Buffer.from(audioBuffer.data),
                model: "whisper-1"
            });

            const transcribedText = transcription.text;
            console.log('Transcribed text:', transcribedText);

            // Process transcribed text
            const result = await aiClassifier.classifyMessage(transcribedText, chatId.toString());
            await handleAIResponse(result, chatId);
        } catch (error) {
            console.error('Voice processing error:', error);
            await bot.sendMessage(chatId, 'Извините, не удалось обработать голосовое сообщение.');
        }
        return;
    }

    // Handle text messages
    if (text) {
        const result = await aiClassifier.classifyMessage(text, chatId.toString());
        await handleAIResponse(result, chatId);
    }
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        switch (data) {
            case 'setup_sheets':
                await handleSetupSheets(chatId);
                break;
            case 'setup_notion':
                await handleSetupNotion(chatId);
                break;
            case 'setup_supabase':
                await handleSetupSupabase(chatId);
                break;
            case 'setup_notifications':
                await handleSetupNotifications(chatId);
                break;
            case 'setup_contacts':
                await handleSetupContacts(chatId);
                break;
            case 'setup_channels':
                await handleSetupChannels(chatId);
                break;
            case 'setup_storage':
                await handleSetupStorage(chatId);
                break;
            default:
                await bot.answerCallbackQuery(query.id, { text: 'Неизвестная команда' });
        }
    } catch (error) {
        console.error('Callback query error:', error);
        await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
    }
});

async function handleStartCommand(chatId, user) {
    const message = `🎯 Добро пожаловать в BLG Family Assistant!

Хотите дублировать данные в удобную таблицу?
Все данные сохраняются в памяти и аналитика работает в любом случае.

1️⃣ Google Sheets - таблицы в Google
2️⃣ Notion - базы данных в Notion  
3️⃣ Нет - только Supabase (рекомендуется)

🆓 Бесплатно доступен 1 проект. Для добавления проектов нужна подписка.

Используйте /setup для настройки уведомлений и контактов.`;

    await bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1️⃣ Google Sheets', callback_data: 'setup_sheets' },
                    { text: '2️⃣ Notion', callback_data: 'setup_notion' }
                ],
                [
                    { text: '3️⃣ Только Supabase', callback_data: 'setup_supabase' }
                ]
            ]
        }
    });
}

async function handleSetupCommand(chatId, user) {
    const message = `⚙️ Настройка BLG Family Assistant

Выберите что настроить:

1️⃣ Уведомления - кому отправлять записи
2️⃣ Контакты - управление участниками команды
3️⃣ Каналы - управление Telegram каналами
4️⃣ Хранилище - настройка Google Sheets/Notion`;

    await bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1️⃣ Уведомления', callback_data: 'setup_notifications' },
                    { text: '2️⃣ Контакты', callback_data: 'setup_contacts' }
                ],
                [
                    { text: '3️⃣ Каналы', callback_data: 'setup_channels' },
                    { text: '4️⃣ Хранилище', callback_data: 'setup_storage' }
                ]
            ]
        }
    });
}

async function handleContactsCommand(chatId, user) {
    try {
        const { data: contacts } = await supabase
            .from('user_contacts')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true);

        if (!contacts || contacts.length === 0) {
            await bot.sendMessage(chatId, `👥 У вас пока нет контактов.

Добавить контакт:
/addcontact @username

Пример: /addcontact @ivan`);
            return;
        }

        let message = '👥 Ваши контакты:\n\n';
        contacts.forEach((contact, index) => {
            message += `${index + 1}. ${contact.contact_name} (@${contact.telegram_chat_id})\n`;
        });

        message += '\nКоманды:\n/addcontact @username - добавить\n/removecontact @username - удалить';

        await bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Contacts command error:', error);
        await bot.sendMessage(chatId, 'Ошибка при получении контактов.');
    }
}

async function handleChannelsCommand(chatId, user) {
    try {
        const { data: settings } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('user_id', user.id);

        if (!settings || settings.length === 0) {
            await bot.sendMessage(chatId, `📋 У вас пока нет настроенных каналов.

Добавить канал:
/addchannel @channel_name

Пример: /addchannel @family_finances`);
            return;
        }

        let message = '📋 Ваши каналы:\n\n';
        settings.forEach((setting, index) => {
            message += `${index + 1}. Проект: ${setting.project_name}\n`;
            if (setting.transaction_notify_channels?.length > 0) {
                message += `   💰 Транзакции: ${setting.transaction_notify_channels.join(', ')}\n`;
            }
            if (setting.task_notify_channels?.length > 0) {
                message += `   📋 Задачи: ${setting.task_notify_channels.join(', ')}\n`;
            }
            if (setting.idea_notify_channels?.length > 0) {
                message += `   💡 Идеи: ${setting.idea_notify_channels.join(', ')}\n`;
            }
            message += '\n';
        });

        message += 'Команды:\n/addchannel @channel - добавить\n/removechannel @channel - удалить';

        await bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Channels command error:', error);
        await bot.sendMessage(chatId, 'Ошибка при получении каналов.');
    }
}

async function handleNotificationsCommand(chatId, user) {
    try {
        const { data: settings } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('user_id', user.id);

        if (!settings || settings.length === 0) {
            await bot.sendMessage(chatId, `🔔 Уведомления не настроены.

Используйте /setup для настройки уведомлений.`);
            return;
        }

        let message = '🔔 Настройки уведомлений:\n\n';
        settings.forEach((setting, index) => {
            message += `📁 Проект: ${setting.project_name}\n`;
            message += `   💰 Транзакции: ${setting.transaction_notify_personal ? '✅' : '❌'} личные`;
            if (setting.transaction_notify_users?.length > 0) {
                message += `, ${setting.transaction_notify_users.length} пользователей`;
            }
            if (setting.transaction_notify_channels?.length > 0) {
                message += `, ${setting.transaction_notify_channels.length} каналов`;
            }
            message += '\n';
            
            message += `   📋 Задачи: ${setting.task_notify_personal ? '✅' : '❌'} личные`;
            if (setting.task_notify_users?.length > 0) {
                message += `, ${setting.task_notify_users.length} пользователей`;
            }
            if (setting.task_notify_channels?.length > 0) {
                message += `, ${setting.task_notify_channels.length} каналов`;
            }
            message += '\n';
            
            message += `   💡 Идеи: ${setting.idea_notify_personal ? '✅' : '❌'} личные`;
            if (setting.idea_notify_users?.length > 0) {
                message += `, ${setting.idea_notify_users.length} пользователей`;
            }
            if (setting.idea_notify_channels?.length > 0) {
                message += `, ${setting.idea_notify_channels.length} каналов`;
            }
            message += '\n\n';
        });

        await bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Notifications command error:', error);
        await bot.sendMessage(chatId, 'Ошибка при получении настроек уведомлений.');
    }
}

async function handleHelpCommand(chatId) {
    const message = `🔧 Помощь по использованию BLG Family Assistant

📝 Основные команды:
/start - Запустить приложение
/setup - Настройка уведомлений и контактов
/contacts - Управление контактами
/channels - Управление каналами
/notifications - Настройки уведомлений
/help - Эта справка

📊 Примеры использования:
"Потратил 5000 на продукты" - сохранить транзакцию
"Новая задача: позвонить в банк" - сохранить задачу
"Идея: сделать приложение" - сохранить идею
"Сколько потратил на этой неделе?" - аналитика

💡 Все данные сохраняются в Supabase для аналитики.
Дублирование в Google Sheets/Notion настраивается отдельно.`;

    await bot.sendMessage(chatId, message);
}

async function handleSetupSheets(chatId) {
    const message = `📊 Настройка Google Sheets

Что нужно от вас:
1️⃣ Создайте новую таблицу в Google Sheets
2️⃣ Отправьте ссылку на таблицу
3️⃣ Я создам листы автоматически

Структура таблицы:
💰 Транзакции: Дата | Сумма | Откуда деньги | Описание | Проект
📋 Задачи: Дата | Описание | Ответственный | Статус | Приоритет | Проект  
💡 Идеи: Описание | Ссылка | Файл | Проект

Пример ссылки: https://docs.google.com/spreadsheets/d/1ABC123...

Отправьте ссылку на вашу таблицу:`;

    await bot.sendMessage(chatId, message);
}

async function handleSetupNotion(chatId) {
    const message = `📋 Настройка Notion

Что нужно от вас:
1️⃣ Создайте 3 базы данных в Notion:
   - "Транзакции" 
   - "Задачи"
   - "Идеи"
2️⃣ Отправьте ссылки на базы данных
3️⃣ Я настрою структуру автоматически

Структура баз данных:
💰 Транзакции: Дата | Сумма | Откуда деньги | Описание | Проект
📋 Задачи: Дата | Описание | Ответственный | Статус | Приоритет | Проект
💡 Идеи: Описание | Ссылка | Файл | Проект

Пример ссылки: https://notion.so/workspace/123...

Отправьте ссылку на базу данных "Транзакции":`;

    await bot.sendMessage(chatId, message);
}

async function handleSetupSupabase(chatId) {
    const message = `✅ Отлично! Все данные будут сохраняться в Supabase.

Вы можете:
💰 Спрашивать аналитику: "Сколько потратил на этой неделе?"
📋 Управлять задачами: "Покажи мои задачи"
💡 Сохранять идеи: "Запиши идею про приложение"

Все данные в безопасности и доступны для анализа!

Используйте /setup для настройки уведомлений и контактов.`;

    await bot.sendMessage(chatId, message);
}

async function handleSetupNotifications(chatId) {
    const message = `🤝 Настройка уведомлений

Хотите автоматически уведомлять команду о новых записях?

1️⃣ Да - настроить уведомления
2️⃣ Нет - только личные уведомления

💡 Можно настроить отправку в:
- Личные сообщения участникам
- Telegram каналы
- Автопостинг в каналы`;

    await bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1️⃣ Да', callback_data: 'notifications_yes' },
                    { text: '2️⃣ Нет', callback_data: 'notifications_no' }
                ]
            ]
        }
    });
}

async function handleSetupContacts(chatId) {
    const message = `👥 Управление контактами

Добавить контакт в команду:
/addcontact @username

Примеры:
/addcontact @ivan
/addcontact @maria

Удалить контакт:
/removecontact @username

Просмотреть контакты:
/contacts

Максимум 5 контактов для бесплатного плана.`;

    await bot.sendMessage(chatId, message);
}

async function handleSetupChannels(chatId) {
    const message = `📋 Управление каналами

Добавить канал для уведомлений:
/addchannel @channel_name

Примеры:
/addchannel @family_finances
/addchannel @team_tasks

Удалить канал:
/removechannel @channel_name

Просмотреть каналы:
/channels

Максимум 3 канала для бесплатного плана.`;

    await bot.sendMessage(chatId, message);
}

async function handleSetupStorage(chatId) {
    const message = `💾 Настройка хранилища

Выберите где дублировать данные:

1️⃣ Google Sheets - таблицы в Google
2️⃣ Notion - базы данных в Notion  
3️⃣ Нет - только Supabase

Все данные сохраняются в Supabase для аналитики.
Дублирование - дополнительная копия в выбранном сервисе.`;

    await bot.sendMessage(chatId, message, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1️⃣ Google Sheets', callback_data: 'storage_sheets' },
                    { text: '2️⃣ Notion', callback_data: 'storage_notion' }
                ],
                [
                    { text: '3️⃣ Только Supabase', callback_data: 'storage_supabase' }
                ]
            ]
        }
    });
}

// Helper function to create user if not exists
async function createUserIfNotExists(telegramChatId, username, firstName, lastName) {
    try {
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_chat_id', telegramChatId)
            .single();

        if (existingUser) {
            return existingUser;
        }

        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                telegram_chat_id: telegramChatId,
                username: username,
                first_name: firstName,
                last_name: lastName
            })
            .select()
            .single();

        if (error) {
            console.error('Create user error:', error);
            return null;
        }

        // Create default storage settings
        await supabase
            .from('storage_settings')
            .insert({
                user_id: newUser.id
            });

        return newUser;
    } catch (error) {
        console.error('Create user if not exists error:', error);
        return null;
    }
}

async function handleAddContactCommand(chatId, user, text) {
    try {
        const username = text.replace('/addcontact', '').trim();
        if (!username || !username.startsWith('@')) {
            await bot.sendMessage(chatId, '❌ Неверный формат. Используйте: /addcontact @username');
            return;
        }

        // Check contact limit for free tier
        const { data: existingContacts } = await supabase
            .from('user_contacts')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true);

        if (user.tier === 'free' && existingContacts && existingContacts.length >= 5) {
            await bot.sendMessage(chatId, '❌ Достигнут лимит контактов для бесплатного плана (5). Обновите план для добавления большего количества контактов.');
            return;
        }

        // Add contact
        const { error } = await supabase
            .from('user_contacts')
            .insert({
                user_id: user.id,
                contact_name: username,
                telegram_chat_id: username,
                is_active: true
            });

        if (error) {
            console.error('Add contact error:', error);
            await bot.sendMessage(chatId, '❌ Ошибка при добавлении контакта.');
            return;
        }

        await bot.sendMessage(chatId, `✅ Контакт ${username} добавлен!`);
    } catch (error) {
        console.error('Add contact command error:', error);
        await bot.sendMessage(chatId, '❌ Ошибка при добавлении контакта.');
    }
}

async function handleRemoveContactCommand(chatId, user, text) {
    try {
        const username = text.replace('/removecontact', '').trim();
        if (!username || !username.startsWith('@')) {
            await bot.sendMessage(chatId, '❌ Неверный формат. Используйте: /removecontact @username');
            return;
        }

        const { error } = await supabase
            .from('user_contacts')
            .update({ is_active: false })
            .eq('user_id', user.id)
            .eq('telegram_chat_id', username);

        if (error) {
            console.error('Remove contact error:', error);
            await bot.sendMessage(chatId, '❌ Ошибка при удалении контакта.');
            return;
        }

        await bot.sendMessage(chatId, `✅ Контакт ${username} удален!`);
    } catch (error) {
        console.error('Remove contact command error:', error);
        await bot.sendMessage(chatId, '❌ Ошибка при удалении контакта.');
    }
}

async function handleAddChannelCommand(chatId, user, text) {
    try {
        const channelName = text.replace('/addchannel', '').trim();
        if (!channelName || !channelName.startsWith('@')) {
            await bot.sendMessage(chatId, '❌ Неверный формат. Используйте: /addchannel @channel_name');
            return;
        }

        // Check channel limit for free tier
        const { data: existingSettings } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('user_id', user.id);

        let totalChannels = 0;
        if (existingSettings) {
            existingSettings.forEach(setting => {
                totalChannels += (setting.transaction_notify_channels?.length || 0);
                totalChannels += (setting.task_notify_channels?.length || 0);
                totalChannels += (setting.idea_notify_channels?.length || 0);
            });
        }

        if (user.tier === 'free' && totalChannels >= 3) {
            await bot.sendMessage(chatId, '❌ Достигнут лимит каналов для бесплатного плана (3). Обновите план для добавления большего количества каналов.');
            return;
        }

        // For now, we'll add to a default project
        // In a real app, you'd ask which project and data type
        const { error } = await supabase
            .from('notification_settings')
            .upsert({
                user_id: user.id,
                project_name: 'default',
                transaction_notify_channels: [channelName],
                task_notify_channels: [channelName],
                idea_notify_channels: [channelName]
            });

        if (error) {
            console.error('Add channel error:', error);
            await bot.sendMessage(chatId, '❌ Ошибка при добавлении канала.');
            return;
        }

        await bot.sendMessage(chatId, `✅ Канал ${channelName} добавлен для уведомлений!`);
    } catch (error) {
        console.error('Add channel command error:', error);
        await bot.sendMessage(chatId, '❌ Ошибка при добавлении канала.');
    }
}

async function handleRemoveChannelCommand(chatId, user, text) {
    try {
        const channelName = text.replace('/removechannel', '').trim();
        if (!channelName || !channelName.startsWith('@')) {
            await bot.sendMessage(chatId, '❌ Неверный формат. Используйте: /removechannel @channel_name');
            return;
        }

        // Remove from all notification settings
        const { data: settings } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('user_id', user.id);

        if (settings) {
            for (const setting of settings) {
                const updatedSetting = {
                    transaction_notify_channels: setting.transaction_notify_channels?.filter(c => c !== channelName) || [],
                    task_notify_channels: setting.task_notify_channels?.filter(c => c !== channelName) || [],
                    idea_notify_channels: setting.idea_notify_channels?.filter(c => c !== channelName) || []
                };

                await supabase
                    .from('notification_settings')
                    .update(updatedSetting)
                    .eq('id', setting.id);
            }
        }

        await bot.sendMessage(chatId, `✅ Канал ${channelName} удален из уведомлений!`);
    } catch (error) {
        console.error('Remove channel command error:', error);
        await bot.sendMessage(chatId, '❌ Ошибка при удалении канала.');
    }
}

async function handleAIResponse(result, chatId) {
    if (result.type === 'text') {
        await bot.sendMessage(chatId, result.content);
    } else if (result.type === 'data') {
        const data = result.data;
        let success = false;

        try {
            switch (data.type) {
                case 'transaction':
                    success = await dataStorage.saveTransaction(data);
                    if (success) {
                        const message = `✅ Транзакция сохранена в проекте ${data.project}:
${data.description}
Сумма: ${data.amount}
${data.money_source ? 'Источник: ' + data.money_source : ''}
Дата: ${data.date}`;
                        await bot.sendMessage(chatId, message);
                    }
                    break;

                case 'task':
                    success = await dataStorage.saveTask(data);
                    if (success) {
                        const message = `✅ Задача сохранена в проекте ${data.project}:
${data.description}
${data.person ? 'Ответственный: ' + data.person : ''}
Статус: ${data.status || 'Новая'}
Приоритет: ${data.priority || 'Средний'}
Дата: ${data.date}`;
                        await bot.sendMessage(chatId, message);
                    }
                    break;

                case 'idea':
                    success = await dataStorage.saveIdea(data);
                    if (success) {
                        let message = `✅ Идея сохранена в проекте ${data.project}:
${data.description}`;
                        
                        if (data.link) {
                            message += `\n🔗 Ссылка: ${data.link}`;
                        }
                        if (data.file_name) {
                            message += `\n📎 Файл: ${data.file_name}`;
                        }
                        
                        await bot.sendMessage(chatId, message);
                    }
                    break;

                case 'reminder':
                    success = await dataStorage.saveReminder(data);
                    if (success) {
                        const message = `✅ Напоминание установлено:
${data.description}
Время: ${new Date(data.remindAt).toLocaleString()}`;
                        await bot.sendMessage(chatId, message);
                    }
                    break;
            }
        } catch (error) {
            console.error('Save data error:', error);
            await bot.sendMessage(chatId, 'Извините, произошла ошибка при сохранении данных.');
        }
    }
}

// Scheduled task reminders
cron.schedule('0 7,13,19 * * *', async () => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        
        // Get today's tasks from Supabase
        const { data: tasks, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('date', today);

        if (error) {
            console.error('Error fetching tasks:', error);
            return;
        }

        // Group tasks by person
        const tasksByPerson = {};
        tasks.forEach(task => {
            if (task.person) {
                if (!tasksByPerson[task.person]) {
                    tasksByPerson[task.person] = [];
                }
                tasksByPerson[task.person].push(task);
            }
        });

        // Send reminders
        for (const [person, personTasks] of Object.entries(tasksByPerson)) {
            const chatId = aiClassifier.chatMap.get(person);
            if (chatId && personTasks.length > 0) {
                const currentHour = new Date().toLocaleString("en-US", {
                    timeZone: "Europe/Tirane", 
                    hour: "numeric", 
                    hour12: false
                });
                
                let timeIcon = '';
                let timeText = '';
                
                if (currentHour >= 6 && currentHour < 12) {
                    timeIcon = '🌅';
                    timeText = 'Доброе утро';
                } else if (currentHour >= 12 && currentHour < 17) {
                    timeIcon = '😊';
                    timeText = 'Добрый день';
                } else if (currentHour >= 17 && currentHour < 22) {
                    timeIcon = '🌆';
                    timeText = 'Добрый вечер';
                } else {
                    timeIcon = '🌙';
                    timeText = 'Доброй ночи';
                }

                let message = `${timeIcon} ${timeText}!\n\n🎯 У тебя на сегодня задач: ${personTasks.length}\n\n`;
                
                personTasks.forEach((task, index) => {
                    message += `${index + 1}. ${task.description}\n`;
                });
                
                message += '\n💪 Удачного дня!';
                
                await bot.sendMessage(chatId, message);
            }
        }
    } catch (error) {
        console.error('Scheduled reminder error:', error);
    }
});

// Webhook endpoint for Telegram
app.post('/webhook', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.json({ ok: true });
        }
        
        // Process message through bot
        await bot.handleUpdate(req.body);
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoints for web app
app.post('/api/submit', async (req, res) => {
    try {
        const { type, project, description, amount, person, date } = req.body;
        const telegramChatId = req.body.telegramChatId || 'web-app';
        
        const data = {
            type,
            project,
            description,
            amount,
            person,
            date: date || new Date().toISOString().slice(0, 10),
            telegramChatId
        };

        let success = false;
        switch (type) {
            case 'transaction':
                success = await dataStorage.saveTransaction(data);
                break;
            case 'task':
                success = await dataStorage.saveTask(data);
                break;
            case 'idea':
                success = await dataStorage.saveIdea(data);
                break;
        }

        res.json({ success, message: success ? 'Данные сохранены' : 'Ошибка сохранения' });
    } catch (error) {
        console.error('API submit error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/analytics', async (req, res) => {
    try {
        const { project, period = 'week' } = req.query;
        
        // Calculate date range based on period
        const endDate = new Date();
        let startDate = new Date();
        
        switch (period) {
            case 'week':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(endDate.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(endDate.getMonth() - 3);
                break;
            case 'year':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
        }
        
        // Fetch data from Supabase
        let transactionsQuery = supabase
            .from('transactions')
            .select('*')
            .gte('date', startDate.toISOString().slice(0, 10))
            .lte('date', endDate.toISOString().slice(0, 10));
            
        let tasksQuery = supabase
            .from('tasks')
            .select('*')
            .gte('date', startDate.toISOString().slice(0, 10))
            .lte('date', endDate.toISOString().slice(0, 10));
            
        let ideasQuery = supabase
            .from('ideas')
            .select('*')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
        
        if (project && project !== 'all') {
            transactionsQuery = transactionsQuery.eq('project', project);
            tasksQuery = tasksQuery.eq('project', project);
            ideasQuery = ideasQuery.eq('project', project);
        }
        
        const [transactionsResult, tasksResult, ideasResult] = await Promise.all([
            transactionsQuery,
            tasksQuery,
            ideasQuery
        ]);
        
        if (transactionsResult.error) throw transactionsResult.error;
        if (tasksResult.error) throw tasksResult.error;
        if (ideasResult.error) throw ideasResult.error;
        
        // Calculate totals
        const totalIncome = transactionsResult.data
            .filter(t => t.amount.startsWith('+'))
            .reduce((sum, t) => sum + parseFloat(t.amount.replace(/[^\d.-]/g, '')), 0);
            
        const totalExpenses = transactionsResult.data
            .filter(t => t.amount.startsWith('-'))
            .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount.replace(/[^\d.-]/g, ''))), 0);
        
        res.json({
            transactions: transactionsResult.data,
            tasks: tasksResult.data,
            ideas: ideasResult.data,
            stats: {
                transactions: transactionsResult.data.length,
                tasks: tasksResult.data.length,
                ideas: ideasResult.data.length,
                totalIncome,
                totalExpenses
            }
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/recent', async (req, res) => {
    try {
        const { data: transactions } = await supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        const { data: tasks } = await supabase
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
            
        const { data: ideas } = await supabase
            .from('ideas')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        
        // Combine and sort by creation date
        const allItems = [
            ...(transactions || []).map(item => ({ ...item, type: 'transaction' })),
            ...(tasks || []).map(item => ({ ...item, type: 'task' })),
            ...(ideas || []).map(item => ({ ...item, type: 'idea' }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json(allItems.slice(0, 10));
    } catch (error) {
        console.error('Recent items error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        // For now, return default settings
        // In a real app, you'd fetch from database
        res.json({
            storage: {
                transaction: {
                    primary: 'supabase',
                    supabase: true,
                    sheets: false,
                    sheets: false
                },
                task: {
                    primary: 'supabase',
                    supabase: true,
                    sheets: false
                },
                idea: {
                    primary: 'supabase',
                    supabase: true,
                    sheets: false
                }
            },
            notifications: {
                personal: true,
                chat: false,
                channel: false,
                chatId: '',
                channelId: ''
            },
            ai: {
                autoClassify: true,
                voiceTranscription: true,
                smartReminders: true
            }
        });
    } catch (error) {
        console.error('Settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        
        // In a real app, you'd save to database
        console.log('Saving settings:', settings);
        
        // Validate settings structure
        if (!settings.storage || !settings.notifications || !settings.ai) {
            return res.status(400).json({ error: 'Invalid settings structure' });
        }
        
        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Save settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Telegram AI Assistant server running on port ${PORT}`);
    console.log(`📱 Webhook URL: https://your-domain.com/webhook`);
    console.log(`🔗 Web App: https://bespoke-platypus-5c4604.netlify.app/`);
}); 