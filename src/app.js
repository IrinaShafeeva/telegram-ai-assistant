/**
 * Modern AI Assistant - New Architecture
 * Based on scalable service-oriented design
 */

const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { supabase } = require('./config/database');
const { ToolsService } = require('./tools');
const { RoutingService } = require('./services/routing');
const { TelegramConnector, TelegramChannelConnector } = require('./connectors/telegram');
const { GoogleSheetsConnector, GoogleCalendarConnector } = require('./connectors/google');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize clients
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize services
const toolsService = new ToolsService();
const routingService = new RoutingService();

// Register connectors
routingService.registerConnector('telegram_dm', new TelegramConnector(bot));
routingService.registerConnector('telegram_channel', new TelegramChannelConnector(bot));
routingService.registerConnector('google_sheets', new GoogleSheetsConnector());
routingService.registerConnector('google_calendar', new GoogleCalendarConnector());

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
// Remove static files middleware as there's no frontend

// LLM Service with Tools
class LLMService {
    constructor() {
        this.systemPrompt = `Ты — семейный AI-ассистент. Помогаешь управлять расходами, задачами и закладками.

ВАЖНО: Используй инструменты для работы с данными. Доступные инструменты:
- resolve_person(name) - найти человека по имени/алиасу
- add_expense(payload) - добавить расход
- add_task(payload) - добавить задачу
- add_bookmark(payload) - добавить закладку
- search(query) - найти записи
- route(record) - маршрутизировать запись

Примеры использования:
1. "Потратил 5000 на продукты" → add_expense({title: "Продукты", amount: -5000})
2. "Задача для Ивана: позвонить в банк" → resolve_person("Иван") → add_task({title: "Позвонить в банк", assignee: "Иван"})
3. "Сохрани ссылку на рецепт" → add_bookmark({title: "Рецепт", url: "..."})

Всегда используй инструменты для сохранения данных. Отвечай коротко и дружелюбно.`;
    }

    async processMessage(message, context) {
        try {
            const tools = toolsService.getTools();
            
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: this.systemPrompt },
                    { role: "user", content: message }
                ],
                tools: tools.map(tool => ({
                    type: "function",
                    function: tool
                })),
                tool_choice: "auto",
                temperature: 0.7,
                max_tokens: 1000
            });

            const response = completion.choices[0].message;
            let result = { type: 'text', content: response.content };

            // Execute tool calls if present
            if (response.tool_calls) {
                const toolResults = [];
                
                for (const toolCall of response.tool_calls) {
                    try {
                        const toolResult = await toolsService.executeTool(
                            toolCall.function.name,
                            JSON.parse(toolCall.function.arguments),
                            context
                        );
                        
                        toolResults.push({
                            tool: toolCall.function.name,
                            result: toolResult
                        });

                        // If it's an add_* tool, process the record through routing
                        if (toolCall.function.name.startsWith('add_') && toolResult.record_id) {
                            // Get the created record
                            const { data: record } = await supabase
                                .from('records')
                                .select('*, assignee:team_members(*)')
                                .eq('id', toolResult.record_id)
                                .single();

                            if (record) {
                                // Process through routing service
                                const routingResult = await routingService.processRecord(record);
                                toolResult.routing = routingResult;
                            }
                        }
                    } catch (error) {
                        console.error('Tool execution error:', error);
                        toolResults.push({
                            tool: toolCall.function.name,
                            error: error.message
                        });
                    }
                }

                result = {
                    type: 'tools_executed',
                    content: response.content,
                    tools: toolResults
                };
            }

            return result;
        } catch (error) {
            console.error('LLM processing error:', error);
            return {
                type: 'error',
                content: 'Извините, произошла ошибка при обработке запроса.'
            };
        }
    }
}

const llmService = new LLMService();

// Context Management
async function getContext(tgChatId) {
    // Get or create tenant (for now, one tenant per chat)
    let tenant = await getTenant(tgChatId);
    if (!tenant) {
        tenant = await createTenant(tgChatId);
    }

    // Get or create user
    let user = await getUser(tenant.id, tgChatId);
    if (!user) {
        user = await createUser(tenant.id, tgChatId);
    }

    return {
        tenant_id: tenant.id,
        user_id: user.id,
        tg_chat_id: tgChatId
    };
}

