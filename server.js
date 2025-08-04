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
  "project": "GO" | "Glamping" | "Family" | "Cars",
  "amount": string,
  "budgetFrom": string,
  "description": string,
  "date": string,
  "person": string,
  "databaseId": string,
  "telegramChatId": string,
  "repeatType": string,
  "repeatUntil": string,
  "remindAt": string
}
\`\`\`

⚠️ Никогда не мешай JSON и обычный текст.
✅ Либо возвращай только JSON, либо обычный ответ (без JSON).

Если команда неясная или данных не хватает — **всё равно верни JSON хотя бы с полем telegramChatId**, чтобы сохранить его и использовать при следующем ответе пользователя.

Если команды нет — не возвращай JSON, просто поговори по-человечески.

Если в сообщении явно указана сумма и описание, но **проект (\`project\`) не указан или не распознан**, сначала задай вопрос:

«Для какого проекта это записать? GO, Glamping, Family или Cars?»

⚠️ Не записывай JSON до получения ответа.
После уточнения проекта — не отвечай сообщением вообще, верни только JSON.

- Нельзя возвращать JSON до получения информации о проекте.

- Если проект уже есть, тогда возвращай JSON сразу.

📌 Если ты получаешь повторное сообщение (например, уточнение проекта или суммы) — используй сохранённый ранее 
\`telegramChatId\` из памяти, если он есть.

⚠️ Не возвращай \`chatId\` как \`undefined\`. Если \`telegramChatId\` ранее не был сохранён, верни JSON хотя бы с \`{ "telegramChatId": null }\`, чтобы система могла это обработать.

💾 Если \`telegramChatId\` присутствует — обязательно включай его в JSON-ответ.

📌 Поведение:

✅ Если пользователь хочет записать транзакцию, задачу или идею — верни корректный JSON.

✅ Если пользователь делится мыслями, размышляет, болтает или шутит — не сохраняй. Просто поддержи разговор.

✅ Если пользователь спрашивает о чём-то (например, "Когда я платил за аренду?") — попытайся найти ответ, но не создавай новую запись.

✅ Если сообщение неоднозначное — сначала уточни:

«Хочешь, я сохраню это как идею, задачу или ты просто делишься мыслями?»

💬 Не пытайся всё классифицировать. Если нет уверенности — уточни или просто поговори.

📚 Примеры:

1. Точная запись (верни JSON)

Потратила 500 на продукты
→ Это "type": "transaction" с "amount": "-500"

2. Просто мысль (не сохраняй)

Думаю съездить в Аргентину
→ Просто ответь по-человечески, не предлагай сохранить

3. Вопрос (ответь, не сохраняй)

Когда я последний раз платил за страховку?
→ Ответь, если знаешь. Никаких JSON

4. Неясность (уточни)

У меня появилась мысль...
→ Спроси: сохранить или просто поболтать?

📌 Правила транзакций:

Сумма всегда со знаком:

доходы: +2000, +500

расходы: -500, -1200

Ключевые слова для доходов: получил, поступило, доход, прибыль

Ключевые слова для расходов: потратил, оплатил, купил, заплатил, списали

📌 Правила повторяющихся задач:

Ежедневно → "repeatType": "ежедневно"

Еженедельно → "repeatType": "еженедельно"

Ежемесячно → "repeatType": "ежемесячно"

Если есть "до 15 числа" → также "repeatUntil": "2025-07-15"

📌 Примеры задач:

Поливать цветы ежедневно до 15 числа
→ "repeatType": "ежедневно", "repeatUntil": "2025-07-15"

Ира — разобрать с агентом проект семья
→ "type": "task", "project": "Family", "person": "Ира"

Саша — контроль документов по проекту GO
→ "type": "task", "project": "GO", "person": "Саша"

Собрать обратную связь от гостей (Glamping)
→ "project": "Glamping"

📌 Напоминания:

"Напомни через 2 часа забрать посылку"
→ "type": "reminder", "description": "забрать посылку", "remindAt": "2025-08-01T17:45:00+02:00"

📘 Таблица соответствия databaseId:

{
  "GO": {
    "transaction": "226f15d9c037808ebe06f9b3e9d13556",
    "idea": "227f15d9c03781c5ab58cf6f44ae3cde",
    "task": "227f15d9c03780078cebfd26e4d284b6"
  },
  "Glamping": {
    "transaction": "227f15d9c037814c9818f3e9540699b0",
    "idea": "227f15d9c03780a7b0dbf89a5f70565d",
    "task": "227f15d9c037805e9020eba32713be9f"
  },
  "Family": {
    "transaction": "227f15d9c037817c8d46c20889e9b055",
    "idea": "227f15d9c03781fcb852d62b993a9239",
    "task": "227f15d9c03781e9baacfb51cfd22fd5"
  },
  "Cars": {
    "transaction": "227f15d9c03781d2b89ef9cbf8ce5d42",
    "idea": "227f15d9c03781e5a83acacf12963a55",
    "task": "227f15d9c03781a9bd5ed09936613ea3"
  }
}

📌 Возможные project: GO, Glamping, Family, Cars
📌 Возможные person: Саша, Ира

🔗 Вводные переменные:

Сообщение: {{ $json.chatInput }}

Дата: {{ $json.date }}

Telegram Chat ID: {{ $json.telegramChatId }}

Если ты определяешь структуру данных (например, транзакцию, задачу, идею), всегда добавляй в JSON:

- telegramChatId (он указан в Prompt как Chat ID)
- date (указана в Prompt)

👥 Помни: ты — не только классификатор.
Ты — ассистент, который умеет вести диалог, запоминать важное и быть рядом.`;

        this.chatMap = {
            "Саша": "1269227321",
            "Ира": "182087110"
        };
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
            if (this.chatMap[parsed.person]) {
                parsed.telegramChatId = this.chatMap[parsed.person];
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

// Data Storage System
class DataStorage {
    constructor() {
        this.databaseIds = {
            "GO": {
                "transaction": "226f15d9c037808ebe06f9b3e9d13556",
                "idea": "227f15d9c03781c5ab58cf6f44ae3cde",
                "task": "227f15d9c03780078cebfd26e4d284b6"
            },
            "Glamping": {
                "transaction": "227f15d9c037814c9818f3e9540699b0",
                "idea": "227f15d9c03780a7b0dbf89a5f70565d",
                "task": "227f15d9c037805e9020eba32713be9f"
            },
            "Family": {
                "transaction": "227f15d9c037817c8d46c20889e9b055",
                "idea": "227f15d9c03781fcb852d62b993a9239",
                "task": "227f15d9c03781e9baacfb51cfd22fd5"
            },
            "Cars": {
                "transaction": "227f15d9c03781d2b89ef9cbf8ce5d42",
                "idea": "227f15d9c03781e5a83acacf12963a55",
                "task": "227f15d9c03781a9bd5ed09936613ea3"
            }
        };
    }

    async saveTransaction(data) {
        try {
            // Save to Google Sheets
            const sheetName = data.project;
            const values = [[
                data.date,
                data.amount,
                data.budgetFrom || '',
                data.description,
                data.telegramChatId,
                'transaction',
                data.project
            ]];

            // Save to Google Sheets (if configured)
            if (sheets && process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
                    range: `${sheetName}!A:G`,
                    valueInputOption: 'RAW',
                    insertDataOption: 'INSERT_ROWS',
                    resource: { values }
                });
            }

            // Save to Supabase for analytics
            const { error } = await supabase
                .from('transactions')
                .insert({
                    id: uuidv4(),
                    project: data.project,
                    amount: data.amount,
                    budget_from: data.budgetFrom,
                    description: data.description,
                    date: data.date,
                    telegram_chat_id: data.telegramChatId,
                    created_at: new Date().toISOString()
                });

            if (error) console.error('Supabase error:', error);

            return true;
        } catch (error) {
            console.error('Save transaction error:', error);
            return false;
        }
    }

    async saveTask(data) {
        try {
            // Notion integration removed - focusing on Supabase and Google Sheets

            // Save to Supabase
            const { error } = await supabase
                .from('tasks')
                .insert({
                    id: uuidv4(),
                    project: data.project,
                    description: data.description,
                    person: data.person,
                    date: data.date,
                    repeat_type: data.repeatType,
                    repeat_until: data.repeatUntil,
                    telegram_chat_id: data.telegramChatId,
                    created_at: new Date().toISOString()
                });

            if (error) console.error('Supabase error:', error);

            return true;
        } catch (error) {
            console.error('Save task error:', error);
            return false;
        }
    }

    async saveIdea(data) {
        try {
            // Notion integration removed - focusing on Supabase and Google Sheets

            // Save to Supabase
            const { error } = await supabase
                .from('ideas')
                .insert({
                    id: uuidv4(),
                    project: data.project,
                    description: data.description,
                    telegram_chat_id: data.telegramChatId,
                    created_at: new Date().toISOString()
                });

            if (error) console.error('Supabase error:', error);

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

            if (error) console.error('Supabase error:', error);

            return true;
        } catch (error) {
            console.error('Save reminder error:', error);
            return false;
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

    if (text === '/start') {
        await bot.sendMessage(chatId, `🎯 Добро пожаловать в BLG Family Assistant!

📱 Управляйте задачами всей семьи в одном месте

🔧 Доступные команды:
/app - Открыть Task Manager
/tasks - Показать задачи
/help - Помощь`, {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '📱 Открыть Task Manager',
                        web_app: { url: 'https://bespoke-platypus-5c4604.netlify.app/' }
                    }
                ]]
            }
        });
        return;
    }

    if (text === '/app') {
        await bot.sendMessage(chatId, '📱 Task Manager - Управление задачами семьи', {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🚀 Открыть приложение',
                        web_app: { url: 'https://bespoke-platypus-5c4604.netlify.app/' }
                    }
                ]]
            }
        });
        return;
    }

    if (text === '/help') {
        await bot.sendMessage(chatId, `🔧 Помощь по использованию BLG Family Assistant

📱 Основной интерфейс: https://bespoke-platypus-5c4604.netlify.app/

🔧 Команды:
/start - Запустить приложение
/tasks - Показать задачи
/add - Добавить задачу
/help - Эта справка

💡 Для полного доступа к функциям используйте веб-приложение`);
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
                        const message = `✅ Добавлено в транзакции для проекта ${data.project}:
${data.description}
${data.amount ? 'Сумма: ' + data.amount : ''}
${data.budgetFrom ? 'Источник: ' + data.budgetFrom : ''}
${data.date ? 'Дата: ' + data.date : ''}`;
                        await bot.sendMessage(chatId, message);
                    }
                    break;

                case 'task':
                    success = await dataStorage.saveTask(data);
                    if (success) {
                        const message = `✅ Добавлено в задачи для проекта ${data.project}:
${data.description}
${data.person ? 'Ответственный: ' + data.person : ''}
${data.date ? 'Дата: ' + data.date : ''}`;
                        await bot.sendMessage(chatId, message);
                    }
                    break;

                case 'idea':
                    success = await dataStorage.saveIdea(data);
                    if (success) {
                        const message = `✅ Добавлено в идеи для проекта ${data.project}:
${data.description}`;
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
            const chatId = aiClassifier.chatMap[person];
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