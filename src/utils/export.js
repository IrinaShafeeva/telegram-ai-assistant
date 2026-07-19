const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME_TYPE = 'text/csv';

const HEADERS = [
  '\u0414\u0430\u0442\u0430',
  '\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435',
  '\u0421\u0443\u043c\u043c\u0430',
  '\u0412\u0430\u043b\u044e\u0442\u0430',
  '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f',
  '\u041f\u0440\u043e\u0435\u043a\u0442',
  '\u0422\u0438\u043f'
];

const NO_PROJECT = '\u0411\u0435\u0437 \u043f\u0440\u043e\u0435\u043a\u0442\u0430';
const EXPENSE_TYPE = '\u0420\u0430\u0441\u0445\u043e\u0434';
const INCOME_TYPE = '\u0414\u043e\u0445\u043e\u0434';

function buildTransactionRows(expenses = [], incomes = []) {
  const rows = [HEADERS];

  expenses.forEach(expense => {
    rows.push([
      expense.expense_date,
      expense.description,
      -Math.abs(Number(expense.amount) || 0),
      expense.currency,
      expense.category,
      expense.project_name || NO_PROJECT,
      EXPENSE_TYPE
    ]);
  });

  incomes.forEach(income => {
    rows.push([
      income.income_date,
      income.description,
      Math.abs(Number(income.amount) || 0),
      income.currency,
      income.category,
      income.project_name || NO_PROJECT,
      INCOME_TYPE
    ]);
  });

  const dataRows = rows.slice(1);
  dataRows.sort((a, b) => new Date(b[0]) - new Date(a[0]));

  return [HEADERS, ...dataRows];
}

function buildExpenseRows(expenses = []) {
  return buildTransactionRows(expenses, []);
}

function generateCsvBuffer(rows) {
  const csv = rows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  return Buffer.from(`\uFEFF${csv}`, 'utf-8');
}

function generateXlsxBuffer(rows, sheetName = 'Transactions') {
  const files = {
    '[Content_Types].xml': contentTypesXml(),
    '_rels/.rels': rootRelationshipsXml(),
    'xl/workbook.xml': workbookXml(sheetName),
    'xl/_rels/workbook.xml.rels': workbookRelationshipsXml(),
    'xl/styles.xml': stylesXml(),
    'xl/worksheets/sheet1.xml': worksheetXml(rows)
  };

  return createZip(files);
}

function worksheetXml(rows) {
  const sheetData = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((value, columnIndex) => cellXml(value, columnIndex, rowNumber, rowIndex === 0))
        .join('');

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');

  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const maxRows = Math.max(rows.length, 1);
  const dimension = `A1:${columnName(Math.max(maxColumns, 1) - 1)}${maxRows}`;

  return xmlDeclaration(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols><col min="1" max="${Math.max(maxColumns, 1)}" width="18" customWidth="1"/></cols>` +
    `<sheetData>${sheetData}</sheetData>` +
    `</worksheet>`
  );
}

function cellXml(value, columnIndex, rowNumber, isHeader) {
  const ref = `${columnName(columnIndex)}${rowNumber}`;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${isHeader ? ' s="1"' : ''}><v>${value}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"${isHeader ? ' s="1"' : ''}><is><t>${escapeXml(value ?? '')}</t></is></c>`;
}

function columnName(index) {
  let name = '';
  let current = index;

  do {
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return name;
}

function workbookXml(sheetName) {
  const safeName = String(sheetName || 'Sheet1')
    .replace(/[\[\]:*?/\\]/g, ' ')
    .slice(0, 31)
    .trim() || 'Sheet1';

  return xmlDeclaration(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(safeName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

function contentTypesXml() {
  return xmlDeclaration(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`
  );
}

function rootRelationshipsXml() {
  return xmlDeclaration(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`
  );
}

function workbookRelationshipsXml() {
  return xmlDeclaration(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`
  );
}

function stylesXml() {
  return xmlDeclaration(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

function xmlDeclaration(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  Object.entries(files).forEach(([fileName, content]) => {
    const fileNameBuffer = Buffer.from(fileName, 'utf-8');
    const contentBuffer = Buffer.from(content, 'utf-8');
    const crc = crc32(contentBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileNameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, fileNameBuffer);
    offset += localHeader.length + fileNameBuffer.length + contentBuffer.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const endRecord = Buffer.alloc(22);

  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(Object.keys(files).length, 8);
  endRecord.writeUInt16LE(Object.keys(files).length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localFiles.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localFiles, centralDirectory, endRecord]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

module.exports = {
  CSV_MIME_TYPE,
  XLSX_MIME_TYPE,
  buildExpenseRows,
  buildTransactionRows,
  generateCsvBuffer,
  generateXlsxBuffer
};