async function getTenant(tgChatId) {
    // For now, create tenant per chat. In production, you'd have proper tenant management
    const { data } = await supabase
        .from('tenants')
        .select('*')
        .eq('name', `chat_${tgChatId}`)
        .single();
    
    return data;
}

async function createTenant(tgChatId) {
    const { data, error } = await supabase
        .from('tenants')
        .insert({
            name: `chat_${tgChatId}`,
            plan: 'free'
        })
        .select()
        .single();

    if (error) throw error;

    // Create default entitlements
    await supabase
        .from('entitlements')
        .insert([
            { tenant_id: data.id, key: 'max_users', value: '5' },
            { tenant_id: data.id, key: 'max_routes', value: '3' },
            { tenant_id: data.id, key: 'search_history_days', value: '30' }
        ]);

    return data;
}

async function getUser(tenantId, tgChatId) {
    const { data } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('tg_chat_id', tgChatId)
        .single();
    
    return data;
}

async function createUser(tenantId, tgChatId) {
    // Try with new schema first, fallback to old schema
    let userData = {
        tenant_id: tenantId,
        tg_chat_id: tgChatId,
        username: `user_${tgChatId}`,
        first_name: 'User',
        last_name: tgChatId
    };
    
    // Try to add role if column exists
    try {
        userData.role = 'user';
        const { data, error } = await supabase
            .from('users')
            .insert(userData)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        // Fallback to old schema without role
        console.log('Trying without role column...');
        delete userData.role;
        
        const { data, error: fallbackError } = await supabase
            .from('users')
            .insert(userData)
            .select()
            .single();
        
        if (fallbackError) throw fallbackError;
        return data;
    }
}

// Message processing function (used by webhook)
async function processMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const voice = msg.voice;

    console.log('Processing message:', { chatId, text, voice: !!voice });

    try {
        const context = await getContext(chatId.toString());
        console.log('Context:', context);

        // Handle commands
        if (text.startsWith('/')) {
            console.log('Processing command:', text);
            await handleCommand(text, chatId, context);
            return;
        }

        // Handle voice messages
        if (voice) {
            console.log('Processing voice message');
            const transcribedText = await transcribeVoice(voice);
            if (transcribedText) {
                console.log('Transcribed:', transcribedText);
                const result = await llmService.processMessage(transcribedText, context);
                await handleLLMResponse(result, chatId);
            }
            return;
        }

        // Handle text messages
        if (text) {
            console.log('Processing text message:', text);
            const result = await llmService.processMessage(text, context);
            console.log('LLM result:', result);
            await handleLLMResponse(result, chatId);
        }
    } catch (error) {
        console.error('Message handling error:', error);
        console.error('Error stack:', error.stack);
        
        try {
            await bot.sendMessage(chatId, `❌ Произошла ошибка: ${error.message}

Попробуйте:
• /start - перезапустить бота
• /help - справка по командам

Или обратитесь к администратору.`);
        } catch (botError) {
            console.error('Bot send error:', botError);
        }
    }
}

async function transcribeVoice(voice) {
    try {
        const file = await bot.getFile(voice.file_id);
        const audioResponse = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
        const audioBuffer = await audioResponse.arrayBuffer();
        
        const transcription = await openai.audio.transcriptions.create({
            file: Buffer.from(audioBuffer),
            model: "whisper-1"
        });

        return transcription.text;
    } catch (error) {
        console.error('Voice transcription error:', error);
        return null;
    }
}

