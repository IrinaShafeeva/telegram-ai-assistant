const { google } = require('googleapis');
const { projectService, expenseService, incomeService, userService } = require('./supabase');
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
      
      // Try to read credentials from JSON file first
      try {
        const fs = require('fs');
        const path = require('path');
        const credentialsPath = path.join(process.cwd(), 'ai-assistant-sheets-ddaae7505964.json');
        
        if (fs.existsSync(credentialsPath)) {
          credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
          logger.info('Using Google credentials from JSON file');
        }
      } catch (fileError) {
        logger.debug('Could not read credentials from file:', fileError.message);
      }
      
      // Fallback to environment variable
      if (!credentials && process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        logger.info('Using Google credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON');
      } else if (!credentials && process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        // Fallback to separate environment variables
        credentials = {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };
        logger.info('Using Google credentials from separate environment variables');
      }
      
      if (!credentials) {
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
      const expectedHeaders = ['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Автор', 'Тип'];

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

  async addTransactionToSheet(transaction, projectId, type = 'expense') {
    // Declare sheetName outside try block to access in catch
    let sheetName = 'unknown';
    
    try {
      if (!this.sheets) {
        logger.debug('Google Sheets not available - skipping transaction sync');
        return;
      }

      const project = await projectService.findById(projectId);
      if (!project?.google_sheet_id) {
        logger.debug('No Google Sheet ID for project:', projectId);
        return;
      }

      const user = await userService.findById(transaction.user_id);
      const authorName = user?.username || user?.first_name || 'Unknown';

      // For expenses, make amount negative; for incomes, keep positive
      const amount = type === 'expense' ? -Math.abs(transaction.amount) : Math.abs(transaction.amount);
      const date = type === 'expense' ? transaction.expense_date : transaction.income_date;

      const values = [[
        this.formatDate(date),
        transaction.description,
        amount,
        transaction.currency,
        transaction.category,
        authorName,
        type
      ]];

      // Use project name as sheet name, fallback to first sheet
      sheetName = project.name;
      try {
        logger.info(`🔍 [${type.toUpperCase()}] Getting sheets for project "${project.name}", sheet ID: ${project.google_sheet_id}`);
        const spreadsheet = await this.sheets.spreadsheets.get({
          spreadsheetId: project.google_sheet_id,
          fields: 'sheets.properties.title'
        });

        // Check if project sheet exists
        const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);
        logger.info(`📋 [${type.toUpperCase()}] Existing sheets: ${JSON.stringify(existingSheets)}`);
        logger.info(`🔍 [${type.toUpperCase()}] Looking for sheet: "${project.name}"`);

        const projectSheet = spreadsheet.data.sheets.find(
          sheet => sheet.properties.title === project.name
        );

        if (projectSheet) {
          logger.info(`✅ [${type.toUpperCase()}] Found existing project sheet: "${project.name}"`);
          sheetName = project.name;

          // Check and update headers if needed
          try {
            const headerResponse = await this.sheets.spreadsheets.values.get({
              spreadsheetId: project.google_sheet_id,
              range: `${project.name}!A1:G1`
            });

            const currentHeaders = headerResponse.data.values?.[0] || [];
            const expectedHeaders = ['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Автор', 'Тип'];

            // Check if headers need updating (old format had 'Источник' instead of 'Тип')
            if (currentHeaders.length === 0 || !this.arraysEqual(currentHeaders, expectedHeaders)) {
              logger.info(`🔧 [${type.toUpperCase()}] Updating headers for existing sheet "${project.name}"`);
              await this.sheets.spreadsheets.values.update({
                spreadsheetId: project.google_sheet_id,
                range: `${project.name}!A1:G1`,
                valueInputOption: 'RAW',
                resource: {
                  values: [expectedHeaders]
                }
              });
              logger.info(`✅ [${type.toUpperCase()}] Headers updated for sheet "${project.name}"`);
            }
          } catch (headerError) {
            logger.warn(`⚠️ [${type.toUpperCase()}] Could not check/update headers:`, headerError.message);
          }
        } else {
          logger.info(`❌ [${type.toUpperCase()}] Project sheet "${project.name}" not found, creating new one...`);
          // Create new sheet for project if it doesn't exist
          try {
            logger.info(`🔧 [${type.toUpperCase()}] Attempting to create sheet "${project.name}"...`);
            const batchResult = await this.sheets.spreadsheets.batchUpdate({
              spreadsheetId: project.google_sheet_id,
              resource: {
                requests: [{
                  addSheet: {
                    properties: {
                      title: project.name
                    }
                  }
                }]
              }
            });
            logger.info(`🔧 [${type.toUpperCase()}] Sheet creation result:`, batchResult.status);

            const newSheetId = batchResult.data.replies[0].addSheet.properties.sheetId;

            // Add headers to the new sheet
            logger.info(`🔧 [${type.toUpperCase()}] Adding headers to new sheet "${project.name}"...`);
            await this.sheets.spreadsheets.values.update({
              spreadsheetId: project.google_sheet_id,
              range: `${project.name}!A1:G1`,
              valueInputOption: 'RAW',
              resource: {
                values: [['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Автор', 'Тип']]
              }
            });

            // Protect sheet name from manual renaming
            await this.protectSheetName(project.google_sheet_id, newSheetId, project.name);

            sheetName = project.name;
            logger.info(`✅ [${type.toUpperCase()}] Created new sheet "${project.name}" in Google Sheets`);
          } catch (createError) {
            logger.error('❌ [EXPENSE] Could not create project sheet:', createError.message);
            logger.error('❌ [EXPENSE] Create error details:', createError);
            if (spreadsheet.data.sheets && spreadsheet.data.sheets.length > 0) {
              sheetName = spreadsheet.data.sheets[0].properties.title;
              logger.info(`🔧 [EXPENSE] Using fallback sheet: "${sheetName}"`);
            }
          }
        }
      } catch (error) {
        logger.error('❌ [EXPENSE] Could not get sheet name:', error.message);
        logger.error('❌ [EXPENSE] Sheet error details:', error);
        sheetName = project.name;
      }

      logger.info(`📝 [${type.toUpperCase()}] Adding ${type} to sheet "${sheetName}"`);
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: project.google_sheet_id,
        range: `${sheetName}!A:G`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values }
      });

      // Mark as synced
      if (type === 'expense') {
        await expenseService.update(transaction.id, { synced_to_sheets: true });
      } else {
        await incomeService.update(transaction.id, { synced_to_sheets: true });
      }

      logger.info(`✅ Added ${type} to sheet "${sheetName}": ${transaction.description} - ${amount} ${transaction.currency}`);
    } catch (error) {
      // Get project info for error logging (project might be undefined in catch scope)
      let projectInfo = 'unknown';
      try {
        const proj = await projectService.findById(projectId);
        projectInfo = proj?.google_sheet_id || 'unknown';
      } catch {}
      
      logger.error(`❌ Failed to add ${type} to sheet:`, {
        error: error.message,
        [`${type}Id`]: transaction.id,
        projectId: projectId,
        sheetId: projectInfo,
        sheetName: sheetName || 'unknown'
      });
      
      // Helpful error message for common issues
      if (error.message.includes('404')) {
        logger.error('💡 Hint: Google Sheet not found. Check if sheet ID is correct and service account has access.');
      } else if (error.message.includes('403')) {
        logger.error('💡 Hint: Permission denied. Make sure exp-trck@ai-assistant-sheets.iam.gserviceaccount.com is added as Editor to the Google Sheet.');
      }
    }
  }

  async addExpenseToSheet(expense, projectId) {
    return this.addTransactionToSheet(expense, projectId, 'expense');
  }

  async addIncomeToSheet(income, projectId) {
    return this.addTransactionToSheet(income, projectId, 'income');
  }

  async syncFromGoogleSheets(userId, projectId) {
    try {
      const project = await projectService.findById(projectId);
      if (!project?.google_sheet_id) {
        return { imported: 0, errors: ['No Google Sheet linked to project'] };
      }

      // Get the first sheet name dynamically
      let sheetName = 'Sheet1';
      try {
        const spreadsheet = await this.sheets.spreadsheets.get({
          spreadsheetId: project.google_sheet_id,
          fields: 'sheets.properties.title'
        });
        
        if (spreadsheet.data.sheets && spreadsheet.data.sheets.length > 0) {
          sheetName = spreadsheet.data.sheets[0].properties.title;
        }
      } catch (error) {
        logger.warn('Could not get sheet name for sync, using default:', error.message);
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: project.google_sheet_id,
        range: `${sheetName}!A2:G`, // Skip header row
      });

      const rows = response.data.values || [];
      let imported = 0;
      const errors = [];

      // Get user info for default currency
      const { userService } = require('./supabase');
      const userInfo = await userService.findById(userId);
      const defaultCurrency = userInfo?.primary_currency || 'RUB';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2; // Account for header and 0-based index

        try {
          // Skip rows without essential data
          if (!row[0] || !row[2]) continue;

          const transactionType = row[6]; // 'expense', 'income', or 'bot'

          let expenseData = {
            user_id: userId,
            project_id: projectId,
            amount: Math.abs(parseFloat(row[2])) || 0, // Use absolute value
            currency: row[3] || defaultCurrency,
            category: row[4] || 'Прочее',
            description: row[1] || 'Manual entry',
            expense_date: this.parseDate(row[0]),
            source_text: 'sheets',
            sheets_row_id: rowNumber,
            synced_to_sheets: true
          };

          // Check if already imported
          const existing = await this.findExpenseBySheetRow(projectId, rowNumber);

          if (existing) {
            // Update existing entry if data changed in Google Sheets
            const hasChanges =
              existing.amount !== expenseData.amount ||
              existing.currency !== expenseData.currency ||
              existing.category !== expenseData.category ||
              existing.description !== expenseData.description ||
              existing.expense_date !== expenseData.expense_date;

            if (hasChanges) {
              await expenseService.update(existing.id, expenseData);
              imported++;
              logger.info(`Updated expense from sheet row ${rowNumber}`);
            }
            continue;
          }

          // Apply AI categorization if needed
          try {
            const { DEFAULT_CATEGORIES } = require('../config/constants');
            const validCategories = DEFAULT_CATEGORIES.map(cat => cat.replace(/^[^\s]+ /, '')); // Remove emojis
            
            // Check if category needs AI processing
            const needsAIProcessing = !expenseData.category || 
                                    expenseData.category === 'Прочее' || 
                                    !validCategories.includes(expenseData.category);
            
            if (needsAIProcessing && expenseData.description && expenseData.description !== 'Manual entry') {
              const openaiService = require('./openai');
              const userInput = `${expenseData.description} ${expenseData.amount} ${expenseData.currency}`;
              
              const aiResult = await openaiService.parseExpense(userInput);
              if (aiResult && aiResult.category) {
                expenseData.category = aiResult.category;
              }
              if (aiResult && aiResult.description && aiResult.description !== expenseData.description) {
                expenseData.description = aiResult.description;
              }
            }
          } catch (aiError) {
            // Continue without AI processing if it fails
            logger.warn(`AI processing failed for row ${rowNumber}:`, aiError.message);
          }

          await expenseService.create(expenseData);
          imported++;
        } catch (error) {
          errors.push(`Row ${rowNumber}: ${error.message}`);
          logger.error(`Failed to import row ${rowNumber}:`, error);
        }
      }

      logger.info(`📊 Sync completed from "${sheetName}": ${imported} imported, ${errors.length} errors`);
      return { imported, errors };
    } catch (error) {
      logger.error('❌ Failed to sync from Google Sheets:', error);
      
      // Helpful error messages
      if (error.message.includes('404')) {
        throw new Error('Google таблица не найдена. Проверьте правильность подключения.');
      } else if (error.message.includes('403')) {
        throw new Error('Нет доступа к Google таблице. Проверьте права доступа.');
      } else {
        throw new Error('Не удалось синхронизировать с Google таблицей');
      }
    }
  }

  async findExpenseBySheetRow(projectId, rowNumber) {
    try {
      const expenses = await expenseService.findByProject(projectId, 1000, 0);
      return expenses.find(exp => exp.sheets_row_id === rowNumber && exp.source_text === 'sheets');
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

  async createWorksheet(spreadsheetId, sheetTitle) {
    try {
      if (!this.auth) {
        throw new Error('Google Sheets service not initialized');
      }

      // Check if sheet with this name already exists
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties.title'
      });

      const existingSheet = spreadsheet.data.sheets.find(
        sheet => sheet.properties.title === sheetTitle
      );

      if (existingSheet) {
        logger.info(`Sheet "${sheetTitle}" already exists`);
        return existingSheet.properties.sheetId;
      }

      // Create new worksheet
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetTitle
              }
            }
          }]
        }
      });

      const newSheetId = response.data.replies[0].addSheet.properties.sheetId;

      // Add header row to the new sheet
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetTitle}!A1:G1`,
        valueInputOption: 'RAW',
        resource: {
          values: [[
            'Дата',
            'Описание',
            'Сумма',
            'Валюта', 
            'Категория',
            'Пользователь',
            'Источник'
          ]]
        }
      });

      // Protect sheet name from being renamed
      await this.protectSheetName(spreadsheetId, newSheetId, sheetTitle);

      logger.info(`Created new sheet "${sheetTitle}" with ID: ${newSheetId}`);
      return newSheetId;

    } catch (error) {
      logger.error(`Failed to create worksheet "${sheetTitle}":`, error);
      throw error;
    }
  }

  async protectSheetName(spreadsheetId, sheetId, sheetTitle) {
    try {
      if (!this.sheets) {
        logger.warn('Google Sheets not available - skipping sheet name protection');
        return;
      }

      // Add protected range for sheet properties (prevents renaming)
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addProtectedRange: {
              protectedRange: {
                range: {
                  sheetId: sheetId
                },
                description: `⚠️ Не переименовывайте лист "${sheetTitle}" вручную! Используйте настройки проекта в боте.`,
                warningOnly: true,
                editors: {
                  users: []
                }
              }
            }
          }]
        }
      });

      logger.info(`Protected sheet name for "${sheetTitle}" (ID: ${sheetId})`);
    } catch (error) {
      logger.warn(`Could not protect sheet name for "${sheetTitle}":`, error.message);
      // Don't throw - this is not critical
    }
  }

  async renameSheet(spreadsheetId, oldName, newName) {
    try {
      if (!this.auth) {
        throw new Error('Google Sheets service not initialized');
      }

      // Get spreadsheet to find the sheet ID
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      // Find the sheet with the old name
      const targetSheet = spreadsheet.data.sheets.find(
        sheet => sheet.properties.title === oldName
      );

      if (!targetSheet) {
        logger.warn(`Sheet "${oldName}" not found, skipping rename`);
        return;
      }

      // Rename the sheet
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            updateSheetProperties: {
              properties: {
                sheetId: targetSheet.properties.sheetId,
                title: newName
              },
              fields: 'title'
            }
          }]
        }
      });

      logger.info(`Renamed Google Sheet from "${oldName}" to "${newName}"`);
    } catch (error) {
      logger.error(`Failed to rename sheet from "${oldName}" to "${newName}":`, error);
      throw error;
    }
  }

  // Update transaction in Google Sheets
  async updateTransactionInSheet(transaction, projectId, type = 'expense') {
    try {
      if (!this.sheets) {
        logger.debug('Google Sheets not available - skipping transaction update');
        return;
      }

      const project = await projectService.findById(projectId);
      if (!project?.google_sheet_id) {
        logger.debug('No Google Sheet ID for project:', projectId);
        return;
      }

      // If transaction doesn't have sheets_row_id, it can't be updated
      if (!transaction.sheets_row_id) {
        logger.debug('Transaction has no sheets_row_id - cannot update in sheets');
        return;
      }

      const user = await userService.findById(transaction.user_id);
      const authorName = user?.username || user?.first_name || 'Unknown';

      // For expenses, make amount negative; for incomes, keep positive
      const amount = type === 'expense' ? -Math.abs(transaction.amount) : Math.abs(transaction.amount);
      const date = type === 'expense' ? transaction.expense_date : transaction.income_date;

      const values = [[
        this.formatDate(date),
        transaction.description,
        amount,
        transaction.currency,
        transaction.category,
        authorName,
        type
      ]];

      // Use project name as sheet name
      const sheetName = project.name;
      const range = `${sheetName}!A${transaction.sheets_row_id}:G${transaction.sheets_row_id}`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: project.google_sheet_id,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: { values }
      });

      logger.info(`Updated ${type} in Google Sheets: row ${transaction.sheets_row_id}, project: ${project.name}`);

    } catch (error) {
      logger.error(`Failed to update ${type} in Google Sheets:`, error);
      // Don't throw error - this is not critical for the operation
    }
  }

  // Delete transaction from Google Sheets
  async deleteTransactionFromSheet(transaction, projectId, type = 'expense') {
    try {
      if (!this.sheets) {
        logger.debug('Google Sheets not available - skipping transaction deletion');
        return;
      }

      const project = await projectService.findById(projectId);
      if (!project?.google_sheet_id) {
        logger.debug('No Google Sheet ID for project:', projectId);
        return;
      }

      // If transaction doesn't have sheets_row_id, it can't be deleted
      if (!transaction.sheets_row_id) {
        logger.debug('Transaction has no sheets_row_id - cannot delete from sheets');
        return;
      }

      const sheetName = project.name;

      // Delete the row by clearing its content and then deleting the row
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: project.google_sheet_id,
        resource: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: 0, // This should be dynamically determined based on sheet name
                dimension: 'ROWS',
                startIndex: transaction.sheets_row_id - 1, // 0-based index
                endIndex: transaction.sheets_row_id
              }
            }
          }]
        }
      });

      logger.info(`Deleted ${type} from Google Sheets: row ${transaction.sheets_row_id}, project: ${project.name}`);

    } catch (error) {
      logger.error(`Failed to delete ${type} from Google Sheets:`, error);
      // Don't throw error - this is not critical for the operation
    }
  }
}

module.exports = new GoogleSheetsService();