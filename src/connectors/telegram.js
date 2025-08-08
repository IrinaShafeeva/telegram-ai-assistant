/**
 * Telegram Connector
 * Handles delivery to Telegram DMs and channels
 */

class TelegramConnector {
    constructor(bot) {
        this.bot = bot;
        this.name = 'telegram_dm';
    }

    async deliver(record, delivery) {
        const { target } = delivery;
        
        try {
            const message = this.formatMessage(record);
            
            // Send message
            await this.bot.sendMessage(target, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

            return {
                message_sent: true,
                chat_id: target,
                message_length: message.length
            };
        } catch (error) {
            console.error('Telegram delivery error:', error);
            throw error;
        }
    }

    formatMessage(record) {
        const { kind, title, body, amount, currency, url, tags, assignee } = record;
        
        let message = '';
        let emoji = '';
        
        switch (kind) {
            case 'expense':
                emoji = '💰';
                message = `${emoji} *Новый расход*\n\n`;
                message += `*${title}*\n`;
                if (amount) message += `Сумма: ${amount} ${currency}\n`;
                if (body) message += `Детали: ${body}\n`;
                break;
                
            case 'task':
                emoji = '📋';
                message = `${emoji} *Новая задача*\n\n`;
                message += `*${title}*\n`;
                if (body) message += `${body}\n`;
                if (assignee?.display_name) message += `Исполнитель: ${assignee.display_name}\n`;
                if (record.due_at) {
                    const dueDate = new Date(record.due_at).toLocaleDateString('ru-RU');
                    message += `Срок: ${dueDate}\n`;
                }
                break;
                
            case 'bookmark':
                emoji = '🔖';
                message = `${emoji} *Новая закладка*\n\n`;
                message += `*${title}*\n`;
                if (url) message += `🔗 ${url}\n`;
                if (body) message += `Заметка: ${body}\n`;
                break;
                
            default:
                emoji = '📝';
                message = `${emoji} *Новая запись*\n\n`;
                message += `*${title}*\n`;
                if (body) message += `${body}\n`;
        }
        
        if (tags && tags.length > 0) {
            message += `Теги: ${tags.map(tag => `#${tag}`).join(' ')}\n`;
        }
        
        message += `\n_Время: ${new Date().toLocaleString('ru-RU')}_`;
        
        return message;
    }

    async validateTarget(target) {
        try {
            const chat = await this.bot.getChat(target);
            return {
                valid: true,
                chat_type: chat.type,
                chat_title: chat.title || chat.first_name
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

class TelegramChannelConnector {
    constructor(bot) {
        this.bot = bot;
        this.name = 'telegram_channel';
    }

    async deliver(record, delivery) {
        const { target } = delivery;
        
        try {
            const message = this.formatChannelMessage(record);
            
            await this.bot.sendMessage(target, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

            return {
                message_sent: true,
                channel_id: target,
                message_length: message.length
            };
        } catch (error) {
            console.error('Telegram channel delivery error:', error);
            throw error;
        }
    }

    formatChannelMessage(record) {
        const { kind, title, body, amount, currency, assignee } = record;
        
        let message = '';
        let emoji = '';
        
        switch (kind) {
            case 'expense':
                emoji = '💸';
                message = `${emoji} *Расход: ${title}*\n`;
                if (amount) message += `💰 ${amount} ${currency}\n`;
                break;
                
            case 'task':
                emoji = '✅';
                message = `${emoji} *Задача: ${title}*\n`;
                if (assignee?.display_name) message += `👤 ${assignee.display_name}\n`;
                break;
                
            case 'bookmark':
                emoji = '🔗';
                message = `${emoji} *Закладка: ${title}*\n`;
                if (record.url) message += `${record.url}\n`;
                break;
        }
        
        if (body && body.length < 100) {
            message += `📝 ${body}\n`;
        }
        
        return message;
    }
}

module.exports = { TelegramConnector, TelegramChannelConnector };