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
const { writeExpense, writeTask, writeBookmark } = require('./services/googleSheets');
const { processTask } = require('./services/taskProcessor');
const { createTeamReminder } = require('./services/googleCalendar');
const ReminderService = require('./services/reminderService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3009;

// Initialize clients
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
    polling: process.env.NODE_ENV !== 'production',
    webHook: process.env.NODE_ENV === 'production'
});

// Add event listeners for debugging
bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
    console.error('❌ Webhook error:', error.message);
});

bot.on('error', (error) => {
    console.error('❌ Bot error:', error.message);
});

// Функция для обработки напоминаний (использует новый сервис)
async function processReminder(text, context, chatId) {
    try {
        console.log('⏰ Обрабатываю напоминание через сервис:', text);
        return await reminderService.processReminder(text, context, chatId);
    } catch (error) {
        console.error('❌ Ошибка обработки напоминания:', error);
        return { success: false, message: '❌ Ошибка обработки напоминания' };
    }
}

// Функция для автоматической записи в Google Sheets
async function writeToGoogleSheets(text, context, chatId) {
    try {
        // Проверяем, не находимся ли в процессе настройки команды
        if (context.teamSetupState && context.teamSetupState.step) {
            console.log('🔄 Пропускаем запись в Google Sheets - пользователь в процессе настройки команды');
            return;
        }
        
        // Получаем Google Sheets ID пользователя
        const spreadsheetId = await getUserGoogleSheetsId(context.tenant_id);
        if (!spreadsheetId) {
            console.log('⚠️ Google Sheets не настроен для пользователя');
            return;
        }

        console.log('📝 Записываю в Google Sheets:', text);

        // Определяем тип сообщения и записываем соответствующим образом
        if (text.toLowerCase().includes('потратил') || text.toLowerCase().includes('расход')) {
            // Извлекаем сумму и описание из текста
            const amountMatch = text.match(/(\d+)/);
            const amount = amountMatch ? amountMatch[1] : '0';
            const description = text.replace(/\d+/g, '').replace(/потратил|расход/gi, '').trim();
            
            const success = await writeExpense(spreadsheetId, amount, description, 'Общие расходы', chatId.toString());
            if (success) {
                console.log('✅ Расход записан в Google Sheets');
            }
        } else if (text.toLowerCase().includes('задача') || text.toLowerCase().includes('todo')) {
            // Умная обработка задач
            const taskResult = await processTask(text, context, chatId);
            if (taskResult && taskResult.success) {
                console.log('✅ Задача обработана умно:', taskResult.message);
                // Отправляем пользователю результат обработки
                await bot.sendMessage(chatId, taskResult.message);
            }
        } else if (text.toLowerCase().includes('напомни') || text.toLowerCase().includes('напомнить')) {
            // Обработка напоминаний
            const reminderResult = await processReminder(text, context, chatId);
            if (reminderResult && reminderResult.success) {
                console.log('✅ Напоминание обработано:', reminderResult.message);
                await bot.sendMessage(chatId, reminderResult.message);
            }
        } else {
            // Для остальных сообщений создаем запись в лист "Закладки"
            const success = await writeBookmark(spreadsheetId, 'Заметка', text, '', chatId.toString());
            if (success) {
                console.log('✅ Заметка записана в Google Sheets');
            }
        }

    } catch (error) {
        console.error('❌ Ошибка записи в Google Sheets:', error);
    }
}

// Функция для получения Google Sheets ID пользователя
async function getUserGoogleSheetsId(tenantId) {
    try {
        const { data: destinations, error } = await supabase
            .from('destinations')
            .select('external_id')
            .eq('tenant_id', tenantId)
            .eq('type', 'sheet')
            .eq('provider', 'google')
            .limit(1);

        if (error) {
            console.error('❌ Ошибка получения Google Sheets ID:', error);
            return null;
        }

        if (destinations && destinations.length > 0) {
            // Извлекаем ID таблицы из external_id (формат: "spreadsheetId!SheetName")
            const externalId = destinations[0].external_id;
            const spreadsheetId = externalId.split('!')[0];
            console.log('✅ Google Sheets ID найден:', spreadsheetId);
            return spreadsheetId;
        }

        return null;
    } catch (error) {
        console.error('❌ Ошибка получения Google Sheets ID:', error);
        return null;
    }
}

