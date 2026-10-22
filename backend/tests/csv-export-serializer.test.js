import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_EXPORT_COLUMNS, serializeCsv } from '../src/services/csv-export.js';

const baseRow = {
  caseNumber: 'PQRS-2026-000001',
  type: 'petition',
  subject: 'A routine request',
  status: 'filed',
  createdAt: '2026-01-02T03:04:05.000Z',
};

test('empty exports include the stable header, UTF-8 BOM and CRLF record ending', () => {
  const csv = serializeCsv([]);

  assert.equal(csv, `\uFEFF${CSV_EXPORT_COLUMNS.map((column) => `"${column}"`).join(',')}\r\n`);
  assert.deepEqual([...Buffer.from(csv).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(csv.endsWith('\r\n'), true);
});

test('headers and data use a stable column order and quote delimiters, quotes and line breaks', () => {
  const csv = serializeCsv([
    {
      ...baseRow,
      subject: 'Commas, quotes "and"\r\nmultiple lines',
    },
  ]);

  assert.equal(
    csv,
    '\uFEFF"Case number","Request type","Subject","Current status","Submitted at (UTC)"\r\n' +
      '"PQRS-2026-000001","petition","Commas, quotes ""and""\r\nmultiple lines","filed","2026-01-02T03:04:05.000Z"\r\n',
  );
});

test('Unicode, Spanish accents and non-English names in text are preserved', () => {
  const csv = serializeCsv([{ ...baseRow, subject: 'Revisión de la solicitud — 東京' }]);

  assert.ok(csv.includes('Revisión de la solicitud — 東京'));
  assert.ok(Buffer.from(csv, 'utf8').toString('utf8').includes('Revisión'));
});

test('null, missing and malformed structured values serialize as empty cells', () => {
  const csv = serializeCsv([
    null,
    {
      caseNumber: null,
      type: 'unknown',
      subject: null,
      status: undefined,
      createdAt: 'not a timestamp',
    },
  ]);

  assert.ok(csv.endsWith('"","","","",""\r\n'));
  assert.equal(csv.split('\r\n').length, 4);
});

test('formula-significant characters after whitespace and controls are neutralized', () => {
  const attacks = [
    '=1+1',
    '+1+1',
    '-1+1',
    '@SUM(A1:A2)',
    ' =1+1',
    '\t=1+1',
    '\r=1+1',
    '\n=1+1',
    '\u0001@SUM(A1:A2)',
    '\u00a0+1+1',
    '\u200b=1+1',
  ];

  for (const subject of attacks) {
    const csv = serializeCsv([{ ...baseRow, subject }]);
    assert.ok(csv.includes(`,"'${subject}",`), JSON.stringify(subject));
  }
});

test('untrusted text containing delimiters cannot create another CSV cell', () => {
  const csv = serializeCsv([
    { ...baseRow, subject: 'ordinary","=HYPERLINK("https://example.test")' },
  ]);
  const row = csv.slice(csv.indexOf('\r\n') + 2);

  assert.equal(
    row,
    '"PQRS-2026-000001","petition","ordinary"",""=HYPERLINK(""https://example.test"")","filed","2026-01-02T03:04:05.000Z"\r\n',
  );
});

test('export output is deterministic for a fixed set of rows', () => {
  const rows = [baseRow, { ...baseRow, caseNumber: 'PQRS-2026-000002' }];

  assert.equal(serializeCsv(rows), serializeCsv(rows));
});
