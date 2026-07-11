import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expandCopybooks } from '../parser/copybook-resolver.js';
import { parseCobol, convertToScala } from '../index.js';

const CUSTOMER_COPYBOOK = `       01  CUSTOMER-RECORD.
           05  CUST-ID        PIC 9(6).
           05  CUST-NAME      PIC X(30).
`;

const PROGRAM_WITH_COPY = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. COPYDEMO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY CUSTOMER.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 123456 TO CUST-ID
           STOP RUN.
`;

test('expandCopybooks inlines copybook content', () => {
  const { source, expanded, missing } = expandCopybooks(PROGRAM_WITH_COPY, {
    CUSTOMER: CUSTOMER_COPYBOOK,
  });
  assert.deepEqual(expanded, ['CUSTOMER']);
  assert.deepEqual(missing, []);
  assert.ok(source.includes('CUSTOMER-RECORD'));
  assert.ok(!/\bCOPY\s+CUSTOMER\s*\./.test(source), 'COPY statement should be replaced');
});

test('expandCopybooks lookup is case-insensitive and extension-tolerant', () => {
  const byExtension = expandCopybooks(PROGRAM_WITH_COPY, {
    'customer.cpy': CUSTOMER_COPYBOOK,
  });
  assert.deepEqual(byExtension.expanded, ['CUSTOMER']);
  assert.ok(byExtension.source.includes('CUSTOMER-RECORD'));
});

test('expandCopybooks reports missing copybooks and leaves COPY in place', () => {
  const { source, expanded, missing } = expandCopybooks(PROGRAM_WITH_COPY, {
    OTHERBOOK: '01 X PIC 9.',
  });
  assert.deepEqual(expanded, []);
  assert.deepEqual(missing, ['CUSTOMER']);
  assert.ok(/\bCOPY\s+CUSTOMER\s*\./i.test(source));
});

test('expandCopybooks applies REPLACING with pseudo-text', () => {
  const copybook = `       01  :PRE:-RECORD.
           05  :PRE:-ID   PIC 9(6).
`;
  const program = `       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY GENERIC REPLACING ==:PRE:== BY ==CUST==.
`;
  const { source } = expandCopybooks(program, { GENERIC: copybook });
  assert.ok(source.includes('CUST-RECORD'));
  assert.ok(source.includes('CUST-ID'));
  assert.ok(!source.includes(':PRE:'));
});

test('expandCopybooks applies REPLACING with plain words', () => {
  const copybook = '       01  OLD-NAME  PIC X(10).\n';
  const program = `       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY WORDS REPLACING OLD-NAME BY NEW-NAME.
`;
  const { source } = expandCopybooks(program, { WORDS: copybook });
  assert.ok(source.includes('NEW-NAME'));
  assert.ok(!source.includes('OLD-NAME'));
});

test('expandCopybooks handles nested copybooks', () => {
  const outer = '       COPY INNER.\n';
  const inner = '       01  NESTED-FIELD  PIC 9(3).\n';
  const program = '       WORKING-STORAGE SECTION.\n       COPY OUTER.\n';
  const { source, expanded } = expandCopybooks(program, { OUTER: outer, INNER: inner });
  assert.ok(source.includes('NESTED-FIELD'));
  assert.ok(expanded.includes('OUTER'));
  assert.ok(expanded.includes('INNER'));
});

test('expandCopybooks survives circular copybooks', () => {
  const a = '       COPY BOOK-B.\n';
  const b = '       COPY BOOK-A.\n';
  const program = '       COPY BOOK-A.\n';
  const { source } = expandCopybooks(program, { 'BOOK-A': a, 'BOOK-B': b });
  assert.ok(source.includes('CIRCULAR COPY'), 'circular reference should be marked, not looped');
});

test('parseCobol with copybooks option produces the copybook fields', () => {
  const result = parseCobol(PROGRAM_WITH_COPY, {
    copybooks: { CUSTOMER: CUSTOMER_COPYBOOK },
  });
  assert.deepEqual(result.copybooks.expanded, ['CUSTOMER']);
  const record = result.dataItems.workingStorageSection.items[0];
  assert.equal(record.name, 'CUSTOMER-RECORD');
  assert.equal(record.children.length, 2);
});

test('convertToScala with copybooks generates the record case class', () => {
  const result = convertToScala(PROGRAM_WITH_COPY, {
    copybooks: { CUSTOMER: CUSTOMER_COPYBOOK },
  });
  assert.match(result.scala, /case class CustomerRecord/);
  assert.match(result.scala, /custId: Int/);
  assert.deepEqual(result.copybooks.expanded, ['CUSTOMER']);
});
