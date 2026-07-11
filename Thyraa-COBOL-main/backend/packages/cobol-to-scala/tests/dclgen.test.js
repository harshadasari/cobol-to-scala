/**
 * tests/dclgen.test.js
 *
 * Asserts parser/dclgen-parser.js against a hand-derived synthetic corpus
 * (tests/corpus/dclgen/*.dclgen + *.expected.json), plus focused robustness
 * cases (comment-line tolerance, group/VARCHAR host variables, a missing
 * DECLARE block).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDclgen } from '../parser/dclgen-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus', 'dclgen');

function readCorpus(baseName) {
  const dclgen = fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.dclgen`), 'utf8');
  const expected = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.expected.json`), 'utf8'));
  return { dclgen, expected };
}

for (const baseName of ['d01-employee', 'd02-dept']) {
  test(`parseDclgen matches hand-derived model: ${baseName}`, () => {
    const { dclgen, expected } = readCorpus(baseName);
    const model = parseDclgen(dclgen);
    assert.deepStrictEqual(model, expected);
  });
}

test('d01: DECIMAL(9,2) precision/scale and nullable/NOT NULL mix are correct', () => {
  const { dclgen } = readCorpus('d01-employee');
  const model = parseDclgen(dclgen);
  const salary = model.columns.find((c) => c.name === 'SALARY');
  assert.deepEqual(salary, { name: 'SALARY', sqlType: 'DECIMAL', precision: 9, scale: 2, nullable: true });
  const empId = model.columns.find((c) => c.name === 'EMP_ID');
  assert.equal(empId.nullable, false);
});

test('d01: VARCHAR column maps positionally to the 10-level group host variable, not the nested 49-level -TEXT field', () => {
  const { dclgen } = readCorpus('d01-employee');
  const model = parseDclgen(dclgen);
  const mapping = model.columnToHost.find((m) => m.column === 'EMP_NAME');
  assert.equal(mapping.hostVar, 'EMP-NAME');
  // The nested LEN/TEXT pair is still reported in the full host-variable list.
  assert.ok(model.hostVariables.some((v) => v.cobolName === 'EMP-NAME-LEN' && v.level === 49));
  assert.ok(model.hostVariables.some((v) => v.cobolName === 'EMP-NAME-TEXT' && v.level === 49));
});

test('d02: simple table with no VARCHAR/DECIMAL still gets 1:1 positional column<->host mapping', () => {
  const { dclgen } = readCorpus('d02-dept');
  const model = parseDclgen(dclgen);
  assert.equal(model.columns.length, model.columnToHost.length);
  assert.deepEqual(
    model.columnToHost.map((m) => m.column),
    ['DEPT_CODE', 'DEPT_NAME', 'MGR_ID'],
  );
});

// ---------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------

test('robustness: COBOL comment lines (leading *) inside the host-variable block are skipped, not misparsed', () => {
  const text = `
    EXEC SQL DECLARE T TABLE
    ( COL_A INTEGER NOT NULL
    ) END-EXEC.
       01  DCLT.
      * COL_A
           10 COL-A PIC S9(9) USAGE COMP.
      ****END OF DECLARATION*****
`;
  const model = parseDclgen(text);
  assert.equal(model.hostVariables.length, 1);
  assert.equal(model.hostVariables[0].cobolName, 'COL-A');
  assert.deepEqual(model.unrecognized, []);
});

test('robustness: a field with no USAGE clause defaults to DISPLAY', () => {
  const text = `
    EXEC SQL DECLARE T TABLE
    ( COL_A CHAR(4)
    ) END-EXEC.
       01  DCLT.
           10 COL-A PIC X(4).
`;
  const model = parseDclgen(text);
  assert.equal(model.hostVariables[0].usage, 'DISPLAY');
});

test('robustness: a group item (no PIC clause) is reported with null picture/usage', () => {
  const text = `
    EXEC SQL DECLARE T TABLE
    ( NOTE VARCHAR(5)
    ) END-EXEC.
       01  DCLT.
           10 NOTE.
              49 NOTE-LEN PIC S9(4) USAGE COMP.
              49 NOTE-TEXT PIC X(5).
`;
  const model = parseDclgen(text);
  const group = model.hostVariables.find((v) => v.cobolName === 'NOTE');
  assert.deepEqual(group, { cobolName: 'NOTE', level: 10, picture: null, usage: null });
});

test('robustness: missing DECLARE TABLE block is reported in unrecognized, not silently dropped', () => {
  const text = `
       01  DCLT.
           10 COL-A PIC X(4).
`;
  const model = parseDclgen(text);
  assert.equal(model.tableName, null);
  assert.equal(model.columns.length, 0);
  assert.ok(model.unrecognized.some((u) => u.kind === 'declare-table'));
});

test('robustness: missing COBOL 01-record is reported in unrecognized, not silently dropped', () => {
  const text = `
    EXEC SQL DECLARE T TABLE
    ( COL_A INTEGER
    ) END-EXEC.
`;
  const model = parseDclgen(text);
  assert.equal(model.recordName, null);
  assert.deepEqual(model.hostVariables, []);
  assert.ok(model.unrecognized.some((u) => u.kind === 'host-record'));
});

test('robustness: SMALLINT and DECIMAL with omitted scale default scale to 0', () => {
  const text = `
    EXEC SQL DECLARE T TABLE
    ( A SMALLINT NOT NULL,
      B DECIMAL(5)
    ) END-EXEC.
       01  DCLT.
           10 A PIC S9(4) USAGE COMP.
           10 B PIC S9(5) USAGE COMP-3.
`;
  const model = parseDclgen(text);
  assert.deepEqual(model.columns[0], { name: 'A', sqlType: 'SMALLINT', precision: null, scale: null, nullable: false });
  assert.deepEqual(model.columns[1], { name: 'B', sqlType: 'DECIMAL', precision: 5, scale: 0, nullable: true });
});
