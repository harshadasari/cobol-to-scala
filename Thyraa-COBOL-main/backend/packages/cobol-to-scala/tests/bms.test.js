/**
 * tests/bms.test.js
 *
 * Asserts parser/bms-parser.js against a hand-derived synthetic BMS mapset
 * (tests/corpus/cics/custset.bms + custset.expected.json - shared with
 * tests/cics.test.js's CICS-program corpus, since both `c01-inquiry.cbl` and
 * `c02-update.cbl` reference maps defined in this same mapset), plus focused
 * robustness cases (continuation lines, unnamed fields, comments, orphan
 * macros, the `TYPE=FINAL` end marker, bare-value ATTRB) expressed inline.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBms, bmsToRecordLayout } from '../parser/bms-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.join(__dirname, 'corpus', 'cics');

function readCorpus(baseName, ext) {
  const bms = fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.bms`), 'utf8');
  const expected = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `${baseName}.${ext}`), 'utf8'));
  return { bms, expected };
}

// ---------------------------------------------------------------------
// Corpus: parsed-model equality
// ---------------------------------------------------------------------

describe('parseBms: corpus', () => {
  test('custset.bms matches hand-derived model (2 maps, mixed named/unnamed fields, INITIAL, PICOUT)', () => {
    const { bms, expected } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    assert.deepStrictEqual(model, expected);
  });

  test('custset.bms: mapset identity fields (TYPE/MODE/LANG/TIOAPFX)', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    assert.equal(model.mapsets.length, 1);
    const mapset = model.mapsets[0];
    assert.equal(mapset.name, 'CUSTSET');
    assert.equal(mapset.type, '&SYSPARM');
    assert.equal(mapset.mode, 'INOUT');
    assert.equal(mapset.lang, 'COBOL');
    assert.equal(mapset.tioapfx, 'YES');
    assert.equal(mapset.maps.length, 2);
  });

  test('custset.bms: DFHMDI SIZE/LINE/COLUMN parsed for both maps', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const [custmap, updmap] = model.mapsets[0].maps;
    assert.equal(custmap.name, 'CUSTMAP');
    assert.deepEqual(custmap.size, { rows: 24, cols: 80 });
    assert.equal(custmap.line, 1);
    assert.equal(custmap.column, 1);
    assert.equal(updmap.name, 'UPDMAP');
    assert.deepEqual(updmap.size, { rows: 24, cols: 80 });
  });

  test('custset.bms: unnamed literal field (screen title) captured with name: null', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const custmap = model.mapsets[0].maps[0];
    const title = custmap.fields[0];
    assert.equal(title.name, null);
    assert.equal(title.initial, 'CUSTOMER INQUIRY');
    assert.deepEqual(title.attrb, ['PROT', 'BRT']);
  });

  test('custset.bms: PICIN captured on CUSTNO, PICOUT captured on CUSTNAM (CUSTMAP)', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const custmap = model.mapsets[0].maps[0];
    const custno = custmap.fields.find((f) => f.name === 'CUSTNO');
    const custnam = custmap.fields.find((f) => f.name === 'CUSTNAM');
    assert.equal(custno.picin, '9(6)');
    assert.equal(custno.picout, null);
    assert.equal(custnam.picin, null);
    assert.equal(custnam.picout, 'X(30)');
  });

  test('custset.bms: UPDMAP.CUSTNAM has both PICIN and PICOUT (different from CUSTMAP.CUSTNAM)', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const updmap = model.mapsets[0].maps[1];
    const custnam = updmap.fields.find((f) => f.name === 'CUSTNAM');
    assert.equal(custnam.picin, 'X(30)');
    assert.equal(custnam.picout, 'X(30)');
  });
});

// ---------------------------------------------------------------------
// bmsToRecordLayout
// ---------------------------------------------------------------------

describe('bmsToRecordLayout', () => {
  test('named field with LENGTH n gets NAMEL/NAMEF/NAMEA control fields plus a plain data field when no PICIN/PICOUT', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const custmap = model.mapsets[0].maps[0];
    const layout = bmsToRecordLayout(custmap);
    const errmsg = layout.fields.filter((f) => f.baseName === 'ERRMSG');
    assert.deepEqual(errmsg.map((f) => f.name), ['ERRMSGL', 'ERRMSGF', 'ERRMSGA', 'ERRMSG']);
    assert.deepEqual(errmsg[0], { name: 'ERRMSGL', kind: 'length', baseName: 'ERRMSG', picture: 'S9(4) COMP', length: 2 });
    assert.deepEqual(errmsg[1], { name: 'ERRMSGF', kind: 'flag', baseName: 'ERRMSG', picture: 'X', length: 1 });
    assert.deepEqual(errmsg[2], {
      name: 'ERRMSGA', kind: 'attribute', baseName: 'ERRMSG', picture: 'X', length: 1, redefines: 'ERRMSGF',
    });
    assert.deepEqual(errmsg[3], {
      name: 'ERRMSG', kind: 'data', baseName: 'ERRMSG', direction: 'both', picture: 'X(40)', length: 40,
    });
  });

  test('a field with only PICIN gets a NAMEI data field (no bare NAME, no NAMEO)', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const custmap = model.mapsets[0].maps[0];
    const layout = bmsToRecordLayout(custmap);
    const custno = layout.fields.filter((f) => f.baseName === 'CUSTNO');
    assert.deepEqual(custno.map((f) => f.name), ['CUSTNOL', 'CUSTNOF', 'CUSTNOA', 'CUSTNOI']);
    const dataField = custno.find((f) => f.kind === 'data');
    assert.deepEqual(dataField, {
      name: 'CUSTNOI', kind: 'data', baseName: 'CUSTNO', direction: 'input', picture: '9(6)', length: 6,
    });
  });

  test('a field with only PICOUT gets a NAMEO data field (no bare NAME, no NAMEI)', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const custmap = model.mapsets[0].maps[0];
    const layout = bmsToRecordLayout(custmap);
    const custnam = layout.fields.filter((f) => f.baseName === 'CUSTNAM');
    assert.deepEqual(custnam.map((f) => f.name), ['CUSTNAML', 'CUSTNAMF', 'CUSTNAMA', 'CUSTNAMO']);
  });

  test('a field with both PICIN and PICOUT gets both NAMEI and NAMEO data fields', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const updmap = model.mapsets[0].maps[1];
    const layout = bmsToRecordLayout(updmap);
    const custnam = layout.fields.filter((f) => f.baseName === 'CUSTNAM' && f.kind === 'data');
    assert.deepEqual(custnam.map((f) => f.name).sort(), ['CUSTNAMI', 'CUSTNAMO']);
  });

  test('unnamed (literal) fields are excluded from the symbolic map entirely - documented, not silent (see file header)', () => {
    const { bms } = readCorpus('custset', 'expected.json');
    const model = parseBms(bms);
    const custmap = model.mapsets[0].maps[0];
    assert.equal(custmap.fields.filter((f) => f.name === null).length, 1); // the title is in the raw parse
    const layout = bmsToRecordLayout(custmap);
    assert.equal(layout.fields.some((f) => f.baseName === undefined), false);
    // 3 named fields (CUSTNO, CUSTNAM, ERRMSG) x (L,F,A + >=1 data field) = at least 12 entries, none for the title.
    assert.ok(layout.fields.length >= 12);
  });
});

// ---------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------

describe('parseBms: robustness', () => {
  test('continuation: a DFHMDF split across four physical lines (trailing comma + indent) joins into one field', () => {
    const bms = [
      'FLDA     DFHMDF POS=(5,10),',
      '               LENGTH=8,',
      '               ATTRB=(UNPROT,FSET),',
      "               INITIAL='ABCDEFGH'",
    ].join('\n');
    const model = parseBms(bms);
    assert.equal(model.unrecognized.length, 1); // DFHMDF with no enclosing DFHMDI is an orphan
    assert.equal(model.unrecognized[0].kind, 'orphan-DFHMDF');
    assert.deepEqual(model.unrecognized[0].params, {
      POS: '(5,10)', LENGTH: '8', ATTRB: '(UNPROT,FSET)', INITIAL: "'ABCDEFGH'",
    });
  });

  test('continuation: a full DFHMSD/DFHMDI/DFHMDF chain, each spanning multiple lines, parses to one map with one field', () => {
    const bms = [
      'MYSET    DFHMSD TYPE=MAP,',
      '               MODE=INOUT,',
      '               LANG=COBOL',
      'MYMAP    DFHMDI SIZE=(10,20),',
      '               LINE=1,',
      '               COLUMN=1',
      'MYFLD    DFHMDF POS=(2,2),',
      '               LENGTH=5,',
      '               ATTRB=(UNPROT,NUM,FSET),',
      "               PICIN='9(5)'",
    ].join('\n');
    const model = parseBms(bms);
    assert.equal(model.unrecognized.length, 0);
    assert.equal(model.mapsets.length, 1);
    assert.equal(model.mapsets[0].maps.length, 1);
    const field = model.mapsets[0].maps[0].fields[0];
    assert.equal(field.name, 'MYFLD');
    assert.equal(field.length, 5);
    assert.deepEqual(field.attrb, ['UNPROT', 'NUM', 'FSET']);
    assert.equal(field.picin, '9(5)');
  });

  test('unnamed field: a leading-whitespace DFHMDF line (no label) parses with name: null, not as a continuation', () => {
    const bms = [
      'MYSET    DFHMSD TYPE=MAP,MODE=INOUT',
      'MYMAP    DFHMDI SIZE=(10,20),LINE=1,COLUMN=1',
      '         DFHMDF POS=(1,1),LENGTH=10,ATTRB=(PROT,BRT),INITIAL=\'HELLO\'',
    ].join('\n');
    const model = parseBms(bms);
    assert.equal(model.mapsets[0].maps[0].fields.length, 1);
    assert.equal(model.mapsets[0].maps[0].fields[0].name, null);
    assert.equal(model.mapsets[0].maps[0].fields[0].initial, 'HELLO');
  });

  test('comments: "*" in column 1 is dropped entirely, even between continuation-eligible statements', () => {
    const bms = [
      '* this is a full-line comment',
      'MYSET    DFHMSD TYPE=MAP,MODE=INOUT',
      '*',
      'MYMAP    DFHMDI SIZE=(10,20),LINE=1,COLUMN=1',
    ].join('\n');
    const model = parseBms(bms);
    assert.equal(model.unrecognized.length, 0);
    assert.equal(model.mapsets[0].maps[0].name, 'MYMAP');
  });

  test('orphan DFHMDI (no enclosing DFHMSD) is reported in unrecognized, not dropped or crashed on', () => {
    const bms = 'MYMAP    DFHMDI SIZE=(10,20),LINE=1,COLUMN=1';
    const model = parseBms(bms);
    assert.equal(model.mapsets.length, 0);
    assert.equal(model.unrecognized.length, 1);
    assert.equal(model.unrecognized[0].kind, 'orphan-DFHMDI');
    assert.equal(model.unrecognized[0].label, 'MYMAP');
  });

  test('DFHMSD TYPE=FINAL end marker is recorded in unrecognized, not forced into the {name, maps} mapset shape', () => {
    const bms = [
      'MYSET    DFHMSD TYPE=MAP,MODE=INOUT',
      'MYMAP    DFHMDI SIZE=(10,20),LINE=1,COLUMN=1',
      'ENDSET   DFHMSD TYPE=FINAL',
    ].join('\n');
    const model = parseBms(bms);
    assert.equal(model.mapsets.length, 1); // only the real mapset, not a second "FINAL" one
    assert.equal(model.unrecognized.length, 1);
    assert.equal(model.unrecognized[0].kind, 'mapset-end');
    assert.equal(model.unrecognized[0].label, 'ENDSET');
  });

  test('a stray line that is not a recognized opcode is captured verbatim in unrecognized, never dropped', () => {
    const bms = ['MYSET    DFHMSD TYPE=MAP,MODE=INOUT', 'THIS IS GARBAGE INPUT'].join('\n');
    const model = parseBms(bms);
    assert.equal(model.unrecognized.length, 1);
    assert.equal(model.unrecognized[0].raw, 'THIS IS GARBAGE INPUT');
  });

  test('bare (non-parenthesized) ATTRB value still becomes a one-element array', () => {
    const bms = [
      'MYSET    DFHMSD TYPE=MAP,MODE=INOUT',
      'MYMAP    DFHMDI SIZE=(10,20),LINE=1,COLUMN=1',
      'MYFLD    DFHMDF POS=(1,1),LENGTH=1,ATTRB=ASKIP',
    ].join('\n');
    const model = parseBms(bms);
    assert.deepEqual(model.mapsets[0].maps[0].fields[0].attrb, ['ASKIP']);
  });

  test('an empty BMS source parses to an empty, non-throwing model', () => {
    const model = parseBms('');
    assert.deepEqual(model, { mapsets: [], unrecognized: [] });
  });

  test('bmsToRecordLayout on a map with no fields (or null) never throws', () => {
    assert.deepEqual(bmsToRecordLayout({ name: 'EMPTY', fields: [] }), { name: 'EMPTY', fields: [] });
    assert.deepEqual(bmsToRecordLayout({ name: null, fields: [] }), { name: null, fields: [] });
  });
});