async function handleCommand(command, chatId, context) {
    const [cmd, ...args] = command.split(' ');
    
    switch (cmd) {
        case '/start':
            await handleStartCommand(chatId, context);
            break;

        case '/help':
            await bot.sendMessage(chatId, `📖 Справка по командам:

💰 Расходы:
"Потратил 1000 на продукты"
"Доход 50000 зарплата"

📋 Задачи:
"Задача для Ивана: позвонить клиенту"
"Напомнить завтра купить хлеб"

🔖 Закладки:  
"Сохрани https://example.com"

🔍 Поиск:
"Найди все расходы за неделю"
"Покажи задачи Ивана"`);
            break;

        case '/search':
            if (args.length > 0) {
                const query = args.join(' ');
                const result = await toolsService.executeTool('search', { query }, context);
                
                if (result.length > 0) {
                    let message = `🔍 Найдено ${result.length} записей:\n\n`;
                    result.forEach((record, i) => {
                        message += `${i + 1}. ${record.title} (${record.kind})\n`;
                        if (record.snippet) message += `   ${record.snippet}\n`;
                        message += '\n';
                    });
                    await bot.sendMessage(chatId, message);
                } else {
                    await bot.sendMessage(chatId, 'Ничего не найдено по вашему запросу.');
                }
            }
            break;
            
        case '/setup':
            await handleSetupCommand(chatId, context);
            break;
            
        case '/sheets':
            await handleSheetsCommand(chatId, context, args.join(' '));
            break;

        default:
            await bot.sendMessage(chatId, 'Неизвестная команда. Используйте /help для справки.');
    }
}

async function handleStartCommand(chatId, context) {
    // Check if user already has setup
    const { data: destinations } = await supabase
        .from('destinations')
        .select('*')
        .eq('tenant_id', context.tenant_id)
        .limit(1);
    
    if (destinations && destinations.length > 0) {
        // User already set up
        await bot.sendMessage(chatId, `🎯 С возвращением!

Я готов помочь вам:
💰 Отслеживать расходы
📋 Управлять задачами  
🔖 Сохранять закладки

Попробуйте:
"Потратил 500 на обед"
"Задача: купить молоко"
"Сохрани https://example.com"

/setup - настроить интеграции
/help - подробная справка`);
    } else {
        // New user onboarding
        await bot.sendMessage(chatId, `🎯 Добро пожаловать в AI Assistant!

Я помогу вам отслеживать:
💰 Расходы и доходы
📋 Задачи и напоминания
🔖 Полезные ссылки

Куда сохранять данные?
1️⃣ Только в памяти (можно поискать)
2️⃣ В Google Sheets (удобные таблицы)
3️⃣ Настроить позже

Выберите вариант:`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '1️⃣ Только память', callback_data: 'setup_memory' },
                        { text: '2️⃣ Google Sheets', callback_data: 'setup_sheets' }
                    ],
                    [
                        { text: '3️⃣ Настроить позже', callback_data: 'setup_later' }
                    ]
                ]
            }
        });
    }
}

async function handleSetupCommand(chatId, context) {
    await bot.sendMessage(chatId, `⚙️ Настройка интеграций

Доступные интеграции:
📊 Google Sheets - сохранение в таблицы
👥 Команда - добавление участников  
🔔 Уведомления - настройка доставки

Что настроить?`, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📊 Google Sheets', callback_data: 'setup_sheets' },
                    { text: '👥 Команда', callback_data: 'setup_team' }
                ],
                [
                    { text: '🔔 Уведомления', callback_data: 'setup_notifications' },
                    { text: '❌ Отмена', callback_data: 'setup_cancel' }
                ]
            ]
        }
    });
}

