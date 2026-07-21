/**
 * tests/round38-fixes.test.js
 *
 * Focused unit tests for round-38 adversarial-refutation findings - see
 * tests/oracle/README.md's round-38 table for the full write-up and the
 * nn01-nn04/nn07/nn09/nn13 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs).
 *
 *   1. (nn01/nn02) `elementaryOverGroupRedefinesLines` (generator/
 *      scala-generator.js) declined a NUMERIC elementary item REDEFINES-ing
 *      a GROUP (`WS-NUM REDEFINES WS-GROUP PIC 9(4)`) WITHOUT ever
 *      registering it in the field registry - a later `MOVE WS-NUM TO
 *      <alphanumeric>` found `sourceInfo == null` and fed the raw Int-typed
 *      accessor straight into a String-typed helper, a hard Scala compile
 *      error. Fixed by, for the narrow unsigned-whole-number shape this can
 *      be modeled exactly, building a REAL accessor that reconstructs the
 *      numeric value from the target GROUP's own digit-text children (and
 *      registering it with dataType 'numeric') - not just a registry-only
 *      placeholder.
 *   2. (nn03/nn04) `generateCall`'s `target.recursive` branch (generator/
 *      expression-gen.js) only recognized a plain, unsubscripted, non-ref-
 *      mod BY REFERENCE operand for true getter/setter-closure aliasing back
 *      to the caller's real storage - a subscripted (`WS-TABLE(WS-IDX)`) or
 *      ref-modified (`WS-STR(3:4)`) BY REFERENCE operand silently fell into
 *      the BY-CONTENT/VALUE call-site-snapshot mechanism instead, which
 *      never writes back to the caller. Fixed by extending that branch with
 *      two new cases (`isSubscriptedRefVar`/`isRefModRefVar`), each building
 *      a real live getter/setter pair - reusing convertIdentifier/
 *      renderAssignment for the subscripted case, and a direct character-
 *      splice read/write for the (String-typed-base-only) ref-mod case -
 *      only for `mode === 'REFERENCE'`; BY CONTENT/VALUE keeps the existing
 *      snapshot mechanism unchanged for both shapes.
 *   3. (nn07) A READ issued after CLOSE threw an uncaught
 *      `java.io.IOException: Stream Closed` (the underlying `Source`/
 *      `readerVar` was already closed) instead of setting FILE STATUS "47"
 *      and continuing. Fixed by adding real open/closed lifecycle tracking
 *      (`isOpenVar`/`pastEndVar`, file-io-gen.js's `fileHandleVarNames`):
 *      `generateReadStatement` (expression-gen.js) now checks `isOpenVar`
 *      FIRST, before ever touching `iteratorVar`, avoiding the crash
 *      entirely. This also happened to fully resolve the refuter's other
 *      noted status-code gaps (41 reopen-while-open, 42 double-close, 46
 *      second-consecutive-past-end-read) via the same state, verified
 *      end-to-end against nn07's own oracle - not left as a partial fix.
 *   4. (nn09) `data-division-parser.js`'s PIC-scan `case 'P':` branch only
 *      ever asked "are we past an explicit V" - always false for a P-only
 *      PICTURE with no V at all - so a LEADING P run (`PIC SPPP9(3)`, scale
 *      DOWN) and a TRAILING P run (`PIC S9(3)PPP`, scale UP) both fell into
 *      the same branch and computed identical (and wrong) scaling metadata.
 *      Fixed by distinguishing them via `digitCount === 0` (no digit-9 seen
 *      yet = leading P; already seen at least one = trailing P) and
 *      computing the correct `integerDigits`/`decimalDigits` pair for each -
 *      plus two small, purely-additive companion fixes this exposed:
 *      `CobolFmt.num`'s embedded runtime helper (generateCobolFmtHelper) is
 *      taught to render a NEGATIVE decDigits (trailing-P's own encoding) as
 *      a whole-number digit string with no decimal point, and
 *      `renderVariableMoveSource`'s numeric-to-numeric MOVE branch no longer
 *      overrides a genuinely-zero `integerDigits` (leading-P's own encoding)
 *      with its pre-existing "18-digit unknown" fallback when the target
 *      also carries real `decimalDigits` info.
 *   5. (nn13) `generateArithmeticSizeErrorCheck` (generator/
 *      expression-gen.js, shared by COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE)
 *      ORed every target's own digit-capacity overflow check into ONE
 *      combined condition and, on ANY single overflow, skipped storing ALL
 *      targets. Fixed by gating each target's own store on ONLY that
 *      target's own `CobolFmt.fitsDigits` check, while the ON SIZE ERROR
 *      imperative itself still fires once if ANY target overflowed - a
 *      DIVIDE's own `extraErrorCond` (BY ZERO) is additionally guarded so
 *      the per-target re-check never evaluates a `resultBD` expression that
 *      would itself raise `ArithmeticException` in that case.
 *
 * Every expectation below is derived from (or directly cross-checked
 * against) the real cobc-captured tests/corpus/proc/nn*.oracle.txt files.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PROC = path.join(__dirname, 'corpus', 'proc');

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function readCorpus(name) {
  return fs.readFileSync(path.join(CORPUS_PROC, name), 'utf-8');
}

function readOracle(name) {
  return fs.readFileSync(path.join(CORPUS_PROC, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// Finding 1 (nn01/nn02): numeric elementary REDEFINES-ing a GROUP must
// compile (and, for the narrow unsigned-whole-number shape, produce the
// actual correct value), not crash with Found: Int, Required: String.
// ---------------------------------------------------------------------------

describe('round-38 finding 1 (nn02): numeric elementary REDEFINES a GROUP compiles and computes the right value', () => {
  const oracleText = readOracle('nn02-redef-numeric-move-alpha.oracle.txt');

  test('the real cobc oracle capture documents the reconstructed digit value (sanity)', () => {
    assert.match(oracleText, /TARGET=\[1234 {6}\]/);
  });

  test('WS-NUM gets a real accessor (not a bare ??? stub) reconstructing the value from WS-GROUP\'s own children', () => {
    const scala = scalaOf(readCorpus('nn02-redef-numeric-move-alpha.cbl'));
    assert.match(
      scala,
      /def wsNum: Int = \{ val _flat = \(CobolFmt\.digitsOf\(BigDecimal\(wsA\), 2, 0\) \+ CobolFmt\.digitsOf\(BigDecimal\(wsB\), 2, 0\)\); CobolFmt\.numval\(_flat\)\.toIntExact \}/
    );
    assert.doesNotMatch(scala, /def wsNum: Int = \?\?\?/);
  });

  test('MOVE WS-NUM TO WS-TARGET routes through the numeric-to-alphanumeric digit conversion, not a raw Int-into-String pass-through', () => {
    const scala = scalaOf(readCorpus('nn02-redef-numeric-move-alpha.cbl'));
    assert.match(scala, /wsTarget = CobolFmt\.fitLeft\(CobolFmt\.digitsOf\(BigDecimal\(wsNum\), 4, 0\), 10\)/);
  });
});

describe('round-38 finding 1 regression (nn01): the same REDEFINES shape combined with LINAGE/RECURSIVE still compiles and matches its oracle', () => {
  const oracleText = readOracle('nn01-linage-recursive-redef.oracle.txt');

  test('the real cobc oracle capture documents the full DEPTH/DATE sequence (sanity)', () => {
    assert.match(oracleText, /NOTEOP DEPTH=05 DATE=2005/);
    assert.match(oracleText, /EOP DEPTH=03 DATE=2003/);
    assert.match(oracleText, /MAIN AFTER DEPTH=00/);
  });

  test('WS-DATE-NUM (REDEFINES WS-DATE-GROUP) gets a real reconstructed accessor, not a bare stub', () => {
    const scala = scalaOf(readCorpus('nn01-linage-recursive-redef.cbl'));
    assert.match(scala, /def wsDateNum: Int = \{ val _flat = /);
    assert.doesNotMatch(scala, /def wsDateNum: Int = \?\?\?/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (nn03/nn04): CALL ... USING BY REFERENCE of a subscripted or
// ref-modified operand into a RECURSIVE program must alias the caller's real
// storage, not silently snapshot it.
// ---------------------------------------------------------------------------

describe('round-38 finding 2 (nn03): a subscripted BY REFERENCE operand into a RECURSIVE callee gets a real live getter/setter pair', () => {
  const oracleText = readOracle('nn03-call-byref-subscript-recur.oracle.txt');

  test('the real cobc oracle capture documents the writeback all the way out to the caller (sanity)', () => {
    assert.match(oracleText, /BEFORE ITEM2=020/);
    assert.match(oracleText, /IN SUB DEPTH=0 VAL=320/);
    assert.match(oracleText, /AFTER ITEM2=320/);
  });

  test('the generated entry() call aliases wsItem(1) directly via a real getter/setter, not a call-site snapshot var', () => {
    const scala = scalaOf(readCorpus('nn03-call-byref-subscript-recur.cbl'));
    assert.match(
      scala,
      /Nn03sub\.entry\(\(\) => wsItem\(1\), \(v: Int\) => \{ wsItem = wsItem\.updated\(1, v\) \}, \(\) => wsDepth, \(v: Int\) => wsDepth = v\)/
    );
    assert.doesNotMatch(scala, /var _call\d+_0Snapshot0: Int = wsItem\(1\)/);
  });
});

describe('round-38 finding 2 (nn04): a ref-modified BY REFERENCE operand into a RECURSIVE callee gets a real character-splice getter/setter pair', () => {
  const oracleText = readOracle('nn04-call-byref-refmod-recur.oracle.txt');

  test('the real cobc oracle capture documents the spliced-in writeback all the way out to the caller (sanity)', () => {
    assert.match(oracleText, /BEFORE STR=\[ABCDEFGHIJ\]/);
    assert.match(oracleText, /AFTER STR=\[ABZZZZGHIJ\]/);
  });

  test('the generated entry() call splices wsStr(3:4) directly via a real getter/setter, not a call-site snapshot var', () => {
    const scala = scalaOf(readCorpus('nn04-call-byref-refmod-recur.cbl'));
    assert.match(
      scala,
      /Nn04sub\.entry\(\(\) => \{ val _s = \(3 - 1\); val _l = \(4\); wsStr\.substring\(_s, _s \+ _l\) \}, \(v: String\) => \{ val _s = \(3 - 1\); val _l = \(4\); wsStr = wsStr\.substring\(0, _s\) \+ v \+ wsStr\.substring\(_s \+ _l, wsStr\.length\) \}, \(\) => wsDepth, \(v: Int\) => wsDepth = v\)/
    );
  });
});

describe('round-38 finding 2 regression (nn15): a subscripted BY REFERENCE operand into a NON-recursive callee is unaffected', () => {
  const oracleText = readOracle('nn15-call-byref-subscript-plain.oracle.txt');

  test('the real cobc oracle capture documents the writeback (sanity)', () => {
    assert.match(oracleText, /BEFORE ITEM2=020/);
    assert.match(oracleText, /AFTER ITEM2=120/);
  });

  test('the ordinary (non-recursive) subscripted writeback path is untouched - a scalar-subscripted renderAssignment, not the recursive entry() closure shape', () => {
    const scala = scalaOf(readCorpus('nn15-call-byref-subscript-plain.cbl'));
    assert.match(scala, /wsItem = wsItem\.updated\(1, _callRet0\)/);
    assert.doesNotMatch(scala, /Nn15sub\.entry\(\(\) =>/); // never reaches the recursive-closure branch at all
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (nn07): READ after CLOSE must never crash, and should report the
// correct FILE STATUS lifecycle codes (41/42/46/47).
// ---------------------------------------------------------------------------

describe('round-38 finding 3 (nn07): file open/closed lifecycle tracking - no crash, correct FILE STATUS codes', () => {
  const oracleText = readOracle('nn07-file-status-edge-cases.oracle.txt');

  test('the real cobc oracle capture documents all four lifecycle status codes (sanity)', () => {
    assert.match(oracleText, /READ3\(PASTEND\) STATUS=10/);
    assert.match(oracleText, /READ4\(PASTEND-AGAIN\) STATUS=46/);
    assert.match(oracleText, /REOPEN-WHILE-OPEN STATUS=41/);
    assert.match(oracleText, /READ-AFTER-CLOSE STATUS=47/);
    assert.match(oracleText, /CLOSE2\(ALREADY-CLOSED\) STATUS=42/);
  });

  test('generateReadStatement checks isOpenVar FIRST, reporting "47" without ever touching the iterator when the file is not open', () => {
    // round-40 finding 3 (pp05): this outer guard's own condition grew a
    // second, OR'd clause (checking openModeVar, not just isOpenVar) - see
    // tests/round40-fixes.test.js's own finding-3 coverage for that addition
    // in isolation. The semantic property THIS test itself cares about
    // (isOpenVar is checked before ever touching the iterator, reporting
    // "47" without a crash) is unaffected - not-open is still one of the
    // conditions that trips this same guard.
    const scala = scalaOf(readCorpus('nn07-file-status-edge-cases.cbl'));
    assert.match(scala, /if !someFileIsOpen \|\| \(someFileOpenMode != "INPUT" && someFileOpenMode != "I-O"\) then\n\s+someFileHasCurrent = false\n\s+wsStatus = "47"/);
  });

  test('generateOpen reports "41" (and skips rebuilding any handle) when the file is already open', () => {
    const scala = scalaOf(readCorpus('nn07-file-status-edge-cases.cbl'));
    assert.match(scala, /if someFileIsOpen then\n\s+wsStatus = "41"/);
  });

  test('generateClose reports "42" when the file is already closed, and marks the file closed on a real close', () => {
    const scala = scalaOf(readCorpus('nn07-file-status-edge-cases.cbl'));
    assert.match(scala, /someFileIsOpen = false/);
    assert.match(scala, /else\n\s+wsStatus = "42"/);
  });

  test('a second consecutive past-end READ reports "46", not "10" again, via the pastEndVar flag', () => {
    const scala = scalaOf(readCorpus('nn07-file-status-edge-cases.cbl'));
    assert.match(scala, /wsStatus = \(if someFilePastEnd then "46" else "10"\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (nn09): PICTURE P-scaling (leading vs trailing) must compute the
// opposite scaling metadata, not identical (and wrong) values.
// ---------------------------------------------------------------------------

describe('round-38 finding 4 (nn09): PICTURE P-scaling computes opposite (and correct) metadata for leading vs trailing P', () => {
  const oracleText = readOracle('nn09-picture-p-scaling.oracle.txt');

  test('the real cobc oracle capture documents the opposite scaling directions (sanity)', () => {
    assert.match(oracleText, /SCALED-UP=\+123000/);
    assert.match(oracleText, /RESULT-UP=\+000123000/);
    assert.match(oracleText, /SCALED-DOWN=\+\.000000/);
    assert.match(oracleText, /RESULT-DOWN=\+000000000/);
  });

  test('a trailing P run (PIC S9(3)PPP) grows integerDigits and drives decimalDigits NEGATIVE (scale up)', () => {
    const scala = scalaOf(readCorpus('nn09-picture-p-scaling.cbl'));
    assert.match(scala, /wsScaledUp = CobolFmt\.truncNumeric\(BigDecimal\(wsSrc\), 6, -3\)\.toInt/);
    assert.match(scala, /CobolFmt\.num\(BigDecimal\(wsScaledUp\), 6, -3, true, false\)/);
  });

  test('a leading P run (PIC SPPP9(3)) drives integerDigits to zero and decimalDigits to the full span (scale down)', () => {
    const scala = scalaOf(readCorpus('nn09-picture-p-scaling.cbl'));
    assert.match(scala, /wsScaledDown = CobolFmt\.truncNumeric\(BigDecimal\(wsSrc\), 0, 6\)/);
    assert.match(scala, /CobolFmt\.num\(wsScaledDown, 0, 6, true, false\)/);
    // decimalDigits > 0 makes this a BigDecimal field, not an Int one - the
    // only representation that can hold a genuinely fractional stored value.
    assert.match(scala, /var wsScaledDown: BigDecimal = BigDecimal\(0\)/);
  });

  test('CobolFmt.num\'s embedded runtime helper has a dedicated negative-decDigits branch (whole-number display, no decimal point)', () => {
    const scala = scalaOf(readCorpus('nn09-picture-p-scaling.cbl'));
    assert.match(scala, /if decDigits < 0 then/);
  });
});

describe('round-38 finding 4 regression: an ordinary V-decimal PIC (no P at all) is completely unaffected', () => {
  test('PIC S9(3)V99 still computes the pre-existing (unchanged) integerDigits=3/decimalDigits=2', () => {
    const source = `
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PVREG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-V PIC S9(3)V99 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-V.
           STOP RUN.
`;
    const scala = scalaOf(source);
    assert.match(scala, /CobolFmt\.num\(wsV, 3, 2, true, false\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 5 (nn13): multi-target COMPUTE/arithmetic with ON SIZE ERROR must
// gate each target's own store independently, not all-or-nothing.
// ---------------------------------------------------------------------------

describe('round-38 finding 5 (nn13): multi-target COMPUTE ON SIZE ERROR stores each target independently', () => {
  const oracleText = readOracle('nn13-compute-2tgt-sizeerror.oracle.txt');

  test('the real cobc oracle capture documents the non-overflowing target being stored while the overflowing one is left unchanged (sanity)', () => {
    assert.match(oracleText, /SIZE-ERROR SMALL=\+0 BIG=\+12445/);
  });

  test('each target\'s own store is gated on its OWN fitsDigits check, not the OR of every target\'s check', () => {
    const scala = scalaOf(readCorpus('nn13-compute-2tgt-sizeerror.cbl'));
    assert.match(
      scala,
      /if \(CobolFmt\.fitsDigits\(\(BigDecimal\("12345"\) \+ BigDecimal\("100"\)\), 1\)\) then wsSmall = /
    );
    assert.match(
      scala,
      /if \(CobolFmt\.fitsDigits\(\(BigDecimal\("12345"\) \+ BigDecimal\("100"\)\), 5\)\) then wsBig = /
    );
  });

  test('the combined ON SIZE ERROR condition still ORs every target\'s own overflow check (fires once if ANY overflows)', () => {
    const scala = scalaOf(readCorpus('nn13-compute-2tgt-sizeerror.cbl'));
    assert.match(
      scala,
      /if \(!CobolFmt\.fitsDigits\(\(BigDecimal\("12345"\) \+ BigDecimal\("100"\)\), 1\) \|\| !CobolFmt\.fitsDigits\(\(BigDecimal\("12345"\) \+ BigDecimal\("100"\)\), 5\)\) then/
    );
  });
});

describe('round-38 finding 5 regression: a single-target ON SIZE ERROR statement is completely unaffected', () => {
  test('a single-target COMPUTE ON SIZE ERROR still emits the same "OR of one check" -> single per-target gated store, no behavior change', () => {
    const source = `
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SINGLESE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC S9(1) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-A = 12345
               ON SIZE ERROR
                   DISPLAY "ERR"
           END-COMPUTE.
           STOP RUN.
`;
    const scala = scalaOf(source);
    assert.match(scala, /if \(!CobolFmt\.fitsDigits\(BigDecimal\("12345"\), 1\)\) then/);
    assert.match(scala, /if \(CobolFmt\.fitsDigits\(BigDecimal\("12345"\), 1\)\) then wsA = /);
  });

  test('a DIVIDE BY ZERO (extraErrorCond) still guards the per-target re-check so no target\'s resultBD is evaluated when the divisor is zero', () => {
    const source = `
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DIVZERO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC S9(3) VALUE 10.
       01  WS-B PIC S9(3) VALUE 0.
       01  WS-C PIC S9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DIVIDE WS-A BY WS-B GIVING WS-C
               ON SIZE ERROR
                   DISPLAY "DIV ERR"
           END-DIVIDE.
           STOP RUN.
`;
    const scala = scalaOf(source);
    assert.match(scala, /if !\(\(BigDecimal\(wsB\)\) == BigDecimal\(0\)\) then/);
  });
});
