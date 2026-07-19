const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = __dirname;

function walkJsFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkSyntax(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  new vm.Script(source, { filename: filePath });
}

function runSyntaxChecks() {
  for (const filePath of walkJsFiles(path.join(ROOT, 'src'))) {
    checkSyntax(filePath);
  }
}

function runNormalizerChecks() {
  const {
    normalizeCategoryFromText,
    hasExplicitCurrencyMarker,
    collapseSplitTransactions
  } = require('./src/utils/transactionNormalizer');

  assert.strictEqual(normalizeCategoryFromText('мясо 18 евро', 'Покупки'), 'Еда');
  assert.strictEqual(hasExplicitCurrencyMarker('мясо 18 евро', 'EUR'), true);
  assert.strictEqual(hasExplicitCurrencyMarker('кофе 12', 'EUR'), false);

  const collapsed = collapseSplitTransactions(
    '12 булки и кофе',
    [
      { type: 'expense', amount: 12, currency: 'EUR', description: 'Булки', category: 'Покупки' },
      { type: 'expense', amount: 1, currency: 'EUR', description: 'Кофе', category: 'Еда' }
    ],
    { primaryCurrency: 'EUR' }
  );

  assert.strictEqual(collapsed.length, 1);
  assert.strictEqual(collapsed[0].amount, 12);
  assert.strictEqual(collapsed[0].category, 'Еда');
}

function runExportChecks() {
  const {
    buildTransactionRows,
    generateCsvBuffer,
    generateXlsxBuffer,
    XLSX_MIME_TYPE
  } = require('./src/utils/export');

  const rows = buildTransactionRows(
    [{
      expense_date: '2026-07-17',
      description: 'Мясо',
      amount: 18,
      currency: 'EUR',
      category: 'Еда',
      project_name: 'Семейный бюджет'
    }],
    [{
      income_date: '2026-07-16',
      description: 'Зарплата',
      amount: 100,
      currency: 'EUR',
      category: 'Зарплата',
      project_name: 'Семейный бюджет'
    }]
  );

  assert.strictEqual(rows[0][0], 'Дата');
  assert.strictEqual(rows.length, 3);
  assert.ok(generateCsvBuffer(rows).length > 20);

  const xlsx = generateXlsxBuffer(rows, 'Transactions');
  assert.strictEqual(XLSX_MIME_TYPE, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.strictEqual(xlsx.slice(0, 2).toString('utf8'), 'PK');
  assert.ok(xlsx.includes(Buffer.from('[Content_Types].xml')));
  assert.ok(xlsx.includes(Buffer.from('xl/workbook.xml')));
}

function main() {
  runSyntaxChecks();
  runNormalizerChecks();
  runExportChecks();
  console.log('safe:test passed');
}

main();