async function handleSheetsCommand(chatId, context, url) {
    if (!url || !url.includes('docs.google.com/spreadsheets')) {
        await bot.sendMessage(chatId, `📊 Настройка Google Sheets

Для сохранения данных в Google Sheets:

1️⃣ Создайте новую таблицу в Google Sheets
2️⃣ Откройте доступ для: ai-assistant@your-project.iam.gserviceaccount.com
3️⃣ Отправьте ссылку командой: /sheets ССЫЛКА

Пример:
/sheets https://docs.google.com/spreadsheets/d/1ABC123.../edit`);
        return;
    }
    
    try {
        // Extract spreadsheet ID from URL
        const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
            await bot.sendMessage(chatId, '❌ Неверный формат ссылки. Отправьте ссылку на Google Sheets.');
            return;
        }
        
        const spreadsheetId = match[1];
        
        // Save destinations for different record types
        const destinations = [
            {
                tenant_id: context.tenant_id,
                type: 'sheet',
                provider: 'google',
                external_id: `${spreadsheetId}!Расходы`,
                meta: { sheet_name: 'Расходы', record_kind: 'expense' }
            },
            {
                tenant_id: context.tenant_id,
                type: 'sheet', 
                provider: 'google',
                external_id: `${spreadsheetId}!Задачи`,
                meta: { sheet_name: 'Задачи', record_kind: 'task' }
            },
            {
                tenant_id: context.tenant_id,
                type: 'sheet',
                provider: 'google', 
                external_id: `${spreadsheetId}!Закладки`,
                meta: { sheet_name: 'Закладки', record_kind: 'bookmark' }
            }
        ];
        
        // Insert destinations
        const { error } = await supabase
            .from('destinations')
            .upsert(destinations);
            
        if (error) throw error;
        
        // Create routes to use these destinations
        const routes = [
            {
                tenant_id: context.tenant_id,
                name: 'Expenses to Google Sheets',
                priority: 10,
                enabled: true,
                match: { kind: 'expense' },
                action: [
                    { connector: 'telegram_dm', target: '{{user.tg_chat_id}}' },
                    { connector: 'google_sheets', target: `${spreadsheetId}!Расходы` }
                ]
            },
            {
                tenant_id: context.tenant_id,
                name: 'Tasks to Google Sheets',
                priority: 10,
                enabled: true,
                match: { kind: 'task' },
                action: [
                    { connector: 'telegram_dm', target: '{{user.tg_chat_id}}' },
                    { connector: 'google_sheets', target: `${spreadsheetId}!Задачи` }
                ]
            },
            {
                tenant_id: context.tenant_id,
                name: 'Bookmarks to Google Sheets',
                priority: 10,
                enabled: true,
                match: { kind: 'bookmark' },
                action: [
                    { connector: 'telegram_dm', target: '{{user.tg_chat_id}}' },
                    { connector: 'google_sheets', target: `${spreadsheetId}!Закладки` }
                ]
            }
        ];
        
        await supabase
            .from('routes')
            .upsert(routes);
            
        await bot.sendMessage(chatId, `✅ Google Sheets настроен!

📊 Таблица: ${spreadsheetId}
📝 Листы: Расходы, Задачи, Закладки

Теперь все данные будут сохраняться и в Telegram, и в вашу таблицу.

Попробуйте:
"Потратил 1000 на продукты" 💰
"Задача: купить хлеб" 📋  
"Сохрани https://example.com" 🔖`);
        
    } catch (error) {
        console.error('Sheets setup error:', error);
        await bot.sendMessage(chatId, `❌ Ошибка настройки Google Sheets: ${error.message}

Проверьте:
1. Ссылка корректная
2. Доступ предоставлен для бота
3. Таблица существует`);
    }
}

async function handleLLMResponse(result, chatId) {
    switch (result.type) {
        case 'text':
            if (result.content) {
                await bot.sendMessage(chatId, result.content);
            }
            break;

        case 'tools_executed':
            let message = result.content || '';
            
            if (result.tools && result.tools.length > 0) {
                for (const tool of result.tools) {
                    if (tool.error) {
                        message += `\n❌ Ошибка: ${tool.error}`;
                    } else if (tool.tool.startsWith('add_')) {
                        const kind = tool.tool.replace('add_', '');
                        const emoji = kind === 'expense' ? '💰' : kind === 'task' ? '📋' : '🔖';
                        message += `\n${emoji} Запись сохранена!`;
                        
                        if (tool.result.routing?.deliveries_created > 0) {
                            message += ` (${tool.result.routing.deliveries_created} уведомлений отправлено)`;
                        }
                    }
                }
            }
            
            if (message) {
                await bot.sendMessage(chatId, message);
            }
            break;

        case 'error':
            await bot.sendMessage(chatId, result.content);
            break;
    }
}

