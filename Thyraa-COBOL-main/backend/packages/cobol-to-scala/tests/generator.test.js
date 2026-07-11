import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { convertToScala } from '../index.js';
import {
  itemByteLength,
  elementaryByteLength,
  scalaBaseType,
  occursCount,
} from '../generator/layout.js';
import { tokenize } from '../parser/lexer.js';
import { parseDataDivision } from '../parser/data-division-parser.js';

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

function parseRecord(source) {
  const tokens = tokenize(source, { format: 'fixed' });
  return parseDataDivision(tokens).workingStorageSection.items[0];
}

test('record layout: byte lengths honor PIC and USAGE clauses', () => {
  const record = parseRecord(SIMPLE_PROGRAM);
  const [custId, custName, custBalance, custOrders] = record.children;

  assert.equal(elementaryByteLength(custId), 6);        // PIC 9(6) DISPLAY
  assert.equal(elementaryByteLength(custName), 30);      // PIC X(30)
  assert.equal(elementaryByteLength(custBalance), 5);    // S9(7)V99 COMP-3 -> ceil(10/2)
  assert.equal(elementaryByteLength(custOrders), 4);     // one occurrence of PIC 9(4)
  assert.equal(occursCount(custOrders), 5);
  assert.equal(itemByteLength(custOrders), 20);          // 5 occurrences
  assert.equal(itemByteLength(record), 61);              // 6 + 30 + 5 + 20
});

test('type mapping: PIC clauses map to correct Scala types', () => {
  const record = parseRecord(SIMPLE_PROGRAM);
  const [custId, custName, custBalance] = record.children;

  assert.equal(scalaBaseType(custId), 'Int');
  assert.equal(scalaBaseType(custName), 'String');
  assert.equal(scalaBaseType(custBalance), 'BigDecimal');
});

test('generated Scala contains correct record structure and length', () => {
  const result = convertToScala(SIMPLE_PROGRAM, {});
  const code = result.scala;

  assert.match(code, /case class CustomerRecord\(/);
  assert.match(code, /custId: Int/);
  assert.match(code, /custName: String/);
  assert.match(code, /custBalance: BigDecimal/);
  assert.match(code, /custOrders: Vector\[Int\]/);
  assert.match(code, /val recordLength: Int = 61/);
});

test('generated Scala never contains [object Object]', () => {
  const result = convertToScala(SIMPLE_PROGRAM, {});
  assert.ok(!result.scala.includes('[object Object]'),
    'generator must not stringify raw AST nodes');
});

test('generated Scala has no duplicate case class parameter names', () => {
  const source = `       01  PADDED-RECORD.
           05  FILLER         PIC X(5).
           05  REAL-FIELD     PIC 9(3).
           05  FILLER         PIC X(2).
`;
  const result = convertToScala(source, {});
  const code = result.scala;
  const paramSection = code.slice(code.indexOf('case class'), code.indexOf(')'));
  const params = [...paramSection.matchAll(/(\w+):/g)].map(m => m[1]);
  const unique = new Set(params);
  assert.equal(params.length, unique.size, `duplicate parameters found: ${params}`);
});

test('COMPUTE generates an assignment to each target', () => {
  const result = convertToScala(SIMPLE_PROGRAM, {});
  assert.match(result.scala, /custBalance = \(\(custBalance \* 1\.05\) \+ 10\)/);
});

test('IF condition converts relational operators', () => {
  const result = convertToScala(SIMPLE_PROGRAM, {});
  assert.match(result.scala, /if custBalance > 1000/);
});

test('REDEFINES fields do not inflate the record length', () => {
  const source = `       01  DATE-RECORD.
           05  DATE-NUM       PIC 9(8).
           05  DATE-PARTS     REDEFINES DATE-NUM.
               10  DATE-YYYY  PIC 9(4).
               10  DATE-MM    PIC 9(2).
               10  DATE-DD    PIC 9(2).
`;
  const record = parseRecord(source);
  assert.equal(itemByteLength(record), 8, 'REDEFINES overlays existing storage');
});

test('sample copybook converts to Scala with case classes', async () => {
  const copybook = await fs.readFile(path.join(__dirname, 'samples/COPYBOOK.cpy'), 'utf-8');
  const result = convertToScala(copybook, { packageName: 'com.bank.accounts' });
  assert.ok(result.scala.length > 0);
  assert.match(result.scala, /package com\.bank\.accounts/);
  assert.match(result.scala, /case class/);
  assert.ok(!result.scala.includes('[object Object]'));
});

test('sample programs convert without throwing', async () => {
  for (const file of ['CUSTOMER.cbl', 'TRANSACTION.cbl']) {
    const source = await fs.readFile(path.join(__dirname, 'samples', file), 'utf-8');
    const result = convertToScala(source, {});
    assert.ok(result.scala.length > 0, `${file} should produce Scala output`);
    assert.ok(!result.scala.includes('[object Object]'), `${file} output must not contain [object Object]`);
  }
});
