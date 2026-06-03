const { google } = require('googleapis');
const { projectService, projectSheetService, expenseService, incomeService, userService } = require('./supabase');
const logger = require('../utils/logger');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.credentials = null;
    this.initAuth();
  }

  getServiceAccountEmail() {
    return this.credentials?.client_email || null;
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
        this.credentials = null;
        return;
      }

      this.credentials = credentials;
      this.auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive'
        ]
      );

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      logger.info('Google Sheets API initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Google Sheets API:', error);
      this.auth = null;
      this.sheets = null;
      this.credentials = null;
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
      const msg = error.message || '';
      if (msg.includes('403') || msg.includes('Permission')) {
        return { success: false, error: 'Нет доступа к таблице. Добавьте сервисный аккаунт как редактора.' };
      }
      if (msg.includes('404') || msg.includes('Not Found')) {
        return { success: false, error: 'Таблица не найдена. Проверьте ID или ссылку.' };
      }
      return { success: false, error: `Ошибка подключения: ${msg.slice(0, 80)}` };
    }
  }

  // Проверяем и создаем правильную структуру таблицы.
  //
  // Bug history: this used to hardcode sheetId: 0 in the batchUpdate format
  // call. That sheetId only exists on freshly-created spreadsheets whose
  // first tab was never deleted or replaced. For users connecting an
  // existing spreadsheet (with project tabs, renamed defaults, etc.) the
  // batchUpdate failed with "No grid with id: 0" and the whole connect step
  // aborted before headers were even applied. We now look up the actual
  // first-sheet ID from the spreadsheet metadata before formatting.
  async ensureSheetStructure(spreadsheetId) {
    try {
      // Discover the real first-tab sheetId — never assume 0.
      const meta = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title,index))'
      });
      const firstSheet = (meta.data.sheets || [])
        .map(s => s.properties)
        .sort((a, b) => (a.index || 0) - (b.index || 0))[0];
      if (!firstSheet) {
        throw new Error('В таблице нет ни одной вкладки.');
      }
      const firstSheetId = firstSheet.sheetId;
      const firstSheetTitle = firstSheet.title;

      // Read headers from the first tab by its actual name (so it works even
      // if the user reordered tabs).
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: this.sheetRange(firstSheetTitle, 'A1:H1')
      });

      const headers = response.data.values?.[0] || [];
      const expectedHeaders = this.getTransactionHeaders();

      if (headers.length === 0 || !this.arraysEqual(headers, expectedHeaders)) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: this.sheetRange(firstSheetTitle, 'A1:H1'),
          valueInputOption: 'RAW',
          resource: {
            values: [expectedHeaders]
          }
        });

        // Format headers — use the resolved firstSheetId, not 0.
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          resource: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: firstSheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: 0,
                    endColumnIndex: expectedHeaders.length
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
                    sheetId: firstSheetId,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: expectedHeaders.length
                  }
                }
              }
            ]
          }
        });

        logger.info(`Sheet structure created for: ${spreadsheetId} (sheet "${firstSheetTitle}", id ${firstSheetId})`);
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

  quoteSheetName(sheetName) {
    return `'${String(sheetName).replace(/'/g, "''")}'`;
  }

  sheetRange(sheetName, a1Range) {
    return `${this.quoteSheetName(sheetName)}!${a1Range}`;
  }

  extractRowNumberFromUpdatedRange(updatedRange) {
    const match = String(updatedRange || '').match(/![A-Z]+(\d+):/i);
    return match ? parseInt(match[1], 10) : null;
  }

  getTransactionHeaders() {
    return ['Дата', 'Описание', 'Сумма', 'Валюта', 'Категория', 'Автор', 'Тип', 'ID'];
  }

  async getProjectSheetConnection(project) {
    const connection = await projectSheetService.findActiveByProject(project.id);
    const spreadsheetId = connection?.google_sheet_id || project.google_sheet_id;
    if (!spreadsheetId) return null;

    return {
      spreadsheetId,
      sheetUrl: connection?.google_sheet_url || project.google_sheet_url,
      connection
    };
  }

  async ensureProjectWorksheet(spreadsheetId, sheetTitle) {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const existingSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === sheetTitle
    );

    let sheetId = existingSheet?.properties.sheetId;
    if (!existingSheet) {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: { title: sheetTitle }
            }
          }]
        }
      });
      sheetId = response.data.replies[0].addSheet.properties.sheetId;
      await this.protectSheetName(spreadsheetId, sheetId, sheetTitle);
    }

    await this.ensureHeaders(spreadsheetId, sheetTitle, sheetId);
    return { sheetName: sheetTitle, sheetId };
  }

  async ensureHeaders(spreadsheetId, sheetName, sheetId = null) {
    const expectedHeaders = this.getTransactionHeaders();
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: this.sheetRange(sheetName, 'A1:H1')
    });

    const currentHeaders = response.data.values?.[0] || [];
    if (currentHeaders.length === expectedHeaders.length && this.arraysEqual(currentHeaders, expectedHeaders)) {
      return;
    }

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: this.sheetRange(sheetName, 'A1:H1'),
      valueInputOption: 'RAW',
      resource: { values: [expectedHeaders] }
    });

    if (sheetId !== null) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: expectedHeaders.length
              }
            }
          }]
        }
      });
    }
  }

  async checkProjectSheet(spreadsheetId, projectName) {
    try {
      if (!this.sheets) {
        return { success: false, error: 'Google Sheets API не настроен' };
      }

      const sheetInfo = await this.getSheetInfo(spreadsheetId);
      if (!sheetInfo) {
        return { success: false, error: 'Таблица не найдена или нет доступа' };
      }

      if (projectName) {
        await this.ensureProjectWorksheet(spreadsheetId, projectName);
      } else {
        await this.ensureSheetStructure(spreadsheetId);
      }

      return { success: true, sheetInfo };
    } catch (error) {
      logger.error('Google Sheets health check failed:', error);
      if ((error.message || '').includes('403')) {
        return { success: false, error: 'Нет доступа на запись. Добавьте сервисный аккаунт как редактора таблицы.' };
      }
      if ((error.message || '').includes('404')) {
        return { success: false, error: 'Таблица не найдена. Проверьте ссылку или ID.' };
      }
      return { success: false, error: error.message || 'Не удалось проверить таблицу' };
    }
  }



  async shareSheetWithUser(spreadsheetId, userEmail, userName) {
    const result = await this.shareSheetWithUserDetailed(spreadsheetId, userEmail, userName);
    return result.success;
  }

  async shareSheetWithUserDetailed(spreadsheetId, userEmail, userName) {
    try {
      if (!this.auth) {
        logger.warn('Google API not available - skipping sheet sharing');
        return { success: false, error: 'Google API не настроен' };
      }

      if (!userEmail) {
        return { success: false, error: 'У участника не указан email' };
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
      return { success: true };
    } catch (error) {
      logger.error('Failed to share sheet with user:', error);
      if ((error.message || '').includes('403')) {
        return { success: false, error: 'У сервисного аккаунта нет прав управлять доступом к таблице' };
      }
      return { success: false, error: error.message || 'Не удалось выдать доступ' };
    }
  }

  async addTransactionToSheet(transaction, projectId, type = 'expense') {
    // Declare sheetName outside try block to access in catch
    let sheetName = 'unknown';
    let spreadsheetId = 'unknown';
    
    try {
      if (!this.sheets) {
        logger.debug('Google Sheets not available - skipping transaction sync');
        return;
      }

      const project = await projectService.findById(projectId);
      const projectSheet = await this.getProjectSheetConnection(project);
      if (!projectSheet?.spreadsheetId) {
        logger.debug('No Google Sheet ID for project:', projectId);
        return;
      }
      spreadsheetId = projectSheet.spreadsheetId;

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
        type,
        transaction.id
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
              range: this.sheetRange(project.name, 'A1:H1')
            });

            const currentHeaders = headerResponse.data.values?.[0] || [];
            const expectedHeaders = this.getTransactionHeaders();

            // Check if headers need updating (old format had 'Источник' instead of 'Тип')
            if (currentHeaders.length === 0 || !this.arraysEqual(currentHeaders, expectedHeaders)) {
              logger.info(`🔧 [${type.toUpperCase()}] Updating headers for existing sheet "${project.name}"`);
              await this.sheets.spreadsheets.values.update({
                spreadsheetId: project.google_sheet_id,
                range: this.sheetRange(project.name, 'A1:H1'),
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
                range: this.sheetRange(project.name, 'A1:H1'),
              valueInputOption: 'RAW',
              resource: {
                values: [this.getTransactionHeaders()]
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
      const appendResponse = await this.sheets.spreadsheets.values.append({
        spreadsheetId: project.google_sheet_id,
        range: this.sheetRange(sheetName, 'A:H'),
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values }
      });

      const sheetsRowId = this.extractRowNumberFromUpdatedRange(appendResponse.data?.updates?.updatedRange);
      const syncUpdates = {
        synced_to_sheets: true,
        ...(sheetsRowId ? { sheets_row_id: sheetsRowId } : {})
      };

      if (type === 'expense') {
        await expenseService.update(transaction.id, syncUpdates);
      } else {
        await incomeService.update(transaction.id, syncUpdates);
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
        const email = this.getServiceAccountEmail();
        logger.error(`💡 Hint: Permission denied. Make sure ${email || 'service account'} is added as Editor to the Google Sheet.`);
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
      const projectSheet = await this.getProjectSheetConnection(project);
      if (!projectSheet?.spreadsheetId) {
        return { imported: 0, errors: ['No Google Sheet linked to project'] };
      }
      const spreadsheetId = projectSheet.spreadsheetId;

      // Get the sheet tab name matching the project name
      let sheetName = project.name;
      try {
        const spreadsheet = await this.sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'sheets.properties.title'
        });

        if (spreadsheet.data.sheets && spreadsheet.data.sheets.length > 0) {
          const matchingSheet = spreadsheet.data.sheets.find(
            s => s.properties.title === project.name
          );
          sheetName = matchingSheet
            ? matchingSheet.properties.title
            : spreadsheet.data.sheets[0].properties.title;
        }
      } catch (error) {
        logger.warn('Could not get sheet name for sync, using default:', error.message);
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: this.sheetRange(sheetName, 'A2:H'), // Skip header row
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
          const isIncome = transactionType === 'income';
          const externalId = row[7];

          let transactionData = {
            user_id: userId,
            project_id: projectId,
            amount: Math.abs(parseFloat(row[2])) || 0,
            currency: row[3] || defaultCurrency,
            category: row[4] || 'Прочее',
            description: row[1] || 'Manual entry',
            source: 'sheets',
            sheets_row_id: rowNumber,
            synced_to_sheets: true
          };

          if (isIncome) {
            transactionData.income_date = this.parseDate(row[0]);
          } else {
            transactionData.expense_date = this.parseDate(row[0]);
          }

          // Check if already imported
          const existing = externalId
            ? await this.findTransactionByExternalId(projectId, externalId, isIncome)
            : await this.findTransactionBySheetRow(projectId, rowNumber, isIncome);

          if (existing) {
            // Update existing entry if data changed in Google Sheets
            const dateField = isIncome ? 'income_date' : 'expense_date';
            const hasChanges =
              existing.amount !== transactionData.amount ||
              existing.currency !== transactionData.currency ||
              existing.category !== transactionData.category ||
              existing.description !== transactionData.description ||
              existing[dateField] !== transactionData[dateField];

            if (hasChanges) {
              const service = isIncome ? incomeService : expenseService;
              await service.update(existing.id, transactionData);
              imported++;
              logger.info(`Updated ${isIncome ? 'income' : 'expense'} from sheet row ${rowNumber}`);
            }
            continue;
          }

          const matching = await this.findMatchingTransaction(projectId, transactionData, isIncome);
          if (matching) {
            const service = isIncome ? incomeService : expenseService;
            await service.update(matching.id, {
              sheets_row_id: rowNumber,
              synced_to_sheets: true
            });
            logger.info(`Matched existing ${isIncome ? 'income' : 'expense'} to sheet row ${rowNumber}`);
            continue;
          }

          // Apply AI categorization if needed
          try {
            const { DEFAULT_CATEGORIES } = require('../config/constants');
            const validCategories = DEFAULT_CATEGORIES.map(cat => cat.replace(/^[^\s]+ /, '')); // Remove emojis

            // Check if category needs AI processing
            const needsAIProcessing = !transactionData.category ||
                                    transactionData.category === 'Прочее' ||
                                    !validCategories.includes(transactionData.category);

            if (needsAIProcessing && transactionData.description && transactionData.description !== 'Manual entry') {
              const openaiService = require('./openai');
              const userInput = `${transactionData.description} ${transactionData.amount} ${transactionData.currency}`;

              const aiResult = await openaiService.parseExpense(userInput);
              if (aiResult && aiResult.category) {
                transactionData.category = aiResult.category;
              }
              if (aiResult && aiResult.description && aiResult.description !== transactionData.description) {
                transactionData.description = aiResult.description;
              }
            }
          } catch (aiError) {
            // Continue without AI processing if it fails
            logger.warn(`AI processing failed for row ${rowNumber}:`, aiError.message);
          }

          const service = isIncome ? incomeService : expenseService;
          await service.create(transactionData);
          imported++;
          logger.info(`Imported ${isIncome ? 'income' : 'expense'} from sheet row ${rowNumber}`);
        } catch (error) {
          errors.push(`Row ${rowNumber}: ${error.message}`);
          logger.error(`Failed to import row ${rowNumber}:`, error);
        }
      }

      logger.info(`📊 Sync completed from "${sheetName}": ${imported} imported, ${errors.length} errors`);
      await projectSheetService.markSyncResult(projectId, {
        success: errors.length === 0,
        errorMessage: errors.length ? errors.slice(0, 3).join('; ') : null
      });
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

  async findTransactionBySheetRow(projectId, rowNumber, isIncome = false) {
    try {
      const service = isIncome ? incomeService : expenseService;
      const transactions = await service.findByProject(projectId, 1000, 0);
      return transactions.find(t => t.sheets_row_id === rowNumber);
    } catch (error) {
      logger.error(`Failed to find ${isIncome ? 'income' : 'expense'} by sheet row:`, error);
      return null;
    }
  }

  async findTransactionByExternalId(projectId, transactionId, isIncome = false) {
    try {
      const service = isIncome ? incomeService : expenseService;
      const transaction = await service.findById(transactionId);
      return transaction?.project_id === projectId ? transaction : null;
    } catch (error) {
      logger.error(`Failed to find ${isIncome ? 'income' : 'expense'} by external id:`, error);
      return null;
    }
  }

  async findMatchingTransaction(projectId, transactionData, isIncome = false) {
    try {
      const service = isIncome ? incomeService : expenseService;
      const dateField = isIncome ? 'income_date' : 'expense_date';
      const transactions = await service.findByProject(projectId, 1000, 0);

      return transactions.find((t) => (
        !t.sheets_row_id &&
        Number(t.amount) === Number(transactionData.amount) &&
        (t.currency || '') === (transactionData.currency || '') &&
        (t.description || '') === (transactionData.description || '') &&
        (t.category || '') === (transactionData.category || '') &&
        t[dateField] === transactionData[dateField]
      ));
    } catch (error) {
      logger.error(`Failed to find matching ${isIncome ? 'income' : 'expense'}:`, error);
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
        'bot',
        expense.id
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'A:H',
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
        range: this.sheetRange(sheetTitle, 'A1:H1'),
        valueInputOption: 'RAW',
        resource: {
          values: [this.getTransactionHeaders()]
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
      const projectSheet = await this.getProjectSheetConnection(project);
      if (!projectSheet?.spreadsheetId) {
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
        type,
        transaction.id
      ]];

      // Use project name as sheet name
      const sheetName = project.name;
      const range = this.sheetRange(sheetName, `A${transaction.sheets_row_id}:H${transaction.sheets_row_id}`);

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: projectSheet.spreadsheetId,
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
      const projectSheet = await this.getProjectSheetConnection(project);
      if (!projectSheet?.spreadsheetId) {
        logger.debug('No Google Sheet ID for project:', projectId);
        return;
      }

      // If transaction doesn't have sheets_row_id, it can't be deleted
      if (!transaction.sheets_row_id) {
        logger.debug('Transaction has no sheets_row_id - cannot delete from sheets');
        return;
      }

      const range = this.sheetRange(project.name, `A${transaction.sheets_row_id}:H${transaction.sheets_row_id}`);

      // Clear the row instead of deleting it so stored sheets_row_id values stay stable.
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: projectSheet.spreadsheetId,
        range
      });

      logger.info(`Deleted ${type} from Google Sheets: row ${transaction.sheets_row_id}, project: ${project.name}`);

    } catch (error) {
      logger.error(`Failed to delete ${type} from Google Sheets:`, error);
      // Don't throw error - this is not critical for the operation
    }
  }
}

module.exports = new GoogleSheetsService();