// Handle incoming messages
bot.on('message', async (msg) => {
    console.log('📨 Получено сообщение:', JSON.stringify(msg, null, 2));
    
    try {
        const chatId = msg.chat.id;
        const text = msg.text || '';
        const username = msg.from.username || msg.from.first_name || 'Unknown';
        
        console.log(`👤 Пользователь ${username} (${chatId}) написал: ${text}`);
        
        const context = await getContext(chatId.toString());
        console.log('Context:', context);

        // Handle commands
        if (text.startsWith('/')) {
            console.log('Processing command:', text);
            await handleCommand(text, chatId, context);
            return;
        }

        // Handle voice messages
        if (msg.voice) {
            console.log('Processing voice message');
            const transcribedText = await transcribeVoice(msg.voice);
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
            
            // Проверяем, находимся ли в процессе настройки команды
            if (context.teamSetupState && context.teamSetupState.step) {
                console.log(`🔄 Продолжаем настройку команды, шаг: ${context.teamSetupState.step}`);
                console.log(`📋 Состояние:`, JSON.stringify(context.teamSetupState, null, 2));
                console.log(`🚀 ВЫЗЫВАЕМ handleTeamSetupStep с параметрами: chatId=${chatId}, text="${text}"`);
                
                try {
                    const updatedContext = await handleTeamSetupStep(chatId, context, text);
                    console.log('✅ handleTeamSetupStep выполнен успешно');
                    
                    // Обновляем контекст, если он был изменен
                    if (updatedContext) {
                        Object.assign(context, updatedContext);
                        console.log('🔄 Контекст обновлен после handleTeamSetupStep');
                    }
                } catch (teamSetupError) {
                    console.error('❌ Ошибка в handleTeamSetupStep:', teamSetupError);
                    console.error('Stack:', teamSetupError.stack);
                    
                    // Очищаем состояние при ошибке
                    context.teamSetupState = null;
                    
                    // Отправляем сообщение об ошибке пользователю
                    await bot.sendMessage(chatId, `❌ Произошла ошибка при настройке команды: ${teamSetupError.message}

Попробуйте:
• /team - вернуться к управлению командой
• /start - перезапустить бота`);
                }
                return;
            }
            
            console.log('ℹ️ Пользователь НЕ в процессе настройки команды, продолжаем обычную обработку');
            
            try {
                const result = await llmService.processMessage(text, context);
                console.log('LLM result:', result);
                await handleLLMResponse(result, chatId);
                
                // Автоматическая запись в Google Sheets для всех сообщений
                // НО НЕ во время настройки команды
                if (!context.teamSetupState || !context.teamSetupState.step) {
                    await writeToGoogleSheets(text, context, chatId);
                } else {
                    console.log('🔄 Пропускаем запись в Google Sheets - пользователь в процессе настройки команды');
                }
                
            } catch (error) {
                console.error('LLM processing error:', error);
                // Fallback to simple responses
                if (text.toLowerCase().includes('потратил') || text.toLowerCase().includes('расход')) {
                    await bot.sendMessage(chatId, `💰 Записал расход: ${text}\n\n⚠️ LLM сервис недоступен, используем простой режим.`);
                    // Записываем в Google Sheets даже в fallback режиме, но не во время настройки команды
                    if (!context.teamSetupState || !context.teamSetupState.step) {
                        await writeToGoogleSheets(text, context, chatId);
                    }
                } else if (text.toLowerCase().includes('задача') || text.toLowerCase().includes('todo')) {
                    await bot.sendMessage(chatId, `📋 Записал задачу: ${text}\n\n⚠️ LLM сервис недоступен, используем простой режим.`);
                    // Записываем в Google Sheets даже в fallback режиме, но не во время настройки команды
                    if (!context.teamSetupState || !context.teamSetupState.step) {
                        await writeToGoogleSheets(text, context, chatId);
                    }
                } else {
                    await bot.sendMessage(chatId, `🤖 Получил ваше сообщение: "${text}"\n\n⚠️ LLM сервис недоступен, используем простой режим.`);
                    // Записываем в Google Sheets даже в fallback режиме, но не во время настройки команды
                    if (!context.teamSetupState || !context.teamSetupState.step) {
                        await writeToGoogleSheets(text, context, chatId);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Message handling error:', error);
        console.error('Error stack:', error.stack);
        
        try {
            const chatId = msg.chat.id; // Добавляем эту строку
            await bot.sendMessage(chatId, `❌ Произошла ошибка: ${error.message}

Попробуйте:
• /start - перезапустить бота
• /help - справка по командам

Или обратитесь к администратору.`);
        } catch (botError) {
            console.error('Bot send error:', botError);
        }
    }
});

// Handle callback queries (button clicks) for polling mode
bot.on('callback_query', async (query) => {
    console.log('🔘 Получен callback query:', JSON.stringify(query, null, 2));
    
    try {
        await handleCallbackQuery(query);
    } catch (error) {
        console.error('Callback query error:', error);
        console.error('Error stack:', error.stack);
        
        try {
            await bot.answerCallbackQuery(query.id, {
                text: `❌ Ошибка: ${error.message}`,
                show_alert: true
            });
        } catch (answerError) {
            console.error('Answer callback error:', answerError);
        }
    }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Setup webhook for production
async function setupWebhook() {
    try {
        if (process.env.NODE_ENV === 'production') {
            const webhookUrl = `https://${process.env.VERCEL_URL || 'ai-assist-62v3e0kmt-irinashafeevas-projects.vercel.app'}/webhook`;
            
            console.log(`🔧 Настраиваем webhook: ${webhookUrl}`);
            
            // Удаляем старый webhook
            await bot.deleteWebhook();
            console.log('🗑️ Старый webhook удален');
            
            // Устанавливаем новый webhook
            await bot.setWebhook(webhookUrl);
            console.log(`✅ Webhook установлен: ${webhookUrl}`);
            
            // Проверяем статус webhook
            const webhookInfo = await bot.getWebhookInfo();
            console.log('📋 Webhook статус:', {
                url: webhookInfo.url,
                pending_update_count: webhookInfo.pending_update_count,
                last_error_date: webhookInfo.last_error_date,
                last_error_message: webhookInfo.last_error_message
            });
            
        } else {
            console.log(`⚠️ Режим разработки - используем polling`);
            if (!bot.isPolling()) {
                bot.startPolling();
            }
            console.log(`✅ Бот запущен в polling режиме`);
        }
    } catch (error) {
        console.error('❌ Ошибка установки webhook:', error.message);
        console.log(`⚠️ Переключаемся на polling режим`);
        try {
            if (!bot.isPolling()) {
                bot.startPolling();
            }
            console.log(`✅ Бот запущен в polling режиме (fallback)`);
        } catch (pollingError) {
            console.error('❌ Критическая ошибка запуска polling:', pollingError.message);
        }
    }
}

// Initialize services
const toolsService = new ToolsService();
const routingService = new RoutingService();
const reminderService = new ReminderService(bot);

// Register connectors
routingService.registerConnector('telegram_dm', new TelegramConnector(bot));
routingService.registerConnector('telegram_channel', new TelegramChannelConnector(bot));
routingService.registerConnector('google_sheets', new GoogleSheetsConnector());
routingService.registerConnector('google_calendar', new GoogleCalendarConnector());

// Middleware
app.use(cors({
    origin: [
        'https://bespoke-platypus-5c4604.netlify.app',
        'https://ai-assist-62v3e0kmt-irinashafeevas-projects.vercel.app',
        'http://localhost:3000',
        'http://localhost:3009'
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
    console.log(`🔧 Получаю контекст для чата ${tgChatId}...`);
    
    try {
        // Get or create tenant (for now, one tenant per chat)
        console.log('1️⃣ Ищу существующий tenant...');
        let tenant = await getTenant(tgChatId);
        console.log('Tenant найден:', tenant);
        
        if (!tenant) {
            console.log('2️⃣ Tenant не найден, создаю новый...');
            tenant = await createTenant(tgChatId);
            console.log('Новый tenant создан:', tenant);
        }

        // Get or create user
        console.log('3️⃣ Ищу существующего пользователя...');
        let user = await getUser(tenant.id, tgChatId);
        console.log('User найден:', user);
        
        if (!user) {
            console.log('4️⃣ User не найден, создаю нового...');
            user = await createUser(tenant.id, tgChatId);
            console.log('Новый user создан:', user);
        }

        // Проверяем, не истекло ли время настройки команды (30 минут)
        if (user.meta?.teamSetupState && user.meta.teamSetupState.createdAt) {
            console.log(`🔍 Проверяю состояние настройки команды:`, user.meta.teamSetupState);
            
            const createdAt = new Date(user.meta.teamSetupState.createdAt);
            const now = new Date();
            const timeDiff = now - createdAt;
            const timeoutMinutes = 30;
            
            console.log(`⏰ Время создания: ${createdAt.toISOString()}`);
            console.log(`⏰ Текущее время: ${now.toISOString()}`);
            console.log(`⏰ Разница: ${Math.round(timeDiff / 60000)} минут`);
            
            if (timeDiff > timeoutMinutes * 60 * 1000) {
                console.log(`⏰ Время настройки команды истекло для пользователя ${user.id}, очищаем состояние`);
                
                // Очищаем истекшее состояние
                const { error: clearError } = await supabase
                    .from('users')
                    .update({ 
                        meta: {
                            ...user.meta,
                            teamSetupState: null
                        }
                    })
                    .eq('id', user.id);
                
                if (clearError) {
                    console.error('❌ Ошибка очистки истекшего состояния:', clearError);
                }
                
                user.meta.teamSetupState = null;
            } else {
                console.log(`✅ Время настройки команды НЕ истекло, состояние активно`);
            }
        } else {
            console.log(`ℹ️ Состояние настройки команды отсутствует`);
        }
        
        const context = {
            tenant_id: tenant.id,
            user_id: user.id,
            tg_chat_id: tgChatId,
            meta: user.meta || {},
            teamSetupState: user.meta?.teamSetupState || null
        };
        
        console.log('✅ Контекст успешно создан:', context);
        console.log(`🔍 teamSetupState в контексте:`, context.teamSetupState);
        console.log(`🔍 Проверка условия: context.teamSetupState && context.teamSetupState.step = ${!!(context.teamSetupState && context.teamSetupState.step)}`);
        return context;
        
    } catch (error) {
        console.error('❌ Ошибка получения контекста:', error);
        console.error('Stack trace:', error.stack);
        
        // Fallback to simple context if database fails
        const fallbackContext = {
            tenant_id: `fallback_tenant_${tgChatId}`,
            user_id: `fallback_user_${tgChatId}`,
            tg_chat_id: tgChatId
        };
        
        console.log('⚠️ Использую fallback контекст:', fallbackContext);
        return fallbackContext;
    }
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
    try {
        // Create user with current schema
        let userData = {
            tenant_id: tenantId,
            tg_chat_id: tgChatId,
            username: `user_${tgChatId}`,
            first_name: 'User',
            last_name: tgChatId,
            tier: 'free', // Используем tier вместо role, значение 'free' для базового уровня
            meta: {} // Инициализируем пустую meta колонку
        };
        
        const { data, error } = await supabase
            .from('users')
            .insert(userData)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Ошибка создания пользователя:', error);
        throw error;
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
            
            // Проверяем, находимся ли в процессе настройки команды
            if (context.teamSetupState && context.teamSetupState.step) {
                console.log(`🔄 Продолжаем настройку команды, шаг: ${context.teamSetupState.step}`);
                console.log(`📋 Состояние:`, JSON.stringify(context.teamSetupState, null, 2));
                console.log(`🚀 ВЫЗЫВАЕМ handleTeamSetupStep с параметрами: chatId=${chatId}, text="${text}"`);
                
                try {
                    const updatedContext = await handleTeamSetupStep(chatId, context, text);
                    console.log('✅ handleTeamSetupStep выполнен успешно');
                    
                    // Обновляем контекст, если он был изменен
                    if (updatedContext) {
                        Object.assign(context, updatedContext);
                        console.log('🔄 Контекст обновлен после handleTeamSetupStep');
                    }
                } catch (teamSetupError) {
                    console.error('❌ Ошибка в handleTeamSetupStep:', teamSetupError);
                    console.error('Stack:', teamSetupError.stack);
                    
                    // Очищаем состояние при ошибке
                    context.teamSetupState = null;
                    
                    // Отправляем сообщение об ошибке пользователю
                    await bot.sendMessage(chatId, `❌ Произошла ошибка при настройке команды: ${teamSetupError.message}

Попробуйте:
• /team - вернуться к управлению командой
• /start - перезапустить бота`);
                }
                return;
            }
            
            console.log('ℹ️ Пользователь НЕ в процессе настройки команды, продолжаем обычную обработку');
            
            // Автоматически обновляем Telegram Chat ID для участников команды
            await updateTeamMemberTelegramId(chatId, context);
            
            // Убираем автоматическую логику предложения участников - теперь это делается только через /team
            
            try {
                const result = await llmService.processMessage(text, context);
                console.log('LLM result:', result);
                await handleLLMResponse(result, chatId);
                
                // Автоматическая запись в Google Sheets для всех сообщений
                // НО НЕ во время настройки команды
                if (!context.teamSetupState || !context.teamSetupState.step) {
                    await writeToGoogleSheets(text, context, chatId);
                } else {
                    console.log('🔄 Пропускаем запись в Google Sheets - пользователь в процессе настройки команды');
                }
                
            } catch (error) {
                console.error('LLM processing error:', error);
                // Fallback to simple responses
                if (text.toLowerCase().includes('потратил') || text.toLowerCase().includes('расход')) {
                    await bot.sendMessage(chatId, `💰 Записал расход: ${text}\n\n⚠️ LLM сервис недоступен, используем простой режим.`);
                    // Записываем в Google Sheets даже в fallback режиме, но не во время настройки команды
                    if (!context.teamSetupState || !context.teamSetupState.step) {
                        await writeToGoogleSheets(text, context, chatId);
                    }
                } else if (text.toLowerCase().includes('задача') || text.toLowerCase().includes('todo')) {
                    await bot.sendMessage(chatId, `📋 Записал задачу: ${text}\n\n⚠️ LLM сервис недоступен, используем простой режим.`);
                    // Записываем в Google Sheets даже в fallback режиме, но не во время настройки команды
                    if (!context.teamSetupState || !context.teamSetupState.step) {
                        await writeToGoogleSheets(text, context, chatId);
                    }
                } else {
                    await bot.sendMessage(chatId, `🤖 Получил ваше сообщение: "${text}"\n\n⚠️ LLM сервис недоступен, используем простой режим.`);
                    // Записываем в Google Sheets даже в fallback режиме, но не во время настройки команды
                    if (!context.teamSetupState || !context.teamSetupState.step) {
                        await writeToGoogleSheets(text, context, chatId);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Message handling error:', error);
        console.error('Error stack:', error.stack);
        
        try {
            const chatId = msg.chat.id; // Добавляем эту строку
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

👥 Команда:
"Задача для Маши: купить продукты"
"Попроси Ваню позвонить в банк"

🔍 Поиск:
"Найди все расходы за неделю"
"Покажи задачи Ивана"

💡 Команды: /start, /help, /status, /team, /setup, /sheets`);
            break;

        case '/status':
            if (context.teamSetupState && context.teamSetupState.step) {
                const state = context.teamSetupState;
                let statusMessage = `🔄 **Текущий статус настройки команды**\n\n`;
                statusMessage += `📝 **Шаг:** ${state.step}\n`;
                statusMessage += `⏰ **Начато:** ${new Date(state.createdAt).toLocaleString('ru-RU')}\n`;
                statusMessage += `🔄 **Обновлено:** ${new Date(state.lastUpdated).toLocaleString('ru-RU')}\n\n`;
                
                if (state.memberData) {
                    statusMessage += `👤 **Данные участника:**\n`;
                    if (state.memberData.display_name) {
                        statusMessage += `• Имя: ${state.memberData.display_name}\n`;
                    }
                    if (state.memberData.aliases && state.memberData.aliases.length > 0) {
                        statusMessage += `• Псевдонимы: ${state.memberData.aliases.join(', ')}\n`;
                    }
                    if (state.memberData.tg_chat_id) {
                        statusMessage += `• Telegram: ${state.memberData.tg_chat_id}\n`;
                    }
                    if (state.memberData.gcal_email) {
                        statusMessage += `• Google Calendar: ${state.memberData.gcal_email}\n`;
                    }
                }
                
                statusMessage += `\n💡 **Доступные команды:**\n`;
                statusMessage += `• "отмена" - отменить добавление\n`;
                statusMessage += `• "пропустить" - пропустить текущий шаг\n`;
                statusMessage += `• /team - вернуться к управлению командой`;
                
                await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
            } else {
                await bot.sendMessage(chatId, `ℹ️ **Статус:** Настройка команды не активна

💡 **Используйте:** /team для управления командой`);
            }
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
            
        case '/team':
            await handleTeamCommand(chatId, context);
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

async function getCurrentIntegrations(tenantId) {
    try {
        // Получаем destinations (Google Sheets)
        const { data: destinations } = await supabase
            .from('destinations')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('provider', 'google');
            
        // Получаем team members
        const { data: members } = await supabase
            .from('team_members')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);
            
        return {
            sheets: destinations?.filter(d => d.type === 'sheet') || [],
            calendars: destinations?.filter(d => d.type === 'calendar') || [],
            members: members || []
        };
    } catch (error) {
        console.error('❌ Ошибка получения интеграций:', error);
        return { sheets: [], calendars: [], members: [] };
    }
}

async function handleSetupCommand(chatId, context) {
    // Проверяем текущие интеграции
    const integrations = await getCurrentIntegrations(context.tenant_id);
    
    let statusMessage = `⚙️ Настройка интеграций\n\n`;
    statusMessage += `📊 Текущее состояние:\n`;
    
    // Google Sheets
    if (integrations.sheets.length > 0) {
        const sheetsId = integrations.sheets[0].external_id.split('!')[0];
        statusMessage += `✅ Google Sheets: подключены (${integrations.sheets.length} листов)\n`;
        statusMessage += `   📋 ID: ${sheetsId}\n`;
    } else {
        statusMessage += `❌ Google Sheets: не настроены\n`;
    }
    
    // Team Members
    if (integrations.members.length > 0) {
        statusMessage += `✅ Команда: ${integrations.members.length} участников\n`;
        integrations.members.forEach(member => {
            const hasPhone = member.tg_chat_id ? '📱' : '❌';
            statusMessage += `   ${hasPhone} ${member.display_name}\n`;
        });
    } else {
        statusMessage += `❌ Команда: участники не добавлены\n`;
    }
    
    // Google Calendar
    const hasCalendar = integrations.members.some(m => m.gcal_connection_id);
    if (hasCalendar) {
        statusMessage += `✅ Google Calendar: настроен\n`;
    } else {
        statusMessage += `❌ Google Calendar: не настроен\n`;
    }
    
    statusMessage += `\n🔧 Что настроить?`;

    await bot.sendMessage(chatId, statusMessage, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📊 Google Sheets', callback_data: 'setup_sheets' },
                    { text: '👥 Команда', callback_data: 'setup_team' }
                ],
                [
                    { text: '📅 Google Calendar', callback_data: 'setup_calendar' },
                    { text: '🔄 Обновить статус', callback_data: 'setup_refresh' }
                ],
                [
                    { text: '❌ Отмена', callback_data: 'setup_cancel' }
                ]
            ]
        }
    });
}

async function handleTeamCommand(chatId, context) {
    try {
        // Проверяем текущих участников команды
        const { data: teamMembers, error: membersError } = await supabase
            .from('team_members')
            .select('id, display_name, aliases, meta')
            .eq('tenant_id', context.tenant_id)
            .eq('is_active', true);

        if (membersError) {
            console.error('❌ Ошибка получения участников команды:', membersError);
            await bot.sendMessage(chatId, '❌ Ошибка получения данных команды');
            return;
        }

        let message = `👥 **Управление командой**\n\n`;
        
        if (teamMembers && teamMembers.length > 0) {
            message += `✅ **Участники команды (${teamMembers.length}):**\n`;
            teamMembers.forEach((member, index) => {
                message += `${index + 1}. **${member.display_name}**\n`;
                if (member.aliases && member.aliases.length > 0) {
                    message += `   🏷️ Псевдонимы: ${member.aliases.join(', ')}\n`;
                }
                if (member.meta?.tg_chat_id) {
                    message += `   📱 Telegram: настроен\n`;
                }
                if (member.meta?.gcal_email) {
                    message += `   📅 Google Calendar: ${member.meta.gcal_email}\n`;
                }
                message += '\n';
            });
        } else {
            message += `📝 **Команда пока не настроена**\n\n`;
        }

        // Проверяем, есть ли незавершенная настройка команды
        if (context.teamSetupState && context.teamSetupState.step) {
            message += `⚠️ **Незавершенная настройка команды**\n`;
            message += `• Текущий шаг: ${context.teamSetupState.step}\n`;
            message += `• Начато: ${new Date(context.teamSetupState.createdAt).toLocaleString('ru-RU')}\n\n`;
        }
        
        message += `🔧 **Что можно настроить:**\n`;
        message += `• Добавить новых участников команды\n`;
        message += `• Настроить Telegram уведомления\n`;
        message += `• Подключить Google Calendar\n`;
        message += `• Управлять псевдонимами\n\n`;

        message += `📅 **Примеры использования:**\n`;
        message += `• "Напомнить Ире о встрече завтра в 15:00"\n`;
        message += `• "Задача для Маши: купить продукты"\n`;
        message += `• "Попроси Ваню позвонить в банк"\n\n`;

        message += `💡 **Выберите действие:**`;

        const keyboard = [];
        
        if (teamMembers && teamMembers.length > 0) {
            keyboard.push([
                { text: '👤 Добавить участника', callback_data: 'team_add_member' },
                { text: '✏️ Редактировать', callback_data: 'team_edit_members' }
            ]);
            keyboard.push([
                { text: '📱 Telegram', callback_data: 'team_setup_telegram' },
                { text: '📅 Google Calendar', callback_data: 'team_setup_calendar' }
            ]);
        } else {
            keyboard.push([
                { text: '👤 Добавить первого участника', callback_data: 'team_add_member' }
            ]);
        }
        
        // Добавляем кнопку для продолжения незавершенной настройки
        if (context.teamSetupState && context.teamSetupState.step) {
            keyboard.push([
                { text: '🔄 Продолжить настройку', callback_data: 'team_continue_setup' }
            ]);
        }
        
        keyboard.push([
            { text: '📋 Инструкции', callback_data: 'team_instructions' },
            { text: '🔙 Назад', callback_data: 'setup_cancel' }
        ]);

        await bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        console.error('❌ Ошибка команды /team:', error);
        await bot.sendMessage(chatId, '❌ Ошибка отображения меню команды');
    }
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
        
        // Test mode - just show success message
        await bot.sendMessage(chatId, `✅ Google Sheets настроен! (тестовый режим)

📊 ID таблицы: ${spreadsheetId}
📝 Данные будут сохраняться в листы:
• Расходы
• Задачи  
• Закладки

⚠️ Это тестовый режим - реальное подключение не настроено.
Для полной настройки нужна база данных и Google API.`);
        
        // Try to save to database if available
        try {
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
                
            if (error) {
                console.log('⚠️ Не удалось сохранить destinations:', error.message);
            } else {
                console.log('✅ Destinations сохранены в базу данных');
                await bot.sendMessage(chatId, `🎉 Google Sheets полностью настроен!\n\nДанные будут автоматически сохраняться в вашу таблицу.`);
            }
            
        } catch (dbError) {
            console.log('⚠️ Ошибка сохранения в базу данных:', dbError.message);
        }
        
    } catch (error) {
        console.error('Sheets setup error:', error);
        await bot.sendMessage(chatId, `❌ Ошибка настройки Google Sheets: ${error.message}

Попробуйте позже или используйте режим "только в памяти".`);
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

// Middleware для проверки webhook secret отключен для отладки
// app.use('/webhook', (req, res, next) => {
//     if (req.method === 'POST') {
//         const secretToken = req.headers['x-telegram-bot-api-secret-token'];
//         const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
//         
//         console.log('🔍 Webhook debug:', {
//             secretToken,
//             expectedSecret,
//             headers: req.headers
//         });
//         
//         if (!expectedSecret || secretToken !== expectedSecret) {
//             console.log('❌ Webhook secret token mismatch');
//             return res.status(401).json({ error: 'Unauthorized' });
//         }
//     }
//     next();
// });

// Webhook for Telegram
app.get('/webhook', (req, res) => {
    res.json({ 
        status: 'webhook_ready',
        message: 'Webhook endpoint is ready for POST requests',
        method: 'POST only'
    });
});

app.post('/webhook', async (req, res) => {
    console.log('🔍 Webhook called with body:', req.body);
    
    try {
        const update = req.body;
        
        if (!update) {
            console.log('❌ No update in request body');
            return res.json({ ok: true });
        }
        
        // Handle message
        if (update.message) {
            console.log('📨 Processing message from webhook:', update.message);
            try {
                await processMessage(update.message);
                console.log('✅ Message processed successfully');
            } catch (msgError) {
                console.error('❌ Error processing message:', msgError);
            }
        }
        
        // Handle callback queries (inline buttons)
        if (update.callback_query) {
            console.log('🔘 Processing callback query from webhook');
            try {
                await handleCallbackQuery(update.callback_query);
                console.log('✅ Callback query processed successfully');
            } catch (callbackError) {
                console.error('❌ Error processing callback query:', callbackError);
            }
        }
        
        console.log('✅ Webhook response sent');
        res.json({ ok: true });
    } catch (error) {
        console.error('❌ Webhook error:', error);
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
                await handleTeamCommand(chatId, context);
                break;
                
            case 'setup_refresh':
                await bot.answerCallbackQuery(query.id, { text: 'Обновление статуса...' });
                await handleSetupCommand(chatId, context);
                break;
                
            case 'setup_calendar':
                await bot.answerCallbackQuery(query.id, { text: 'Настройка календаря...' });
                await bot.sendMessage(chatId, `📅 Настройка Google Calendar
                
Для настройки календаря:

1️⃣ Убедитесь, что поделились календарем с сервисным аккаунтом:
📧 ai-assistant-bot-270@ai-assistant-sheets.iam.gserviceaccount.com

2️⃣ Дайте права "Внесение изменений в мероприятия"

3️⃣ Используйте /team для добавления участников и привязки к календарю

✅ Вы уже поделились календарем - можно переходить к настройке участников!`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '👥 Настроить команду', callback_data: 'setup_team' },
                                { text: '🔙 Назад', callback_data: 'setup_refresh' }
                            ]
                        ]
                    }
                });
                break;
                
            case 'setup_cancel':
                await bot.answerCallbackQuery(query.id, { text: 'Отменено' });
                await bot.sendMessage(chatId, '❌ Настройка отменена. Для возврата используйте /setup');
                break;

            case 'team_add_member':
                await bot.answerCallbackQuery(query.id, { text: 'Добавление участника...' });
                await startAddTeamMember(chatId, context);
                break;

            case 'team_edit_members':
                await bot.answerCallbackQuery(query.id, { text: 'Редактирование участников...' });
                await showEditTeamMembers(chatId, context);
                break;

            case 'team_setup_telegram':
                await bot.answerCallbackQuery(query.id, { text: 'Настройка Telegram...' });
                await setupTeamTelegram(chatId, context);
                break;

            case 'team_setup_calendar':
                await bot.answerCallbackQuery(query.id, { text: 'Настройка Google Calendar...' });
                await setupTeamCalendar(chatId, context);
                break;

            case 'team_instructions':
                await bot.answerCallbackQuery(query.id, { text: 'Инструкции...' });
                await showTeamInstructions(chatId);
                break;

            case 'team_continue_setup':
                await bot.answerCallbackQuery(query.id, { text: 'Продолжаем настройку...' });
                await continueTeamSetup(chatId, context);
                break;

            case 'team_save_member':
                await bot.answerCallbackQuery(query.id, { text: 'Сохранение...' });
                await saveTeamMember(chatId, context);
                break;

            case 'team_cancel_add':
                await bot.answerCallbackQuery(query.id, { text: 'Отменено' });
                try {
                    // Очищаем состояние из базы данных
                    const { error } = await supabase
                        .from('users')
                        .update({ 
                            meta: {
                                ...context.meta,
                                teamSetupState: null
                            }
                        })
                        .eq('id', context.user_id);
                    
                    if (error) {
                        console.error('❌ Ошибка очистки состояния при отмене:', error);
                    } else {
                        console.log(`✅ Состояние настройки команды очищено при отмене для пользователя ${context.user_id}`);
                    }
                    
                    // Обновляем локальный контекст
                    context.teamSetupState = null;
                    context.meta.teamSetupState = null;
                    
                    await bot.sendMessage(chatId, '❌ Добавление участника отменено. Используйте /team для возврата к управлению командой.');
                } catch (error) {
                    console.error('❌ Ошибка при отмене добавления участника:', error);
                    await bot.sendMessage(chatId, '❌ Ошибка при отмене. Используйте /team для возврата к управлению командой.');
                }
                break;



            case 'team_check_telegram':
                await bot.answerCallbackQuery(query.id, { text: 'Проверка...' });
                await checkTeamTelegramStatus(chatId, context);
                break;

            case 'team_calendar_instructions':
                await bot.answerCallbackQuery(query.id, { text: 'Инструкции...' });
                await showCalendarSetupInstructions(chatId);
                break;

            case (data.match(/^edit_member_(\d+)$/) || {}).input:
                const memberId = data.match(/^edit_member_(\d+)$/)?.[1];
                if (memberId) {
                    await bot.answerCallbackQuery(query.id, { text: 'Редактирование...' });
                    await editTeamMember(chatId, context, memberId);
                }
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

// Team management functions
async function startAddTeamMember(chatId, context) {
    try {
        // Инициализируем состояние настройки команды
        const teamSetupState = {
            step: 'name',
            memberData: {},
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
        // Сохраняем состояние в базе данных
        const { error } = await supabase
            .from('users')
            .update({ 
                meta: {
                    ...context.meta,
                    teamSetupState: teamSetupState
                }
            })
            .eq('id', context.user_id);

        if (error) throw error;

        console.log(`✅ Состояние настройки команды инициализировано для пользователя ${context.user_id}`);

        await bot.sendMessage(chatId, `👤 **Добавление участника команды**

Введите имя участника (или нажмите Отмена для возврата):

💡 **Примеры:** Ира, Маша, Ваня, Алексей
💡 **Команды:** отмена - отменить добавление

ℹ️ **Важно:** Во время настройки команды ваши сообщения НЕ записываются в заметки Google Sheets.`);
    } catch (error) {
        console.error('❌ Ошибка добавления участника:', error);
        console.error('Stack trace:', error.stack);
        
        await bot.sendMessage(chatId, `❌ Ошибка добавления участника: ${error.message}

💡 **Что делать:**
• Попробуйте еще раз через /team
• Если ошибка повторяется, обратитесь к администратору`);
    }
}



async function showEditTeamMembers(chatId, context) {
    try {
        const { data: teamMembers, error: membersError } = await supabase
            .from('team_members')
            .select('id, display_name, aliases, meta')
            .eq('tenant_id', context.tenant_id)
            .eq('is_active', true);

        if (membersError) throw membersError;

        if (!teamMembers || teamMembers.length === 0) {
            await bot.sendMessage(chatId, '📝 Участники команды не найдены. Добавьте первого участника!');
            return;
        }

        let message = `✏️ **Редактирование участников команды**\n\n`;
        message += `Выберите участника для редактирования:\n\n`;

        const keyboard = teamMembers.map((member, index) => [
            { 
                text: `${index + 1}. ${member.display_name}`, 
                callback_data: `edit_member_${member.id}` 
            }
        ]);

        keyboard.push([
            { text: '🔙 Назад', callback_data: 'setup_team' }
        ]);

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        console.error('❌ Ошибка редактирования участников:', error);
        await bot.sendMessage(chatId, '❌ Ошибка отображения списка участников');
    }
}

async function setupTeamTelegram(chatId, context) {
    try {
        const { data: teamMembers, error: membersError } = await supabase
            .from('team_members')
            .select('id, display_name, aliases, meta')
            .eq('tenant_id', context.tenant_id)
            .eq('is_active', true)
            .or('meta->tg_chat_id.is.null,meta->tg_chat_id.eq.null');

        if (membersError) throw membersError;

        if (!teamMembers || teamMembers.length === 0) {
            await bot.sendMessage(chatId, `✅ Все участники команды уже настроены для Telegram уведомлений!

📱 **Как получить Chat ID:**
1. Участник должен написать боту любое сообщение
2. Бот автоматически получит его Chat ID
3. Или используйте @userinfobot для получения ID`);
            return;
        }

        let message = `📱 **Настройка Telegram уведомлений**\n\n`;
        message += `Следующие участники не настроены для Telegram:\n\n`;

        teamMembers.forEach((member, index) => {
            message += `${index + 1}. **${member.display_name}**\n`;
        });

        message += `\n📋 **Инструкции для участников:**\n`;
        message += `1️⃣ Напишите боту любое сообщение\n`;
        message += `2️⃣ Бот автоматически получит ваш Chat ID\n`;
        message += `3️⃣ Или используйте @userinfobot\n\n`;
        message += `💡 После настройки участники смогут получать:\n`;
        message += `• Уведомления о задачах\n`;
        message += `• Напоминания о встречах\n`;
        message += `• Обновления по проектам`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Проверить статус', callback_data: 'team_check_telegram' },
                        { text: '🔙 Назад', callback_data: 'setup_team' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('❌ Ошибка настройки Telegram:', error);
        await bot.sendMessage(chatId, '❌ Ошибка настройки Telegram');
    }
}

async function setupTeamCalendar(chatId, context) {
    try {
        const { data: teamMembers, error: membersError } = await supabase
            .from('team_members')
            .select('*')
            .eq('tenant_id', context.tenant_id)
            .eq('is_active', true)
            .is('meta->gcal_email', null);

        if (membersError) throw membersError;

        if (!teamMembers || teamMembers.length === 0) {
            await bot.sendMessage(chatId, `✅ Все участники команды уже настроены для Google Calendar!

📅 **Что настроено:**
• Google Calendar подключения
• Автоматическое создание событий
• Напоминания в календарях участников`);
            return;
        }

        let message = `📅 **Настройка Google Calendar**\n\n`;
        message += `Следующие участники не настроены для Google Calendar:\n\n`;

        teamMembers.forEach((member, index) => {
            message += `${index + 1}. **${member.display_name}**\n`;
        });

        message += `\n🔧 **Что нужно настроить:**\n`;
        message += `1️⃣ Google Service Account\n`;
        message += `2️⃣ Доступ к календарям участников\n`;
        message += `3️⃣ Calendar ID каждого участника\n\n`;
        message += `💡 **Преимущества:**\n`;
        message += `• Автоматические напоминания\n`;
        message += `• Синхронизация с календарями\n`;
        message += `• Управление встречами команды`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📋 Инструкции по настройке', callback_data: 'team_calendar_instructions' },
                        { text: '🔙 Назад', callback_data: 'setup_team' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('❌ Ошибка настройки Google Calendar:', error);
        await bot.sendMessage(chatId, '❌ Ошибка настройки Google Calendar');
    }
}

async function showTeamInstructions(chatId) {
    try {
        const message = `📋 **Инструкции по настройке команды**\n\n`;

        message += `👥 **1. Добавление участников**\n`;
        message += `• Используйте кнопку "Добавить участника"\n`;
        message += `• Укажите имя и псевдонимы\n`;
        message += `• Добавьте Telegram Chat ID\n`;
        message += `• Подключите Google Calendar\n\n`;

        message += `📱 **2. Настройка Telegram**\n`;
        message += `• Участник пишет боту сообщение\n`;
        message += `• Бот автоматически получит его Chat ID\n`;
        message += `• Или используйте @userinfobot\n\n`;

        message += `📅 **3. Настройка Google Calendar**\n`;
        message += `• Создайте Service Account\n`;
        message += `• Откройте доступ к календарям\n`;
        message += `• Укажите Calendar ID участников\n\n`;

        message += `🎯 **4. Использование**\n`;
        message += `• "Напомнить Ире о встрече завтра в 15:00"\n`;
        message += `• "Задача для Маши: купить продукты"\n`;
        message += `• "Попроси Ваню позвонить в банк"\n\n`;

        message += `💡 **Советы:**\n`;
        message += `• Используйте псевдонимы для удобства\n`;
        message += `• Настройте все интеграции для полной функциональности\n`;
        message += `• Тестируйте на простых задачах`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔙 Назад', callback_data: 'setup_team' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('❌ Ошибка показа инструкций:', error);
        await bot.sendMessage(chatId, '❌ Ошибка показа инструкций');
    }
}

async function saveTeamMember(chatId, context) {
    try {
        const state = context.teamSetupState;
        if (!state || !state.memberData) {
            await bot.sendMessage(chatId, '❌ Данные участника не найдены. Начните заново с /team');
            return;
        }

        // Сохраняем участника в базу данных
        const { data: member, error: saveError } = await supabase
            .from('team_members')
            .insert({
                tenant_id: context.tenant_id,
                display_name: state.memberData.display_name,
                aliases: state.memberData.aliases,
                gcal_connection_id: null,
                meta: {
                    tg_chat_id: state.memberData.tg_chat_id,
                    gcal_email: state.memberData.gcal_email,
                    setup_date: new Date().toISOString()
                },
                is_active: true
            })
            .select()
            .single();

        if (saveError) throw saveError;

        // Очищаем состояние настройки из базы данных
        const { error: clearError } = await supabase
            .from('users')
            .update({ 
                meta: {
                    ...context.meta,
                    teamSetupState: null
                }
            })
            .eq('id', context.user_id);

        if (clearError) {
            console.error('⚠️ Ошибка очистки состояния настройки:', clearError);
        } else {
            console.log(`✅ Состояние настройки команды очищено для пользователя ${context.user_id}`);
        }
        
        // Обновляем локальный контекст
        context.teamSetupState = null;
        context.meta.teamSetupState = null;

        let message = `✅ **Участник команды добавлен!**\n\n`;
        message += `👤 **Имя:** ${member.display_name}\n`;
        if (member.aliases && member.aliases.length > 0) {
            message += `🏷️ **Псевдонимы:** ${member.aliases.join(', ')}\n`;
        }
        if (member.meta?.tg_chat_id) {
            message += `📱 **Telegram:** настроен\n`;
        }
        if (member.meta?.gcal_email) {
            message += `📅 **Google Calendar:** ${member.meta.gcal_email}\n`;
        }

        message += `\n🎯 **Теперь можно использовать:**\n`;
        message += `• "Задача для ${member.display_name}: [описание]"\n`;
        message += `• "Напомнить ${member.display_name} о [событии]"\n`;
        message += `• "Попроси ${member.display_name} [действие]"`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '👤 Добавить еще', callback_data: 'team_add_member' },
                        { text: '🔙 К команде', callback_data: 'setup_team' }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('❌ Ошибка сохранения участника команды:', error);
        await bot.sendMessage(chatId, '❌ Ошибка сохранения участника команды. Попробуйте еще раз.');
        
        // Очищаем состояние при ошибке
        context.teamSetupState = null;
        context.meta.teamSetupState = null;
    }
}

async function checkTeamTelegramStatus(chatId, context) {
    try {
        const { data: teamMembers, error: membersError } = await supabase
            .from('team_members')
            .select('*')
            .eq('tenant_id', context.tenant_id)
            .eq('is_active', true);

        if (membersError) throw membersError;

        if (!teamMembers || teamMembers.length === 0) {
            await bot.sendMessage(chatId, '📝 Участники команды не найдены.');
            return;
        }

        let message = `📱 **Статус Telegram уведомлений**\n\n`;

        teamMembers.forEach((member, index) => {
            message += `${index + 1}. **${member.display_name}**\n`;
            if (member.meta?.tg_chat_id) {
                message += `   ✅ Telegram: настроен (${member.meta.tg_chat_id})\n`;
            } else {
                message += `   ❌ Telegram: не настроен\n`;
            }
            message += '\n';
        });

        const configuredCount = teamMembers.filter(m => m.meta?.tg_chat_id).length;
        const totalCount = teamMembers.length;

        message += `📊 **Итого:** ${configuredCount}/${totalCount} настроено\n\n`;

        if (configuredCount < totalCount) {
            message += `💡 **Для настройки:**\n`;
            message += `• Участник пишет боту сообщение\n`;
            message += `• Или используйте @userinfobot\n`;
            message += `• Затем нажмите "Проверить статус"`;
        }

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔄 Проверить снова', callback_data: 'team_check_telegram' },
                        { text: '🔙 Назад', callback_data: 'setup_team' }
                    ]
                ]
            }
        });

    } catch (error) {
        console.error('❌ Ошибка проверки статуса Telegram:', error);
        await bot.sendMessage(chatId, '❌ Ошибка проверки статуса Telegram');
    }
}

async function updateTeamMemberTelegramId(chatId, context) {
    try {
        // Проверяем, есть ли участники команды без Telegram Chat ID
        const { data: membersWithoutTelegram, error: checkError } = await supabase
            .from('team_members')
            .select('id, display_name, aliases, meta')
            .eq('tenant_id', context.tenant_id)
            .eq('is_active', true)
            .or('meta->tg_chat_id.is.null,meta->tg_chat_id.eq.null');

        if (checkError || !membersWithoutTelegram || membersWithoutTelegram.length === 0) {
            return; // Нет участников для обновления
        }

        // Получаем информацию о пользователе из контекста
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('tenant_id', context.tenant_id)
            .eq('tg_chat_id', chatId.toString())
            .single();

        if (userError || !user) {
            return; // Пользователь не найден
        }

        // Ищем участника команды по имени пользователя
        const member = membersWithoutTelegram.find(m => 
            m.display_name.toLowerCase() === user.display_name?.toLowerCase() ||
            (m.aliases && m.aliases.some(alias => 
                alias.toLowerCase() === user.display_name?.toLowerCase()
            ))
        );

        if (member) {
            // Обновляем Telegram Chat ID для участника команды в meta колонке
            const { error: updateError } = await supabase
                .from('team_members')
                .update({ 
                    meta: {
                        ...member.meta,
                        tg_chat_id: chatId.toString()
                    }
                })
                .eq('id', member.id);

            if (!updateError) {
                console.log(`✅ Автоматически обновлен Telegram Chat ID для участника ${member.display_name}`);
                
                // Отправляем уведомление о настройке
                await bot.sendMessage(chatId, `✅ **Telegram настроен для команды!**

👤 **Участник:** ${member.display_name}
📱 **Chat ID:** ${chatId}

🎯 Теперь вы можете получать:
• Уведомления о задачах
• Напоминания о встречах
• Обновления по проектам

💡 Используйте /team для управления командой`);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка автоматического обновления Telegram Chat ID:', error);
        // Не отправляем ошибку пользователю, так как это фоновый процесс
    }
}

async function editTeamMember(chatId, context, memberId) {
    try {
        // Получаем данные участника
        const { data: member, error: memberError } = await supabase
            .from('team_members')
            .select('id, display_name, aliases, meta')
            .eq('id', memberId)
            .eq('tenant_id', context.tenant_id)
            .single();

        if (memberError || !member) {
            await bot.sendMessage(chatId, '❌ Участник команды не найден');
            return;
        }

        let message = `✏️ **Редактирование участника команды**\n\n`;
        message += `👤 **Имя:** ${member.display_name}\n`;
        if (member.aliases && member.aliases.length > 0) {
            message += `🏷️ **Псевдонимы:** ${member.aliases.join(', ')}\n`;
        }
        if (member.meta?.tg_chat_id) {
            message += `📱 **Telegram:** ${member.meta.tg_chat_id}\n`;
        }
        if (member.meta?.gcal_email) {
            message += `📅 **Google Calendar:** ${member.meta.gcal_email}\n`;
        }

        message += `\n💡 **Выберите действие:**`;

        const keyboard = [
            [
                { text: '✏️ Изменить имя', callback_data: `edit_name_${memberId}` },
                { text: '🏷️ Псевдонимы', callback_data: `edit_aliases_${memberId}` }
            ],
            [
                { text: '📱 Telegram', callback_data: `edit_telegram_${memberId}` },
                { text: '📅 Google Calendar', callback_data: `edit_calendar_${memberId}` }
            ],
            [
                { text: '❌ Деактивировать', callback_data: `deactivate_member_${memberId}` },
                { text: '🔙 Назад', callback_data: 'setup_team' }
            ]
        ];

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });

    } catch (error) {
        console.error('❌ Ошибка редактирования участника:', error);
        await bot.sendMessage(chatId, '❌ Ошибка редактирования участника');
    }
}

async function continueTeamSetup(chatId, context) {
    try {
        const state = context.teamSetupState;
        if (!state || !state.step) {
            await bot.sendMessage(chatId, '❌ Состояние настройки команды не найдено. Начните заново с /team');
            return;
        }

        console.log(`🔄 Продолжаем настройку команды с шага: ${state.step}`);

        // Показываем текущий шаг настройки
        switch (state.step) {
            case 'name':
                console.log(`📝 Обрабатываем шаг 'name' с текстом: "${text}"`);
                
                if (text.toLowerCase() === 'отмена' || text.toLowerCase() === 'cancel') {
                    console.log('❌ Пользователь отменил добавление участника');
                    // Очищаем состояние из базы данных
                    await clearState();
                    
                    await bot.sendMessage(chatId, '❌ Добавление участника отменено. Используйте /team для возврата к управлению командой.');
                    return;
                }
                
                // Валидация имени
                const trimmedName = text.trim();
                console.log(`🔍 Проверяем имя: "${trimmedName}"`);
                
                if (trimmedName.length < 2) {
                    console.log(`❌ Имя слишком короткое: ${trimmedName.length} символов`);
                    await bot.sendMessage(chatId, `❌ Имя должно содержать минимум 2 символа. Введите корректное имя или "отмена".`);
                    return;
                }
                
                if (trimmedName.length > 50) {
                    console.log(`❌ Имя слишком длинное: ${trimmedName.length} символов`);
                    await bot.sendMessage(chatId, `❌ Имя слишком длинное (максимум 50 символов). Введите более короткое имя или "отмена".`);
                    return;
                }
                
                // Проверяем, не содержит ли имя только цифры или специальные символы
                const isValidChars = /^[а-яёa-z\s\-']+$/i.test(trimmedName);
                console.log(`🔍 Проверка символов: ${isValidChars ? '✅' : '❌'}`);
                
                if (!isValidChars) {
                    console.log(`❌ Имя содержит недопустимые символы: "${trimmedName}"`);
                    await bot.sendMessage(chatId, `❌ Имя содержит недопустимые символы. Используйте только буквы, пробелы, дефисы и апострофы.

💡 **Примеры корректных имен:**
• Ирина Шафеева
• Irina Shafeeva
• Мария-Анна
• O'Connor

Введите корректное имя или "отмена".`);
                    return;
                }
                
                console.log(`✅ Имя прошло валидацию: "${trimmedName}"`);
                
                // Проверяем, не существует ли уже участник с таким именем
                console.log(`🔍 Проверяем существующего участника с именем: "${trimmedName}"`);
                const { data: existingMember, error: checkError } = await supabase
                    .from('team_members')
                    .select('id, display_name')
                    .eq('tenant_id', context.tenant_id)
                    .eq('is_active', true)
                    .ilike('display_name', trimmedName)
                    .single();
                
                if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
                    console.error('❌ Ошибка проверки существующего участника:', checkError);
                }
                
                if (existingMember) {
                    console.log(`⚠️ Найден существующий участник: ${existingMember.display_name}`);
                    await bot.sendMessage(chatId, `⚠️ Участник с именем **${existingMember.display_name}** уже существует в команде.

💡 **Варианты:**
• Введите другое имя
• Используйте полное имя (например, "Ирина Шафеева" вместо "Ирина")
• Или "отмена" для возврата`);
                    return;
                }
                
                console.log(`✅ Участник с таким именем не найден, продолжаем`);
                
                state.memberData.display_name = trimmedName;
                state.step = 'aliases';
                state.lastUpdated = new Date().toISOString();
                
                console.log(`💾 Сохраняем состояние, переход к шагу 'aliases'`);
                
                // Сохраняем состояние
                await saveState();
                
                console.log(`📤 Отправляем сообщение о переходе к следующему шагу`);
                
                await bot.sendMessage(chatId, `✅ Имя участника: **${state.memberData.display_name}**

🏷️ Теперь введите псевдонимы через запятую (или Enter для пропуска):

💡 **Примеры:** Ира, Ирина, Ирушка
💡 **Или:** пропустить

ℹ️ **Справка:** Во время настройки команды ваши сообщения НЕ записываются в заметки.`);
                
                console.log(`✅ Шаг 'name' завершен успешно`);
                break;
                
            case 'aliases':
                const nameText = state.memberData.display_name || 'не указано';
                await bot.sendMessage(chatId, `✅ Имя участника: **${nameText}**

🏷️ Теперь введите псевдонимы через запятую (или Enter для пропуска):

💡 **Примеры:** Ира, Ирина, Ирушка
💡 **Или:** пропустить`);
                break;
                
            case 'telegram':
                const aliasesText = state.memberData.aliases && state.memberData.aliases.length > 0 
                    ? state.memberData.aliases.join(', ') 
                    : 'не указаны';
                await bot.sendMessage(chatId, `✅ Псевдонимы: **${aliasesText}**

📱 Теперь введите Telegram Chat ID участника (или Enter для пропуска):

💡 **Как получить Chat ID:**
• Участник пишет боту сообщение
• Или используйте @userinfobot
• Или введите "пропустить" для настройки позже`);
                break;
                
            case 'gcal_email':
                const telegramText = state.memberData.tg_chat_id 
                    ? `настроен (${state.memberData.tg_chat_id})` 
                    : 'не настроен';
                await bot.sendMessage(chatId, `✅ Telegram: **${telegramText}**

📅 Теперь введите email Google Calendar участника (или Enter для пропуска):

💡 **Примеры:**
• ivan@gmail.com
• ivan@company.com
• пропустить`);
                break;
                
            case 'confirm':
                const gcalText = state.memberData.gcal_email 
                    ? state.memberData.gcal_email 
                    : 'не настроен';
                await bot.sendMessage(chatId, `✅ Google Calendar email: **${gcalText}**

📋 **Подтверждение данных участника:**

👤 **Имя:** ${state.memberData.display_name}
🏷️ **Псевдонимы:** ${state.memberData.aliases && state.memberData.aliases.length > 0 ? state.memberData.aliases.join(', ') : 'не указаны'}
📱 **Telegram:** ${state.memberData.tg_chat_id ? `настроен (${state.memberData.tg_chat_id})` : 'не настроен'}
📅 **Google Calendar:** ${gcalText}

💾 Сохранить участника?`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Сохранить', callback_data: 'team_save_member' },
                                { text: '❌ Отмена', callback_data: 'team_cancel_add' }
                            ]
                        ]
                    }
                });
                break;
                
            default:
                await bot.sendMessage(chatId, '❌ Неизвестный шаг настройки. Начните заново с /team');
                // Очищаем некорректное состояние
                await supabase
                    .from('users')
                    .update({ 
                        meta: {
                            ...context.meta,
                            teamSetupState: null
                        }
                    })
                    .eq('id', context.user_id);
        }
    } catch (error) {
        console.error('❌ Ошибка продолжения настройки команды:', error);
        await bot.sendMessage(chatId, '❌ Ошибка продолжения настройки. Начните заново с /team');
    }
}

async function showCalendarSetupInstructions(chatId) {
    try {
        const message = `📅 **Настройка Google Calendar для команды**\n\n`;

        message += `🔧 **Шаг 1: Google Service Account**\n`;
        message += `1. Перейдите в Google Cloud Console\n`;
        message += `2. Создайте новый проект или выберите существующий\n`;
        message += `3. Включите Google Calendar API\n`;
        message += `4. Создайте Service Account\n`;
        message += `5. Скачайте JSON ключ\n`;
        message += `6. Переименуйте в google-credentials.json\n\n`;

        message += `🔑 **Шаг 2: Доступ к календарям**\n`;
        message += `1. Откройте Google Calendar каждого участника\n`;
        message += `2. В настройках календаря найдите "Делиться с людьми"\n`;
        message += `3. Добавьте email из Service Account\n`;
        message += `4. Дайте права "Вносить изменения"\n\n`;

        message += `🆔 **Шаг 3: Calendar ID**\n`;
        message += `1. В настройках календаря найдите "Интеграция календаря"\n`;
        message += `2. Скопируйте Calendar ID\n`;
        message += `3. Добавьте в настройки участника\n\n`;

        message += `💡 **Советы:**\n`;
        message += `• Используйте один Service Account для всех\n`;
        message += `• Проверьте права доступа к календарям\n`;
        message += `• Тестируйте на простых событиях`;

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🔙 Назад', callback_data: 'setup_team' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('❌ Ошибка показа инструкций по календарю:', error);
        await bot.sendMessage(chatId, '❌ Ошибка показа инструкций');
    }
}

async function handleTeamSetupStep(chatId, context, text) {
    console.log(`🎯 ===== handleTeamSetupStep ВЫЗВАНА =====`);
    console.log(`🚀 handleTeamSetupStep вызвана с параметрами:`);
    console.log(`   chatId: ${chatId}`);
    console.log(`   text: "${text}"`);
    console.log(`   state:`, JSON.stringify(context.teamSetupState, null, 2));
    
    try {
        const state = context.teamSetupState;
        
        if (!state || !state.step) {
            console.error('❌ Некорректное состояние настройки команды:', state);
            await bot.sendMessage(chatId, '❌ Ошибка: некорректное состояние настройки команды. Используйте /team для возврата.');
            return;
        }
        
        console.log(`📝 Обрабатываем шаг: ${state.step}`);
        
        // Функция для сохранения состояния в базу данных с повторными попытками
        const saveState = async (retryCount = 0) => {
            console.log(`💾 Попытка сохранения состояния (${retryCount + 1}/3):`, {
                userId: context.user_id,
                step: state.step,
                memberData: state.memberData
            });
            
            try {
                const { error } = await supabase
                    .from('users')
                    .update({ 
                        meta: {
                            ...context.meta,
                            teamSetupState: state
                        }
                    })
                    .eq('id', context.user_id);
                
                if (error) {
                    console.error(`❌ Ошибка SQL при сохранении состояния:`, error);
                    throw error;
                }
                
                console.log(`✅ Состояние настройки команды сохранено для пользователя ${context.user_id}, шаг: ${state.step}`);
                return true;
            } catch (error) {
                console.error(`❌ Ошибка сохранения состояния (попытка ${retryCount + 1}):`, error);
                console.error(`   Детали ошибки:`, {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
                
                if (retryCount < 2) {
                    console.log(`🔄 Повторная попытка сохранения состояния через 1 секунду...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Ждем 1 секунду
                    return await saveState(retryCount + 1);
                }
                
                throw error;
            }
        };
        
        // Функция для очистки состояния из базы данных
        const clearState = async () => {
            try {
                const { error } = await supabase
                    .from('users')
                    .update({ 
                        meta: {
                            ...context.meta,
                            teamSetupState: null
                        }
                    })
                    .eq('id', context.user_id);
                
                if (error) throw error;
                
                console.log(`✅ Состояние настройки команды очищено для пользователя ${context.user_id}`);
                
                // Обновляем локальный контекст
                context.teamSetupState = null;
                context.meta.teamSetupState = null;
                
                return true;
            } catch (error) {
                console.error(`❌ Ошибка очистки состояния:`, error);
                throw error;
            }
        };
        
        switch (state.step) {
            case 'name':
                if (text.toLowerCase() === 'отмена' || text.toLowerCase() === 'cancel') {
                    // Очищаем состояние из базы данных
                    await clearState();
                    
                    await bot.sendMessage(chatId, '❌ Добавление участника отменено. Используйте /team для возврата к управлению командой.');
                    return;
                }
                
                // Валидация имени
                const trimmedName = text.trim();
                if (trimmedName.length < 2) {
                    await bot.sendMessage(chatId, `❌ Имя должно содержать минимум 2 символа. Введите корректное имя или "отмена".`);
                    return;
                }
                
                if (trimmedName.length > 50) {
                    await bot.sendMessage(chatId, `❌ Имя слишком длинное (максимум 50 символов). Введите более короткое имя или "отмена".`);
                    return;
                }
                
                // Проверяем, не содержит ли имя только цифры или специальные символы
                if (!/^[а-яёa-z\s\-']+$/i.test(trimmedName)) {
                    await bot.sendMessage(chatId, `❌ Имя содержит недопустимые символы. Используйте только буквы, пробелы, дефисы и апострофы.

💡 **Примеры корректных имен:**
• Ирина Шафеева
• Irina Shafeeva
• Мария-Анна
• O'Connor

Введите корректное имя или "отмена".`);
                    return;
                }
                
                // Проверяем, не существует ли уже участник с таким именем
                const { data: existingMember, error: checkError } = await supabase
                    .from('team_members')
                    .select('id, display_name')
                    .eq('tenant_id', context.tenant_id)
                    .eq('is_active', true)
                    .ilike('display_name', trimmedName)
                    .single();
                
                if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
                    console.error('❌ Ошибка проверки существующего участника:', checkError);
                }
                
                if (existingMember) {
                    await bot.sendMessage(chatId, `⚠️ Участник с именем **${existingMember.display_name}** уже существует в команде.

💡 **Варианты:**
• Введите другое имя
• Используйте полное имя (например, "Ирина Шафеева" вместо "Ирина")
• Или "отмена" для возврата`);
                    return;
                }
                
                state.memberData.display_name = trimmedName;
                state.step = 'aliases';
                state.lastUpdated = new Date().toISOString();
                
                // Сохраняем состояние
                await saveState();
                
                // Обновляем локальный контекст
                context.teamSetupState = state;
                context.meta.teamSetupState = state;
                
                await bot.sendMessage(chatId, `✅ Имя участника: **${state.memberData.display_name}**

🏷️ Теперь введите псевдонимы через запятую (или Enter для пропуска):

💡 **Примеры:** Ира, Ирина, Ирушка
💡 **Или:** пропустить

ℹ️ **Справка:** Во время настройки команды ваши сообщения НЕ записываются в заметки.`);
                break;
                
            case 'aliases':
                if (text.toLowerCase() === 'пропустить' || text.toLowerCase() === 'skip') {
                    state.memberData.aliases = [];
                } else {
                    // Обработка псевдонимов с валидацией
                    const aliases = text.split(',')
                        .map(a => a.trim())
                        .filter(a => a && a.length > 0);
                    
                    // Проверяем длину каждого псевдонима
                    const invalidAliases = aliases.filter(a => a.length > 30);
                    if (invalidAliases.length > 0) {
                        await bot.sendMessage(chatId, `❌ Следующие псевдонимы слишком длинные (максимум 30 символов): ${invalidAliases.join(', ')}

Введите псевдонимы заново или "пропустить".`);
                        return;
                    }
                    
                    // Проверяем на недопустимые символы
                    const invalidChars = aliases.filter(a => !/^[а-яёa-z0-9\s\-']+$/i.test(a));
                    if (invalidChars.length > 0) {
                        await bot.sendMessage(chatId, `❌ Следующие псевдонимы содержат недопустимые символы: ${invalidChars.join(', ')}

💡 **Разрешены:** буквы, цифры, пробелы, дефисы, апострофы
💡 **Примеры:** Ира, Ирушка, Irina, Irka

Введите псевдонимы заново или "пропустить".`);
                        return;
                    }
                    
                    // Проверяем на дубликаты
                    const uniqueAliases = [...new Set(aliases)];
                    if (uniqueAliases.length !== aliases.length) {
                        await bot.sendMessage(chatId, `⚠️ Обнаружены дублирующиеся псевдонимы. Убраны дубликаты.

💡 **Итоговый список:** ${uniqueAliases.join(', ')}`);
                    }
                    
                    state.memberData.aliases = uniqueAliases;
                }
                
                state.step = 'telegram';
                state.lastUpdated = new Date().toISOString();
                
                // Сохраняем состояние
                await saveState();
                
                // Обновляем локальный контекст
                context.teamSetupState = state;
                context.meta.teamSetupState = state;
                
                const aliasesText = state.memberData.aliases.length > 0 
                    ? state.memberData.aliases.join(', ') 
                    : 'не указаны';
                
                await bot.sendMessage(chatId, `✅ Псевдонимы: **${aliasesText}**

📱 Теперь введите Telegram Chat ID участника (или Enter для пропуска):

💡 **Как получить Chat ID:**
• Участник пишет боту сообщение
• Или используйте @userinfobot
• Или введите "пропустить" для настройки позже`);
                break;
                
            case 'telegram':
                if (text.toLowerCase() === 'пропустить' || text.toLowerCase() === 'skip') {
                    state.memberData.tg_chat_id = null;
                } else {
                    const chatIdMatch = text.match(/-?\d+/);
                    if (chatIdMatch) {
                        const chatIdValue = chatIdMatch[0];
                        
                        // Проверяем, что Chat ID не слишком длинный
                        if (chatIdValue.length > 20) {
                            await bot.sendMessage(chatId, `❌ Chat ID слишком длинный. Введите корректный Chat ID или "пропустить".`);
                            return;
                        }
                        
                        state.memberData.tg_chat_id = chatIdValue;
                    } else {
                        await bot.sendMessage(chatId, `❌ Неверный формат Chat ID. Введите число или "пропустить".

💡 **Примеры Chat ID:**
• 123456789
• -987654321
• пропустить`);
                        return;
                    }
                }
                
                state.step = 'gcal_email';
                state.lastUpdated = new Date().toISOString();
                
                // Сохраняем состояние
                await saveState();
                
                // Обновляем локальный контекст
                context.teamSetupState = state;
                context.meta.teamSetupState = state;
                
                const telegramText = state.memberData.tg_chat_id 
                    ? `настроен (${state.memberData.tg_chat_id})` 
                    : 'не настроен';
                
                await bot.sendMessage(chatId, `✅ Telegram: **${telegramText}**

📅 Теперь введите email Google Calendar участника (или Enter для пропуска):

💡 **Примеры:**
• ivan@gmail.com
• ivan@company.com
• пропустить`);
                break;
                
            case 'gcal_email':
                if (text.toLowerCase() === 'пропустить' || text.toLowerCase() === 'skip') {
                    state.memberData.gcal_email = null;
                } else {
                    const emailMatch = text.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
                    if (emailMatch) {
                        const email = text.trim();
                        
                        // Проверяем длину email
                        if (email.length > 100) {
                            await bot.sendMessage(chatId, `❌ Email слишком длинный. Введите корректный email или "пропустить".`);
                            return;
                        }
                        
                        state.memberData.gcal_email = email;
                    } else {
                        await bot.sendMessage(chatId, `❌ Неверный формат email. Введите корректный email или "пропустить".

💡 **Примеры email:**
• ivan@gmail.com
• ivan@company.com
• пропустить`);
                        return;
                    }
                }
                
                state.step = 'confirm';
                state.lastUpdated = new Date().toISOString();
                
                // Сохраняем состояние
                await saveState();
                
                // Обновляем локальный контекст
                context.teamSetupState = state;
                context.meta.teamSetupState = state;
                
                const gcalText = state.memberData.gcal_email 
                    ? state.memberData.gcal_email 
                    : 'не настроен';
                
                await bot.sendMessage(chatId, `✅ Google Calendar email: **${gcalText}**

📋 **Подтверждение данных участника:**

👤 **Имя:** ${state.memberData.display_name}
🏷️ **Псевдонимы:** ${state.memberData.aliases.length > 0 ? state.memberData.aliases.join(', ') : 'не указаны'}
📱 **Telegram:** ${state.memberData.tg_chat_id ? `настроен (${state.memberData.tg_chat_id})` : 'не настроен'}
📅 **Google Calendar:** ${gcalText}

💾 Сохранить участника?`, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Сохранить', callback_data: 'team_save_member' },
                                { text: '❌ Отмена', callback_data: 'team_cancel_add' }
                            ]
                        ]
                    }
                });
                break;
                
            default:
                console.error(`❌ Неизвестный шаг настройки: ${state.step}`);
                await bot.sendMessage(chatId, '❌ Неизвестный шаг настройки. Используйте /team для возврата к управлению командой.');
                await clearState();
        }
        
        // Возвращаем обновленный контекст
        return context;
    } catch (error) {
        console.error('❌ Ошибка обработки шага настройки команды:', error);
        console.error('Stack trace:', error.stack);
        
        try {
            // Пытаемся очистить состояние при ошибке
            if (context.teamSetupState) {
                await supabase
                    .from('users')
                    .update({ 
                        meta: {
                            ...context.meta,
                            teamSetupState: null
                        }
                    })
                    .eq('id', context.user_id);
            }
        } catch (clearError) {
            console.error('❌ Ошибка очистки состояния при ошибке:', clearError);
        }
        
        await bot.sendMessage(chatId, `❌ Произошла ошибка при настройке команды: ${error.message}

💡 **Что делать:**
• Используйте /team для возврата к управлению командой
• Попробуйте добавить участника заново
• Если ошибка повторяется, обратитесь к администратору`);
        
        // Возвращаем null при ошибке, чтобы показать, что контекст не был успешно обновлен
        return null;
    }
}

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
    app.listen(PORT, async () => {
        console.log(`🚀 AI Assistant server running on port ${PORT}`);
        console.log(`📱 Webhook URL: ${process.env.TELEGRAM_WEBHOOK_URL || `http://localhost:${PORT}/webhook`}`);
        console.log('🎯 New architecture ready!');
        
        // Setup webhook
        await setupWebhook();
    });
}

module.exports = app;