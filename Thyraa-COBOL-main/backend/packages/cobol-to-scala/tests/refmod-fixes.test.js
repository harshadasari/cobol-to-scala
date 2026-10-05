/**
 * tests/refmod-fixes.test.js
 *
 * Toolchain-independent unit tests for the Oct-2026 reference-modification
 * implementation (identifier(start:length) / identifier(start:)) - plan step
 * 2 of docs/ACTION_PLAN_2026-10.md. They assert the SHAPE of the generated
 * Scala (no cobc / scala-cli needed); the byte-for-byte semantics against
 * real cobc are covered by the qq01..qq12 corpus programs and the previously
 * honest-todo ref-mod programs (d12, e04-e06, f01-f05, g01-g03, h06, h07,
 * nn04, oo04, pp03) under tests/oracle/oracle.test.js.
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
       PROGRAM-ID. RMT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
${ws}
       PROCEDURE DIVISION.
       MAIN-PARA.
${proc}
           STOP RUN.
`;

describe('reference modification: reads', () => {
  test('literal start/length slice the base item\'s full storage text', () => {
    const s = scalaOf(prog('       01 WS-A PIC X(12) VALUE "ABCDEFGHIJKL".', '           DISPLAY WS-A(5:4).'));
    assert.match(s, /println\(CobolFmt\.refModSlice\(CobolFmt\.fitLeft\(wsA, 12\), \(5\)\.toInt, \(4\)\.toInt\)\)/);
    assert.doesNotMatch(s, /\?\?\?/);
  });

  test('(start:) open-ended form uses the Int.MinValue "to the end" sentinel', () => {
    const s = scalaOf(prog('       01 WS-A PIC X(12) VALUE "ABCDEFGHIJKL".', '           DISPLAY WS-A(9:).'));
    assert.match(s, /refModSlice\(CobolFmt\.fitLeft\(wsA, 12\), \(9\)\.toInt, Int\.MinValue\)/);
  });

  test('runtime start/length expressions are evaluated at runtime', () => {
    const s = scalaOf(prog(
      '       01 WS-A PIC X(10).\n       01 WS-S PIC 99.\n       01 WS-L PIC 99.',
      '           DISPLAY WS-A(WS-S + 2:WS-L - 1).'
    ));
    assert.match(s, /refModSlice\(CobolFmt\.fitLeft\(wsA, 10\), \(\(wsS \+ 2\)\)\.toInt, \(\(wsL - 1\)\)\.toInt\)/);
  });

  test('a PIC 9 base yields its digit CHARACTERS (digitsOf), not its numeric value', () => {
    const s = scalaOf(prog('       01 WS-D PIC 9(8) VALUE 20261005.', '           DISPLAY WS-D(5:2).'));
    assert.match(s, /refModSlice\(CobolFmt\.digitsOf\(BigDecimal\(wsD\), 8, 0\), \(5\)\.toInt, \(2\)\.toInt\)/);
  });

  test('a signed DISPLAY base uses trailing-overpunch storage text', () => {
    const s = scalaOf(prog('       01 WS-N PIC S9(4) VALUE -12.', '           DISPLAY WS-N(4:1).'));
    assert.match(s, /CobolFmt\.zonedText\(BigDecimal\(wsN\), 4, 0\)/);
  });

  test('a group base slices the group\'s flat character storage', () => {
    const s = scalaOf(prog(
      '       01 WS-G.\n           05 WS-X PIC X(3) VALUE "ABC".\n           05 WS-Y PIC 9(2) VALUE 12.',
      '           DISPLAY WS-G(2:3).'
    ));
    assert.match(s, /refModSlice\(\(CobolFmt\.fitLeft\(wsX, 3\) \+ CobolFmt\.digitsOf\(BigDecimal\(wsY\), 2, 0\)\), \(2\)\.toInt, \(3\)\.toInt\)/);
  });

  test('a subscripted table element is read through its own subscript', () => {
    const s = scalaOf(prog(
      '       01 WS-T.\n           05 WS-E PIC X(8) OCCURS 3.\n       01 WS-I PIC 9 VALUE 2.',
      '           DISPLAY WS-E(WS-I)(3:3).'
    ));
    assert.match(s, /refModSlice\(CobolFmt\.fitLeft\(wsE\(\(wsI - 1\)\.toInt\.max\(0\)\), 8\), \(3\)\.toInt, \(3\)\.toInt\)/);
  });

  test('a ref-mod operand compares with the runtime space-padding comparison', () => {
    const s = scalaOf(prog(
      '       01 WS-A PIC X(10).',
      '           IF WS-A(1:4) = "AB" DISPLAY "Y" END-IF.'
    ));
    assert.match(s, /CobolFmt\.alnumCompare\(CobolFmt\.refModSlice\(.*\), "AB"\) == 0/);
  });

  test('a ref-mod MOVE source into a numeric target goes through numval of the slice', () => {
    const s = scalaOf(prog(
      '       01 WS-A PIC X(10).\n       01 WS-N PIC 9(4).',
      '           MOVE WS-A(3:4) TO WS-N.'
    ));
    assert.match(s, /wsN = CobolFmt\.truncNumeric\(CobolFmt\.numval\(CobolFmt\.refModSlice\(/);
  });

  test('FUNCTION LENGTH of a runtime-length ref-mod is computed, of a literal-length one folded', () => {
    const s = scalaOf(prog(
      '       01 WS-A PIC X(10).\n       01 WS-L PIC 9 VALUE 3.\n       01 WS-N PIC 99.',
      '           MOVE FUNCTION LENGTH(WS-A(2:WS-L)) TO WS-N.\n           MOVE FUNCTION LENGTH(WS-A(2:4)) TO WS-N.'
    ));
    assert.match(s, /CobolFmt\.refModLen\(CobolFmt\.fitLeft\(wsA, 10\), \(2\)\.toInt, \(wsL\)\.toInt\)/);
    assert.match(s, /wsN = .*\b4\b/);
  });
});

describe('reference modification: writes', () => {
  test('MOVE into a slice patches exactly the slice and stores the whole field back', () => {
    const s = scalaOf(prog('       01 WS-A PIC X(12).', '           MOVE "XY" TO WS-A(3:5).'));
    assert.match(s, /wsA = CobolFmt\.refModPatch\(CobolFmt\.fitLeft\(wsA, 12\), \(3\)\.toInt, \(5\)\.toInt, "XY[ ]*"\)/);
  });

  test('a figurative constant fills the slice\'s own runtime length', () => {
    const s = scalaOf(prog(
      '       01 WS-A PIC X(12).\n       01 WS-L PIC 9 VALUE 3.',
      '           MOVE ZEROS TO WS-A(2:WS-L).'
    ));
    assert.match(s, /wsA = CobolFmt\.refModPatch\(.*\("\\u0030" \* CobolFmt\.refModFillLen\(CobolFmt\.refModLen\(/);
  });

  test('a write into a PIC 9 base converts the patched digit text back to the numeric type', () => {
    const s = scalaOf(prog('       01 WS-D PIC 9(8).', '           MOVE "07" TO WS-D(5:2).'));
    assert.match(s, /wsD = CobolFmt\.refModToNumeric\(CobolFmt\.refModPatch\(.*\), 0, false\)\.toInt/);
  });

  test('a subscripted element write rebuilds the Vector with .updated', () => {
    const s = scalaOf(prog(
      '       01 WS-T.\n           05 WS-E PIC X(8) OCCURS 3.',
      '           MOVE "xy" TO WS-E(2)(3:2).'
    ));
    assert.match(s, /wsE = wsE\.updated\(1, CobolFmt\.refModPatch\(CobolFmt\.fitLeft\(wsE\(1\), 8\), \(3\)\.toInt, \(2\)\.toInt, /);
  });

  test('a group write scatters the patched storage text back over the children', () => {
    const s = scalaOf(prog(
      '       01 WS-G.\n           05 WS-X PIC X(3).\n           05 WS-Y PIC 9(2).',
      '           MOVE "ZZ" TO WS-G(2:2).'
    ));
    assert.match(s, /val _rmSrc = CobolFmt\.refModPatch\(/);
    assert.match(s, /wsX = \(_rmSrc\)\.substring\(0, 3\)/);
  });

  test('STRING INTO / INSPECT / UNSTRING INTO / INITIALIZE on a slice all write back via refModPatch', () => {
    const s = scalaOf(prog(
      '       01 WS-A PIC X(12).\n       01 WS-F PIC X(4).',
      [
        '           STRING "ab" DELIMITED BY SIZE INTO WS-A(2:3).',
        '           INSPECT WS-A(1:6) REPLACING ALL "a" BY "b".',
        '           UNSTRING WS-F DELIMITED BY "-" INTO WS-A(5:3).',
        '           INITIALIZE WS-A(4:2).',
      ].join('\n')
    ));
    assert.ok((s.match(/wsA = CobolFmt\.refModPatch\(/g) || []).length >= 4);
  });

  test('UNSTRING DELIMITED BY a ref-mod operand uses the slice as the delimiter', () => {
    const s = scalaOf(prog(
      '       01 WS-L PIC X(11).\n       01 WS-D PIC X(4).\n       01 WS-F PIC X(5).',
      '           UNSTRING WS-L DELIMITED BY WS-D(2:1) INTO WS-F.'
    ));
    assert.match(s, /Seq\(\(CobolFmt\.refModSlice\(CobolFmt\.fitLeft\(wsD, 4\), \(2\)\.toInt, \(1\)\.toInt\), false\)\)/);
  });

  test('unsupported base shapes degrade to a VISIBLE runtime error, never silent garbage', () => {
    const s = scalaOf(prog(
      '       01 WS-C PIC 9(4) COMP-3 VALUE 1234.',
      '           DISPLAY WS-C(1:2).'
    ));
    assert.match(s, /CobolFmt\.refModUnsupported\("base item WS-C has a non-DISPLAY USAGE/);
  });

  test('the runtime helpers raise on out-of-range references instead of returning garbage', () => {
    const s = scalaOf(prog('       01 WS-A PIC X(4).', '           DISPLAY WS-A(1:1).'));
    assert.match(s, /throw new IndexOutOfBoundsException\(s"reference modification/);
    assert.match(s, /if start < 1 \|\| len < 0 \|\| start - 1 \+ len > text\.length then/);
  });
});

describe('reference modification: CALL arguments and RECURSIVE LINKAGE leaves', () => {
  test('BY REFERENCE ref-mod CALL argument aliases the slice (read + write back into the same bytes)', () => {
    const s = corpusScala('qq09-refmod-call-byref.cbl');
    assert.match(s, /Qq09sub\.entry\(CobolFmt\.refModSlice\(CobolFmt\.fitLeft\(wsBuf, 12\), \(3\)\.toInt, \(4\)\.toInt\)\)/);
    assert.match(s, /wsBuf = CobolFmt\.refModPatch\(CobolFmt\.fitLeft\(wsBuf, 12\), \(3\)\.toInt, \(4\)\.toInt, /);
  });

  test('RECURSIVE callee: closure getter/setter alias the caller\'s slice', () => {
    const s = corpusScala('nn04-call-byref-refmod-recur.cbl');
    assert.match(s, /\.entry\(\(\) => CobolFmt\.refModSlice\(.*\), \(v: String\) => \{ wsStr = CobolFmt\.refModPatch\(/);
  });

  test('a ref-mod WRITE on a RECURSIVE LINKAGE leaf goes through the x_=(...) setter, never bare assignment in the reachable entry() body (round-39 finding 2)', () => {
    for (const f of ['oo04-refmod-runtime-recur.cbl', 'pp03-refmod-write-grouplink.cbl', 'qq10-refmod-recursive-link.cbl']) {
      const s = corpusScala(f);
      assert.match(s, /\b(lkSlice|lkTag|lkA)_=\(CobolFmt\.refModPatch\(/, f);
    }
  });
});

describe('reference modification: corpus', () => {
  test('qq01..qq12 exist, each with a cobc oracle capture', () => {
    const qq = fs.readdirSync(CORPUS).filter((f) => /^qq\d\d-.*\.cbl$/.test(f));
    assert.equal(qq.length, 12);
    for (const f of qq) {
      assert.ok(f.length - 4 <= 31, `${f}: basename must be <= 31 chars (GnuCOBOL limit)`);
      assert.ok(fs.existsSync(path.join(CORPUS, f.replace(/\.cbl$/, '.oracle.txt'))), `${f}: missing .oracle.txt`);
    }
  });

  test('no ref-mod placeholder markers remain in generated output for any ref-mod corpus program', () => {
    for (const f of fs.readdirSync(CORPUS).filter((n) => /refmod|^d12|^qq/.test(n) && n.endsWith('.cbl'))) {
      assert.doesNotMatch(corpusScala(f), /reference modification not implemented|\?\?\? \/\* TODO: reference modification/, f);
    }
  });
});
