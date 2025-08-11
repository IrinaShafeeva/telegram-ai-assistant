// Умный обработчик задач и напоминаний
const { writeTask, writeBookmark } = require('./googleSheets');

// Функция для умной обработки задач
async function processTask(text, context, chatId) {
    try {
        console.log('🧠 Обрабатываю задачу:', text);

        // Извлекаем контакт и описание задачи
        const taskInfo = extractTaskInfo(text);
        console.log('📋 Информация о задаче:', taskInfo);

        if (taskInfo.contact) {
            // Задача для конкретного человека
            return await processAssignedTask(taskInfo, context, chatId);
        } else {
            // Личная задача
            return await processPersonalTask(taskInfo, context, chatId);
        }

    } catch (error) {
        console.error('❌ Ошибка обработки задачи:', error);
        return false;
    }
}

// Функция для извлечения информации о задаче
function extractTaskInfo(text) {
    const lowerText = text.toLowerCase();
    
    // Паттерны для извлечения контактов
    const contactPatterns = [
        /(?:задача|задачу|сделай|попроси|напомни)\s+(?:для\s+)?([а-яё]+)/i,
        /([а-яё]+)\s+(?:сделай|сделать|купи|купить|позвони|позвонить)/i,
        /(?:поручение|задание)\s+(?:для\s+)?([а-яё]+)/i
    ];

    let contact = null;
    for (const pattern of contactPatterns) {
        const match = text.match(pattern);
        if (match) {
            contact = match[1];
            break;
        }
    }

    // Определяем тип задачи
    let taskType = 'общая';
    if (lowerText.includes('сделай') || lowerText.includes('сделать')) taskType = 'создание';
    else if (lowerText.includes('купи') || lowerText.includes('купить')) taskType = 'покупка';
    else if (lowerText.includes('позвони') || lowerText.includes('позвонить')) taskType = 'звонок';
    else if (lowerText.includes('напиши') || lowerText.includes('написать')) taskType = 'сообщение';
    else if (lowerText.includes('встреча') || lowerText.includes('встречу')) taskType = 'встреча';

    // Извлекаем описание
    let description = text;
    if (contact) {
        description = text.replace(new RegExp(`(?:задача|задачу|сделай|попроси|напомни)\\s+(?:для\\s+)?${contact}`, 'gi'), '').trim();
        description = description.replace(new RegExp(`${contact}\\s+(?:сделай|сделать|купи|купить|позвони|позвонить)`, 'gi'), '').trim();
    }

    return {
        contact,
        taskType,
        description: description || text,
        originalText: text
    };
}

// Функция для обработки назначенной задачи
async function processAssignedTask(taskInfo, context, chatId) {
    try {
        const { contact, taskType, description } = taskInfo;
        
        // Создаем заголовок задачи
        const title = `Задача для ${contact}: ${description}`;
        
        // Добавляем метаданные
        const fullDescription = `
Контакт: ${contact}
Тип: ${taskType}
Описание: ${description}
Назначил: ${chatId}
Дата: ${new Date().toLocaleDateString('ru-RU')}
        `.trim();

        // Записываем в Google Sheets
        const success = await writeTask(
            await getSpreadsheetId(context.tenant_id),
            title,
            fullDescription,
            chatId.toString()
        );

        if (success) {
            console.log(`✅ Задача для ${contact} записана`);
            
            // Отправляем уведомление контакту
            await notifyContact(contact, description, chatId, context.tenant_id);
            
            return {
                success: true,
                message: `✅ Задача назначена ${contact}:\n\n📋 ${description}\n\n⏰ Записано в Google Sheets`
            };
        }

        return { success: false, message: '❌ Ошибка записи задачи' };

    } catch (error) {
        console.error('❌ Ошибка обработки назначенной задачи:', error);
        return { success: false, message: '❌ Ошибка обработки задачи' };
    }
}

// Функция для обработки личной задачи
async function processPersonalTask(taskInfo, context, chatId) {
    try {
        const { description } = taskInfo;
        
        // Записываем в Google Sheets
        const success = await writeTask(
            await getSpreadsheetId(context.tenant_id),
            description,
            description,
            chatId.toString()
        );

        if (success) {
            console.log('✅ Личная задача записана');
            return {
                success: true,
                message: `✅ Задача записана:\n\n📋 ${description}\n\n⏰ Сохранено в Google Sheets`
            };
        }

        return { success: false, message: '❌ Ошибка записи задачи' };

    } catch (error) {
        console.error('❌ Ошибка обработки личной задачи:', error);
        return { success: false, message: '❌ Ошибка обработки задачи' };
    }
}

// Функция для получения Google Sheets ID (временно здесь)
async function getSpreadsheetId(tenantId) {
    // TODO: Вынести в отдельный модуль
    return '1UJ4nq5XeEC7TZw5toufpVE_ryAgOlZQ-4ssKOaoy9Zo';
}

// Функция для уведомления контакта о назначенной задаче
async function notifyContact(contactName, description, authorChatId, tenantId) {
    try {
        const { supabase } = require('../config/database');
        
        // Ищем участника команды по имени (учитываем разные падежи)
        const { data: members } = await supabase
            .from('team_members')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true);
            
        // Поиск по точному совпадению или по части имени
        const member = members.find(m => {
            const displayName = m.display_name.toLowerCase();
            const searchName = contactName.toLowerCase();
            
            // Проверяем точное совпадение
            if (displayName === searchName) return true;
            
            // Проверяем различные формы имени (Мария -> Маши, Саша -> Саши)
            const nameVariations = {
                'мария': ['маши', 'марии', 'марию', 'мариям'],
                'саша': ['саши', 'саше', 'сашу', 'сашам'],
                'александр': ['саша', 'саши', 'саше', 'сашу'],
                'александра': ['саша', 'саши', 'саше', 'сашу']
            };
            
            // Ищем в вариациях
            for (const [baseName, variations] of Object.entries(nameVariations)) {
                if (displayName.includes(baseName) && variations.includes(searchName)) {
                    return true;
                }
                if (searchName.includes(baseName) && variations.includes(displayName)) {
                    return true;
                }
            }
            
            return false;
        });
            
        if (!member) {
            console.log(`⚠️ Участник "${contactName}" не найден в команде`);
            return;
        }
        
        if (!member.tg_chat_id) {
            console.log(`⚠️ У участника "${contactName}" не настроен Telegram`);
            return;
        }
        
        // Отправляем уведомление через бота
        const TelegramBot = require('node-telegram-bot-api');
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
        
        const message = `📋 **Новая задача для вас!**
        
**Описание:** ${description}

👤 **От:** Руководитель
📅 **Дата:** ${new Date().toLocaleDateString('ru-RU')}

Задача записана в общую таблицу задач.`;

        await bot.sendMessage(member.tg_chat_id, message, {
            parse_mode: 'Markdown'
        });
        
        console.log(`✅ Уведомление отправлено ${contactName} (${member.tg_chat_id})`);
        
    } catch (error) {
        console.error('❌ Ошибка отправки уведомления:', error);
    }
}

module.exports = {
    processTask,
    extractTaskInfo,
    processAssignedTask,
    processPersonalTask
};
