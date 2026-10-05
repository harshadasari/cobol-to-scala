/**
 * tests/oct2026-fixes.test.js
 *
 * Toolchain-independent unit tests for the three Oct-2026 post-campaign fixes
 * (docs/ACTION_PLAN_2026-10.md findings log): FUNCTION result DISPLAY format,
 * VALUE/MOVE ALL <literal>, and PERFORM VARYING step truncation. Shape tests
 * over the generated Scala, plus pure-JS mirrors of the intrinsic-result
 * width rule; byte-for-byte semantics against real cobc are covered by the
 * rr01..rr04 corpus programs and f03-refmod-numval-subscript under
 * tests/oracle/oracle.test.js.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, 'corpus', 'proc');

const scalaOf = (src) => convertToScala(src, { generateMain: true }).scala;
const corpusScala = (name) => scalaOf(fs.readFileSync(path.join(CORPUS, name), 'utf-8'));

const prog = (ws, proc) => `       IDENTIFICATION DIVISION.
       PROGRAM-ID. OCT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
${ws}
       PROCEDURE DIVISION.
       MAIN-PARA.
${proc}
           STOP RUN.
`;

describe('probe 1: DISPLAY of FUNCTION NUMVAL/NUMVAL-C/MOD/MAX/MIN results', () => {
  test('NUMVAL / NUMVAL-C / MOD displayed directly go through CobolFmt.intrinsicNum', () => {
    const s = scalaOf(prog(
      '       01 WS-S PIC X(8) VALUE "5678".\n       01 WS-A PIC 9(3) VALUE 17.',
      '           DISPLAY "N=" FUNCTION NUMVAL(WS-S).\n           DISPLAY "C=" FUNCTION NUMVAL-C(WS-S).\n           DISPLAY "M=" FUNCTION MOD(WS-A 5).'
    ));
    assert.match(s, /println\("N=" \+ CobolFmt\.intrinsicNum\(CobolFmt\.numval\(wsS, false\)\)\)/);
    assert.match(s, /println\("C=" \+ CobolFmt\.intrinsicNum\(CobolFmt\.numval\(wsS, false\)\)\)/);
    assert.match(s, /println\("M=" \+ CobolFmt\.intrinsicNum\(/);
  });

  test('arithmetic / assignment contexts are unchanged (no intrinsicNum)', () => {
    const s = scalaOf(prog(
      '       01 WS-S PIC X(8) VALUE "5678".\n       01 WS-R PIC 9(6) VALUE 0.',
      '           COMPUTE WS-R = FUNCTION NUMVAL(WS-S) + 1.\n           MOVE FUNCTION NUMVAL(WS-S) TO WS-R.'
    ));
    // The helper definition exists once in the CobolFmt object, but no call site uses it.
    assert.equal((s.match(/CobolFmt\.intrinsicNum\(/g) || []).length, 0);
  });

  test('MAX/MIN of plain numeric items/literals display the winner in its own format', () => {
    const s = scalaOf(prog(
      '       01 WS-A PIC 9(3) VALUE 17.\n       01 WS-B PIC 9(5) VALUE 17.',
      '           DISPLAY "X=" FUNCTION MAX(WS-A WS-B).\n           DISPLAY "Y=" FUNCTION MIN(WS-A 100.50).'
    ));
    assert.match(s, /reduceLeft\(\(x, y\) => if y\._1 > x\._1 then y else x\)\._2\(\)/);
    assert.match(s, /reduceLeft\(\(x, y\) => if y\._1 < x\._1 then y else x\)\._2\(\)/);
    assert.match(s, /CobolFmt\.num\(BigDecimal\(wsB\), 5, 0, false, false\)/);
    assert.match(s, /\(\) => "100\.5"/); // literal normalised like cobc
  });

  test('LENGTH of a plain item stays an unpadded constant', () => {
    const s = scalaOf(prog('       01 WS-A PIC X(8).', '           DISPLAY "L=" FUNCTION LENGTH(WS-A).'));
    assert.doesNotMatch(s, /println\("L=" \+ CobolFmt\.intrinsicNum/);
  });

  test('f03 corpus program now routes NUMVAL display through intrinsicNum', () => {
    assert.match(corpusScala('f03-refmod-numval-subscript.cbl'), /CobolFmt\.intrinsicNum\(CobolFmt\.numval\(/);
  });

  // JS mirror of CobolFmt.intrinsicNum's width rule, pinned to the cobc-captured values.
  const intrinsicNum = (str) => {
    let [i, f = ''] = str.replace(/^[+-]/, '').split('.');
    f = f.replace(/0+$/, '');
    const neg = str.startsWith('-') && /[1-9]/.test(i + f);
    const u = BigInt((i + f).replace(/^0+(?=\d)/, '') || '0');
    const bits = u === 0n ? 0 : u.toString(2).length;
    const scale = f.length;
    let ustr = u.toString();
    let width;
    if (scale < 10 && bits < (neg ? 32 : 33)) width = 9;
    else if (scale < 19 && bits <= 64) width = 20;
    else width = Math.max(ustr.length, scale);
    ustr = ustr.length < width ? '0'.repeat(width - ustr.length) + ustr : ustr.slice(-width);
    const body = scale > 0 ? ustr.slice(0, ustr.length - scale) + '.' + ustr.slice(-scale) : ustr;
    return (neg ? '-' : '') + body;
  };
  test('width rule reproduces the cobc-captured NUMVAL renderings', () => {
    const cases = {
      '5678': '000005678', '12.5': '00000012.5', '-3.75': '-0000003.75', '0': '000000000',
      '-7': '-000000007', '0.001': '000000.001', '12.50': '00000012.5',
      '2147483647': '147483647', '4294967295': '294967295', '4294967296': '00000000004294967296',
      '-2147483647': '-147483647', '-2147483648': '-00000000002147483648',
      '123456789012': '00000000123456789012', '0.0000000001': '0000000000.0000000001',
      '1234567890123456789012': '1234567890123456789012', '1234567.89': '1234567.89',
    };
    for (const [input, expected] of Object.entries(cases)) assert.equal(intrinsicNum(input), expected, input);
  });
});

describe('probe 2: VALUE ALL / MOVE ALL <literal>', () => {
  test('VALUE ALL literal repeats to the item width (truncating the last repetition)', () => {
    const s = scalaOf(prog(
      [
        '       01 WS-A PIC X(5) VALUE ALL "*".',
        '       01 WS-B PIC X(5) VALUE ALL "AB".',
        '       01 WS-C PIC X(7) VALUE ALL "XYZ".',
        '       01 WS-D PIC 9(4) VALUE ALL "7".',
        '       01 WS-P PIC 9(3)V9 VALUE ALL "5".',
        '       01 WS-F PIC X(4) VALUE ALL ZEROS.',
        '       01 WS-G PIC X(4) VALUE ALL QUOTES.',
      ].join('\n'),
      '           DISPLAY WS-A.'
    ));
    assert.match(s, /var wsA: String = "\*\*\*\*\*"/);
    assert.match(s, /var wsB: String = "ABABA"/);
    assert.match(s, /var wsC: String = "XYZXYZX"/);
    assert.match(s, /var wsD: Int = 7777/);
    assert.match(s, /var wsP: BigDecimal = BigDecimal\("555\.5"\)/);
    assert.match(s, /var wsF: String = "0000"/);
    assert.match(s, /var wsG: String = "\\"\\"\\"\\""/);
  });

  test('plain (non-ALL) VALUE on PIC X still pads once', () => {
    const s = scalaOf(prog('       01 WS-N PIC X(4) VALUE "*".', '           DISPLAY WS-N.'));
    assert.match(s, /var wsN: String = "\*   "/);
  });

  test('MOVE ALL "x" fills alphanumeric; MOVE ALL digits fills the integer digits of a numeric item', () => {
    const s = scalaOf(prog(
      '       01 WS-Z PIC X(5).\n       01 WS-D PIC 9(4).\n       01 WS-E PIC 9(3)V9.',
      '           MOVE ALL "ab" TO WS-Z.\n           MOVE ALL "12" TO WS-D.\n           MOVE ALL "3" TO WS-E.\n           MOVE ALL QUOTES TO WS-Z.'
    ));
    assert.match(s, /wsZ = "ababa"/);
    assert.match(s, /wsD = 1212/);
    assert.match(s, /wsE = BigDecimal\("333"\)/);
    assert.match(s, /wsZ = "\\"\\"\\"\\"\\""/);
  });
});

describe('probe 3: PERFORM VARYING step is stored with arithmetic-store truncation', () => {
  test('inline PERFORM VARYING step is fitted to the index PIC', () => {
    const s = scalaOf(prog(
      '       01 WS-I PIC 9.\n       01 WS-S PIC S9.\n       01 WS-D PIC 9V9.',
      [
        '           PERFORM VARYING WS-I FROM 8 BY 1 UNTIL WS-I > 12 CONTINUE END-PERFORM.',
        '           PERFORM VARYING WS-S FROM 7 BY 1 UNTIL WS-S > 9 CONTINUE END-PERFORM.',
        '           PERFORM VARYING WS-D FROM 8.5 BY 0.7 UNTIL WS-D > 12 CONTINUE END-PERFORM.',
      ].join('\n')
    ));
    assert.match(s, /wsI = \(CobolFmt\.truncNumeric\(BigDecimal\(wsI\) \+ BigDecimal\("1"\), 1, 0\)\.abs\)\.toInt/);
    assert.match(s, /wsS = \(CobolFmt\.truncNumeric\(BigDecimal\(wsS\) \+ BigDecimal\("1"\), 1, 0\)\)\.toInt/);
    assert.match(s, /wsD = CobolFmt\.truncNumeric\(wsD \+ BigDecimal\("0\.7"\), 1, 1\)\.abs/);
    assert.doesNotMatch(s, /wsI = wsI \+ 1/);
  });

  test('AFTER inner index and out-of-line / TEST AFTER forms are fitted too', () => {
    const s = corpusScala('rr03-varying-step-truncation.cbl');
    assert.match(s, /wsJ = \(CobolFmt\.truncNumeric\(BigDecimal\(wsJ\) \+ BigDecimal\("1"\), 1, 0\)\.abs\)\.toInt/);
    assert.doesNotMatch(s, /ws[IJSD] = ws[IJSD] \+ /);
    // BY a data item
    assert.match(s, /wsI = \(CobolFmt\.truncNumeric\(BigDecimal\(wsI\) \+ BigDecimal\(wsJ\), 1, 0\)\.abs\)\.toInt/);
  });

  test('a negative arithmetic result into an UNSIGNED item keeps |value|; signed items are untouched', () => {
    const s = corpusScala('rr04-unsigned-negative-store.cbl');
    assert.match(s, /wsI = \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsI\) \+ \(BigDecimal\("-2"\)\)\), 1, 0\)\.abs\)\.toInt/);
    assert.match(s, /wsS = \(CobolFmt\.truncNumeric\([^\n]*, 2, 0\)\)\.toInt/);
  });
});
