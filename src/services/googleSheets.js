const { google } = require('googleapis');
const { projectService, expenseService, userService } = require('./supabase');
const logger = require('../utils/logger');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initAuth();
  }

  initAuth() {
    try {
      // Check if Google credentials are provided
      let credentials;
      
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        // Use JSON credentials from environment variable
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        logger.info('Using Google credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON');
      } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        // Fallback to separate environment variables
        credentials = {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };
        logger.info('Using Google credentials from separate environment variables');
      } else {
        logger.warn('Google Sheets credentials not provided - Google Sheets integration disabled');
        this.auth = null;
        this.sheets = null;
        return;
      }

      this.auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
      );

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      logger.info('Google Sheets API initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Google Sheets API:', error);
      this.auth = null;
      this.sheets = null;
    }
  }

  // Новая функция для подключения к существующей таблице пользователя
  async connectToUserSheet(spreadsheetId, userEmail) {
    try {
      if (!this.sheets) {
        logger.warn('Google Sheets not available');
        return { success: false, error: 'Google Sheets API не настроен' };
      }

      // Проверяем доступ к таблице
      const hasAccess = await this.validateSheetAccess(spreadsheetId);
      if (!hasAccess) {
        return { success: false, error: 'Нет доступа к таблице. Убедитесь, что таблица доступна для редактирования.' };
      }

      // Получаем информацию о таблице
      const sheetInfo = await this.getSheetInfo(spreadsheetId);
      if (!sheetInfo) {
        return { success: false, error: 'Не удалось получить информацию о таблице' };
      }

      // Проверяем структуру таблицы и создаем заголовки если нужно
      await this.ensureSheetStructure(spreadsheetId);

      logger.info(`Connected to user sheet: ${sheetInfo.title}`);
      return { 
        success: true, 
        spreadsheetId, 
        sheetUrl: sheetInfo.url,
        title: sheetInfo.title 
      };
    } catch (error) {
      logger.error('Failed to connect to user sheet:', error);
      return { success: false, error: 'Ошибка подключения к таблице' };
    }
  }

  // Проверяем и создаем правильную структуру таблицы
  async ensureSheetStructure(spreadsheetId) {
    try {
      // Проверяем заголовки
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A1:G1'
      });

      const headers = response.data.values?.[0] || [];
      const expectedHeaders = ['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Автор', 'Источник'];

      // Если заголовки отсутствуют или неправильные, создаем их
      if (headers.length === 0 || !this.arraysEqual(headers, expectedHeaders)) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'A1:G1',
          valueInputOption: 'RAW',
          resource: {
            values: [expectedHeaders]
          }
        });

        // Форматируем заголовки
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: 0,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: 7
                  },
                  cell: {
                    userEnteredFormat: {
                      textFormat: { bold: true },
                      backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 }
                    }
                  },
                  fields: 'userEnteredFormat(textFormat,backgroundColor)'
                }
              },
              {
                autoResizeDimensions: {
                  dimensions: {
                    sheetId: 0,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: 7
                  }
                }
              }
            ]
          }
        });

        logger.info(`Sheet structure created for: ${spreadsheetId}`);
      }
    } catch (error) {
      logger.error('Failed to ensure sheet structure:', error);
      throw error;
    }
  }

  // Вспомогательная функция для сравнения массивов
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }



  async shareSheetWithUser(spreadsheetId, userEmail, userName) {
    try {
      if (!this.sheets) {
        logger.warn('Google Sheets not available - skipping sheet sharing');
        return false;
      }

      // Share the spreadsheet with the user
      const drive = google.drive({ version: 'v3', auth: this.auth });
      
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          role: 'writer',
          type: 'user',
          emailAddress: userEmail
        }
      });

      logger.info(`Shared sheet ${spreadsheetId} with ${userEmail}`);
      return true;
    } catch (error) {
      logger.error('Failed to share sheet with user:', error);
      return false;
    }
  }

  async addExpenseToSheet(expense, projectId) {
    try {
      if (!this.sheets) {
        logger.debug('Google Sheets not available - skipping expense sync');
        return;
      }

      const project = await projectService.findById(projectId);
      if (!project?.google_sheet_id) {
        logger.debug('No Google Sheet ID for project:', projectId);
        return;
      }

      const user = await userService.findById(expense.user_id);
      const authorName = user?.username || user?.first_name || 'Unknown';

      const values = [[
        this.formatDate(expense.expense_date),
        expense.description,
        expense.amount,
        expense.currency,
        expense.category,
        authorName,
        'bot'
      ]];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: project.google_sheet_id,
        range: 'A:G',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values }
      });

      // Mark as synced
      await expenseService.update(expense.id, { synced_to_sheets: true });
      logger.debug(`Added expense to sheet: ${expense.id}`);
    } catch (error) {
      logger.error('Failed to add expense to sheet:', error);
    }
  }

  async syncFromGoogleSheets(userId, projectId) {
    try {
      const project = await projectService.findById(projectId);
      if (!project?.google_sheet_id) {
        return { imported: 0, errors: ['No Google Sheet linked to project'] };
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: project.google_sheet_id,
        range: 'A2:G', // Skip header row
      });

      const rows = response.data.values || [];
      let imported = 0;
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2; // Account for header and 0-based index

        try {
          // Skip bot-created entries
          if (row[6] === 'bot') continue;

          // Skip rows without essential data
          if (!row[0] || !row[2]) continue;

          const expenseData = {
            user_id: userId,
            project_id: projectId,
            amount: parseFloat(row[2]) || 0,
            currency: row[3] || 'USD',
            category: row[4] || 'Прочее',
            description: row[1] || 'Manual entry',
            expense_date: this.parseDate(row[0]),
            source: 'sheets',
            sheets_row_id: rowNumber,
            synced_to_sheets: true
          };

          // Check if already imported
          const existing = await this.findExpenseBySheetRow(projectId, rowNumber);
          if (existing) continue;

          await expenseService.create(expenseData);
          imported++;
        } catch (error) {
          errors.push(`Row ${rowNumber}: ${error.message}`);
          logger.error(`Failed to import row ${rowNumber}:`, error);
        }
      }

      logger.info(`Sync completed: ${imported} imported, ${errors.length} errors`);
      return { imported, errors };
    } catch (error) {
      logger.error('Failed to sync from Google Sheets:', error);
      throw new Error('Не удалось синхронизировать с Google таблицей');
    }
  }

  async findExpenseBySheetRow(projectId, rowNumber) {
    try {
      const expenses = await expenseService.findByProject(projectId, 1000, 0);
      return expenses.find(exp => exp.sheets_row_id === rowNumber && exp.source === 'sheets');
    } catch (error) {
      logger.error('Failed to find expense by sheet row:', error);
      return null;
    }
  }

  formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }

  parseDate(dateString) {
    // Handle DD.MM.YYYY format
    if (typeof dateString === 'string' && dateString.includes('.')) {
      const [day, month, year] = dateString.split('.');
      return new Date(year, month - 1, day).toISOString().split('T')[0];
    }
    
    // Handle other formats
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0]; // Default to today
    }
    
    return date.toISOString().split('T')[0];
  }

  async getSheetInfo(spreadsheetId) {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId
      });
      
      return {
        title: response.data.properties.title,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        sheetCount: response.data.sheets.length
      };
    } catch (error) {
      logger.error('Failed to get sheet info:', error);
      return null;
    }
  }

  async validateSheetAccess(spreadsheetId) {
    try {
      await this.sheets.spreadsheets.get({ spreadsheetId });
      return true;
    } catch (error) {
      logger.error('Sheet access validation failed:', error);
      return false;
    }
  }

  async bulkSyncExpenses(expenses, spreadsheetId) {
    try {
      if (!expenses.length) return 0;

      const values = expenses.map(expense => [
        this.formatDate(expense.expense_date),
        expense.description,
        expense.amount,
        expense.currency,
        expense.category,
        expense.user_username || 'Bot User',
        'bot'
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'A:G',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values }
      });

      // Mark all as synced
      const expenseIds = expenses.map(e => e.id);
      for (const id of expenseIds) {
        await expenseService.update(id, { synced_to_sheets: true });
      }

      logger.info(`Bulk synced ${expenses.length} expenses to sheet`);
      return expenses.length;
    } catch (error) {
      logger.error('Bulk sync failed:', error);
      throw error;
    }
  }
}

module.exports = new GoogleSheetsService();