// Webhook for Telegram
app.post('/webhook', async (req, res) => {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    try {
        const update = req.body;
        
        if (!update) {
            console.log('No update in request body');
            return res.json({ ok: true });
        }
        
        // Handle message
        if (update.message) {
            console.log('Processing message from webhook');
            await processMessage(update.message);
        }
        
        // Handle callback queries (inline buttons)
        if (update.callback_query) {
            console.log('Processing callback query from webhook');
            await handleCallbackQuery(update.callback_query);
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error('Webhook error:', error);
        console.error('Webhook error stack:', error.stack);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
});

// Handle callback queries
async function handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    try {
        const context = await getContext(chatId.toString());
        
        switch (data) {
            case 'setup_memory':
                await bot.answerCallbackQuery(query.id, { text: 'Настроено!' });
                await bot.sendMessage(chatId, `✅ Настройка завершена!

Данные будут сохраняться в памяти.
Вы всегда можете найти их командой /search

Попробуйте прямо сейчас:
"Потратил 500 на кофе" ☕
"Задача: позвонить маме" 📞`);
                break;
                
            case 'setup_sheets':
                await bot.answerCallbackQuery(query.id, { text: 'Настраиваем Sheets...' });
                await handleSheetsCommand(chatId, context, '');
                break;
                
            case 'setup_later':
                await bot.answerCallbackQuery(query.id, { text: 'Можно настроить позже' });
                await bot.sendMessage(chatId, `👌 Хорошо, настроим позже.

Пока что данные сохраняются в памяти.
Когда будете готовы к настройке - /setup

Попробуйте:
"Потратил 300 на обед" 🍽️
"Идея: сделать мобильное приложение" 💡`);
                break;
                
            case 'setup_team':
                await bot.answerCallbackQuery(query.id, { text: 'Настройка команды...' });
                await bot.sendMessage(chatId, `👥 Настройка команды

Пока что эта функция в разработке.
Вы можете использовать бота индивидуально.

В будущих версиях:
• Добавление участников команды
• Назначение задач коллегам  
• Общие уведомления

/help - вернуться к основным функциям`);
                break;
                
            case 'setup_notifications':
                await bot.answerCallbackQuery(query.id, { text: 'Уведомления...' });
                await bot.sendMessage(chatId, `🔔 Уведомления

Сейчас уведомления приходят в этот чат.
В настройках можно добавить:

📊 Google Sheets - автосохранение в таблицы
👥 Команда - уведомления коллегам
📧 Email - дублирование на почту

/sheets ССЫЛКА - настроить Google Sheets`);
                break;
                
            case 'setup_cancel':
                await bot.answerCallbackQuery(query.id, { text: 'Отменено' });
                await bot.sendMessage(chatId, `❌ Настройка отменена.

Используйте /setup для повторной настройки.

Или попробуйте прямо сейчас:
"Потратил 1000 на продукты" 💰`);
                break;
                
            default:
                await bot.answerCallbackQuery(query.id, { text: 'Неизвестная команда' });
        }
    } catch (error) {
        console.error('Callback query error:', error);
        await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка' });
    }
}

// API endpoints
app.get('/api/records', async (req, res) => {
    try {
        const { tenant_id, kind, limit = 20 } = req.query;
        
        let query = supabase
            .from('records')
            .select('*, assignee:team_members(display_name)')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false })
            .limit(limit);
            
        if (kind) {
            query = query.eq('kind', kind);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('API records error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const { tenant_id, user_id, query, kind, limit } = req.query;
        
        const result = await toolsService.executeTool('search', 
            { query, kind, limit: parseInt(limit) || 20 }, 
            { tenant_id, user_id }
        );
        
        res.json(result);
    } catch (error) {
        console.error('API search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Background tasks
setInterval(async () => {
    try {
        // Retry failed deliveries every 5 minutes
        await routingService.retryFailedDeliveries();
    } catch (error) {
        console.error('Background task error:', error);
    }
}, 5 * 60 * 1000);

// Health check endpoint for Vercel
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: '🤖 AI Assistant v2.0 is running!',
        version: '2.0.0',
        endpoints: {
            webhook: '/webhook',
            api: '/api/*'
        }
    });
});

// Start server (only in non-serverless environment)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`🚀 AI Assistant server running on port ${PORT}`);
        console.log(`📱 Webhook URL: ${process.env.TELEGRAM_WEBHOOK_URL || `http://localhost:${PORT}/webhook`}`);
        console.log('🎯 New architecture ready!');
    });
}

module.exports = app;