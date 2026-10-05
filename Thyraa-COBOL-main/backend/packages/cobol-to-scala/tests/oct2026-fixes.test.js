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

// ---------------------------------------------------------------------------
// Fuzzer fix pass (first fuzzer run, seed 1): classes A, C, D (class B is a
// cobc compiler quirk and deliberately NOT matched - see the ledger).
// ---------------------------------------------------------------------------
describe('fuzzer class A: a zero-length literal is ONE SPACE (cobc)', () => {
  test('"" / \'\' lex as a single space; hex and EXEC text are untouched', () => {
    const s = scalaOf(prog(
      '       01 A2 PIC X(2).\n       01 A4 PIC X(4) VALUE "xy".',
      '           IF A2 = ""\n             DISPLAY "T"\n           END-IF.\n           MOVE "" TO A4.\n           DISPLAY "[" "" "]".'
    ));
    // The comparison literal is the single space, padded to the field width.
    assert.match(s, /if a2 == \(" " \+ " "\) then/);
    assert.match(s, /a4 = " {4}"/);
    assert.match(s, /println\("\[" \+ " " \+ "\]"\)/);
  });

  test('a PIC X item with no VALUE starts as full-width SPACES (not the empty string)', () => {
    const s = scalaOf(prog(
      '       01 A1 PIC X(4).\n       01 T  PIC X(2) OCCURS 3 TIMES.\n       01 N1 PIC 9(2).',
      '           IF A1 = SPACES DISPLAY "T" END-IF.'
    ));
    assert.match(s, /var a1: String = " {4}"/);
    assert.match(s, /Vector\.fill\(3\)\(" {2}"\)/);
    assert.match(s, /var n1: Int = 0/);
    assert.doesNotMatch(s, /var a1: String = ""/);
  });

  test('rr05 corpus program generates the space-literal forms', () => {
    const s = corpusScala('rr05-zero-length-literal.cbl');
    assert.doesNotMatch(s, /== \(""/);
    assert.match(s, /var u1: String = " {4}"/);
  });
});

describe('fuzzer class C: MOVE into an UNSIGNED numeric item stores |value|', () => {
  test('variable sources (signed DISPLAY/COMP/COMP-3) get .abs after the digit truncation', () => {
    const s = scalaOf(prog(
      '       01 S6 PIC S9(6) VALUE -481.\n       01 SC PIC S9(4) COMP VALUE -37.\n       01 SP3 PIC S9(5) COMP-3 VALUE -906.\n       01 U2 PIC 9(2).\n       01 UC PIC 9(4) COMP.\n       01 U5 PIC 9(5) COMP-3.\n       01 SS PIC S9(3).',
      '           MOVE S6 TO U2.\n           MOVE SC TO UC.\n           MOVE SP3 TO U5.\n           MOVE S6 TO SS.'
    ));
    assert.match(s, /u2 = CobolFmt\.truncNumeric\(BigDecimal\(s6\), 2, 0\)\.abs\.toInt/);
    assert.match(s, /uc = CobolFmt\.truncNumeric\(BigDecimal\(sc\), 4, 0\)\.abs\.toInt/);
    assert.match(s, /u5 = CobolFmt\.truncNumeric\(sp3, 5, 0\)\.abs/);
    // signed receiver unchanged
    assert.match(s, /ss = CobolFmt\.truncNumeric\(BigDecimal\(s6\), 3, 0\)\.toInt/);
  });

  test('an unsigned SOURCE needs no .abs (shape churn stays minimal)', () => {
    const s = scalaOf(prog(
      '       01 U5 PIC 9(5) VALUE 12345.\n       01 U3 PIC 9(3).',
      '           MOVE U5 TO U3.'
    ));
    assert.match(s, /u3 = CobolFmt\.truncNumeric\(BigDecimal\(u5\), 3, 0\)\.toInt/);
    assert.doesNotMatch(s, /u3 = [^\n]*\.abs/);
  });

  test('negative literals (incl. INITIALIZE REPLACING NUMERIC BY) keep only the magnitude', () => {
    const s = scalaOf(prog(
      '       01 U3 PIC 9(3).\n       01 U4 PIC 9(3)V9.\n       01 S3 PIC S9(3).',
      '           MOVE -536 TO U3.\n           MOVE -12.75 TO U4.\n           MOVE -536 TO S3.\n           INITIALIZE U3 REPLACING NUMERIC BY -5.'
    ));
    assert.match(s, /u3 = 536\b/);
    assert.match(s, /u4 = BigDecimal\("12\.7"\)/);
    assert.match(s, /s3 = -536\b/);
    assert.match(s, /u3 = 5\b/);
  });

  test('a period-less INITIALIZE ... REPLACING no longer loops forever in the parser', () => {
    const s = scalaOf(prog(
      '       01 U3 PIC 9(3).',
      '           INITIALIZE U3 REPLACING NUMERIC BY -5\n           DISPLAY "X"'
    ));
    assert.match(s, /println\("X"\)/);
  });

  test('rr06 corpus program', () => {
    const s = corpusScala('rr06-move-unsigned-abs.cbl');
    assert.match(s, /u2 = CobolFmt\.truncNumeric\(BigDecimal\(s6\), 2, 0\)\.abs\.toInt/);
    assert.match(s, /u3 = 536\b/);
  });
});

describe('fuzzer class D: COMPUTE division keeps cobc intermediate precision', () => {
  test('an expression with "/" is built from CobolFmt.div and exact (ex) left operands', () => {
    const s = scalaOf(prog(
      '       01 N3 PIC 9(4)V9(1) VALUE 832.\n       01 R1 PIC 9(3)V9(1).\n       01 R2 PIC 9(3)V9(1).',
      '           COMPUTE R1 = ((1 + N3) / 3).\n           COMPUTE R2 = (N3 / 3) * 3.'
    ));
    assert.match(s, /r1 = CobolFmt\.truncNumeric\(CobolFmt\.div\(\(CobolFmt\.ex\(BigDecimal\("1"\)\) \+ n3\), BigDecimal\("3"\)\), 3, 1\)\.abs/);
    assert.match(s, /r2 = CobolFmt\.truncNumeric\(\(CobolFmt\.div\(n3, BigDecimal\("3"\)\) \* BigDecimal\("3"\)\), 3, 1\)\.abs/);
  });

  test('expressions without a division are untouched (no ex/div noise)', () => {
    const s = scalaOf(prog(
      '       01 A PIC 9(3) VALUE 2.\n       01 R PIC 9(5).',
      '           COMPUTE R = (A + 1) * 3.'
    ));
    assert.doesNotMatch(s, /r = [^\n]*CobolFmt\.(div|ex)\(/);
  });

  test('a later operation on the quotient is exact: ex() on the left operand of + - * and **', () => {
    const s = scalaOf(prog(
      '       01 A PIC 9(3) VALUE 7.\n       01 R PIC 9(3)V9(3).',
      '           COMPUTE R = A + A / 3 - 1.'
    ));
    assert.match(s, /CobolFmt\.ex\(\(CobolFmt\.ex\(BigDecimal\(a\)\) \+ CobolFmt\.div\(BigDecimal\(a\), BigDecimal\("3"\)\)\)\)/);
  });

  test('pure-JS mirror of CobolFmt.div pinned to cobc-captured values (rr07)', () => {
    // quotient scale = max(sa - sb, 0) + 38, truncated toward zero
    const div = (aUnscaled, aScale, bUnscaled, bScale) => {
      const s = aScale - bScale;
      const shift = 38 + (s < 0 ? -s : 0);
      return { unscaled: (aUnscaled * 10n ** BigInt(shift)) / bUnscaled, scale: s + shift };
    };
    const q = div(1n, 0, 3n, 0);
    assert.equal(q.scale, 38);
    assert.equal(q.unscaled.toString(), '3'.repeat(38));
    // (1/3)*3 is 0.999...9 (38 nines), which truncates to 0.999 at V9(3): cobc +000.999
    assert.equal((q.unscaled * 3n).toString(), '9'.repeat(38));
    // 1/3/3 keeps scale 76
    const q2 = div(q.unscaled, q.scale, 3n, 0);
    assert.equal(q2.scale, 76);
    // dividend scale 3, divisor scale 2 -> scale 39 ; dividend scale 0, divisor scale 2 -> scale 38
    assert.equal(div(1000n, 3, 300n, 2).scale, 39);
    assert.equal(div(1n, 0, 300n, 2).scale, 38);
  });

  test('rr07 corpus program uses div for every quotient', () => {
    const s = corpusScala('rr07-compute-div-intermediate.cbl');
    assert.doesNotMatch(s, /BigDecimal\([^)]*\) \/ BigDecimal/);
    assert.match(s, /CobolFmt\.div\(/);
  });
});
