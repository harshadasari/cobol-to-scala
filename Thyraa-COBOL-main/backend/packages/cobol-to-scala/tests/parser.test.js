import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { tokenize } from '../parser/lexer.js';
import { TokenType } from '../parser/tokens.js';
import { parseDataDivision } from '../parser/data-division-parser.js';
import { parseProcedureDivision } from '../parser/procedure-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SIMPLE_PROGRAM = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. DEMO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  CUSTOMER-RECORD.
           05  CUST-ID        PIC 9(6).
           05  CUST-NAME      PIC X(30).
           05  CUST-BALANCE   PIC S9(7)V99 COMP-3.
           05  CUST-ORDERS    OCCURS 5 TIMES PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE CUST-BALANCE = CUST-BALANCE * 1.05 + 10
           MOVE 'HELLO' TO CUST-NAME
           IF CUST-BALANCE > 1000
               DISPLAY 'BIG: ' CUST-BALANCE
           END-IF
           STOP RUN.
`;

test('lexer captures picture strings as single PICTURE_STRING tokens', () => {
  const tokens = tokenize('       01  F1  PIC 9(6).', { format: 'fixed' });
  const picToken = tokens.find(t => t.type === TokenType.PICTURE_STRING);
  assert.ok(picToken, 'expected a PICTURE_STRING token');
  assert.equal(picToken.value, '9(6)');
});

test('lexer handles signed decimal and edited pictures', () => {
  const cases = [
    ['       01  F1  PIC S9(7)V99.', 'S9(7)V99'],
    ['       01  F2  PIC X(30).', 'X(30)'],
    ['       01  F3  PIC ZZ,ZZ9.99.', 'ZZ,ZZ9.99'],
    ['       01  F4  PIC 9(3)V9(2).', '9(3)V9(2)'],
  ];
  for (const [source, expected] of cases) {
    const tokens = tokenize(source, { format: 'fixed' });
    const picToken = tokens.find(t => t.type === TokenType.PICTURE_STRING);
    assert.ok(picToken, `expected PICTURE_STRING for ${source}`);
    assert.equal(picToken.value, expected);
  }
});

test('digits inside PIC clauses are not misread as level numbers', () => {
  const tokens = tokenize('       05  CUST-ID  PIC 9(6).', { format: 'fixed' });
  // The 9 and 6 of "9(6)" must be inside the PICTURE_STRING token, never
  // loose numeric/level tokens that the parser would misread as new items.
  const looseDigits = tokens.filter(t =>
    (t.type === TokenType.NUMERIC_LITERAL || t.type === TokenType.LEVEL_NUMBER) &&
    (t.value === '9' || t.value === '6')
  );
  assert.equal(looseDigits.length, 0, 'PIC digits leaked out of the picture string');
  const picToken = tokens.find(t => t.type === TokenType.PICTURE_STRING);
  assert.equal(picToken?.value, '9(6)');
});

test('data division parsing produces correct structure without phantom items', () => {
  const tokens = tokenize(SIMPLE_PROGRAM, { format: 'fixed' });
  const sections = parseDataDivision(tokens);
  const items = sections.workingStorageSection.items;

  assert.equal(items.length, 1);
  const record = items[0];
  assert.equal(record.name, 'CUSTOMER-RECORD');
  assert.equal(record.children.length, 4);

  const [custId, custName, custBalance, custOrders] = record.children;

  assert.equal(custId.name, 'CUST-ID');
  assert.equal(custId.children.length, 0, 'elementary item must not gain phantom children');
  assert.equal(custId.pic.pattern, '9(6)');
  assert.equal(custId.pic.dataType, 'numeric');
  assert.equal(custId.pic.length, 6);

  assert.equal(custName.pic.pattern, 'X(30)');
  assert.equal(custName.pic.dataType, 'alphanumeric');
  assert.equal(custName.pic.length, 30);

  assert.equal(custBalance.pic.pattern, 'S9(7)V99');
  assert.equal(custBalance.pic.signed, true);
  assert.equal(custBalance.pic.integerDigits, 7);
  assert.equal(custBalance.pic.decimalDigits, 2);
  assert.equal(custBalance.usage, 'COMP-3', 'COMP-3 usage must be recognized');

  assert.equal(custOrders.occurs.times, 5);
  assert.equal(custOrders.pic.pattern, '9(4)');
});

test('level 88 conditions are attached, not treated as fields', () => {
  const source = `       01  WS-STATUS      PIC X.
           88  STATUS-OK    VALUE 'Y'.
           88  STATUS-BAD   VALUE 'N'.
`;
  const tokens = tokenize(source, { format: 'fixed' });
  const sections = parseDataDivision(tokens);
  const item = sections.workingStorageSection.items[0];
  assert.equal(item.name, 'WS-STATUS');
  const conditionChildren = item.children.filter(c => c.level === 88);
  const conditions = (item.conditions || []).length + conditionChildren.length;
  assert.equal(conditions, 2, 'both level-88 entries should be captured');
});

test('procedure division parses paragraphs and statements', () => {
  const tokens = tokenize(SIMPLE_PROGRAM, { format: 'fixed' });
  const division = parseProcedureDivision(tokens);
  const paragraphs = division.paragraphs || division;
  assert.ok(paragraphs.length >= 1);
  const main = paragraphs[0];
  assert.equal(main.name, 'MAIN-PARA');
  const types = main.statements.map(s => s.type);
  assert.ok(types.includes('ComputeStatement'), `expected ComputeStatement in ${types}`);
  assert.ok(types.includes('MoveStatement'), `expected MoveStatement in ${types}`);
  assert.ok(types.includes('IfStatement'), `expected IfStatement in ${types}`);
});

test('sample files tokenize and parse without throwing', async () => {
  for (const file of ['COPYBOOK.cpy', 'CUSTOMER.cbl', 'TRANSACTION.cbl']) {
    const source = await fs.readFile(path.join(__dirname, 'samples', file), 'utf-8');
    const tokens = tokenize(source);
    assert.ok(tokens.length > 0, `${file} should produce tokens`);
    assert.doesNotThrow(() => parseDataDivision(tokens), `${file} data division`);
    assert.doesNotThrow(() => parseProcedureDivision(tokens), `${file} procedure division`);
  }
});
