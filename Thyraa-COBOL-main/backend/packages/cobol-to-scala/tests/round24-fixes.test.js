/**
 * tests/round24-fixes.test.js
 *
 * Focused unit tests for the round-24 adversarial-refutation findings - see
 * tests/oracle/README.md's round-24 table for the full write-up and the
 * m01-m14 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification. This file targets the individual
 * generator/parser mechanisms each finding traces to, in isolation (no
 * cobc/scala-cli needed) - though every finding below was ALSO
 * independently verified with a real scala-cli compile/run against the
 * actual m01/m02/m04/m08/m10 corpus programs (see the round-24 README table
 * for the exact captured output).
 *
 *   1. Centralization-gap audit: round-23 finding 1 built a shared
 *      `assignExpr` helper (generator/expression-gen.js) so a write to a
 *      RECURSIVE program's own LINKAGE-aliased identifier (a local
 *      getter/setter `def` pair, not a module `var`) emits the explicit
 *      `<camel>_=(value)` method-call form instead of bare assignment-sugar
 *      (which does not desugar for a local def pair - a hard "Reassignment
 *      to val" compile error). Round 24 found this had been wired into only
 *      3 of the (many) call sites that build a bare `<camel> = <expr>`
 *      string directly - `initializeAssignmentLines` (INITIALIZE, m01) and
 *      `generateMoveCorresponding` (MOVE CORRESPONDING, m02) each
 *      independently built their own bare assignment string, bypassing
 *      `assignExpr` entirely; a full audit of generator/ turned up several
 *      more (generateGroupMove, scatterGroupFromString, generateRelease,
 *      generateReturn, readAssignLines, generateSet's level-88 TRUE/FALSE
 *      branches, generateInspect's TALLYING counter, renderCamelAssignment
 *      (ADD/SUBTRACT CORRESPONDING's own target write), the FILE STATUS
 *      writeback in generateReadStatement/generateWriteStatement, and
 *      PERFORM VARYING's own loop-variable init/increment in
 *      generator/method-gen.js) - all now routed through assignExpr too.
 *
 *   2. (m04) UNSTRING's `INTO target1, target2` comma-separated list -
 *      `parseUnstringStatement`'s INTO-collecting loop never accounted for
 *      an optional comma between targets, the SAME bug class round-22
 *      findings 2/4 already fixed for GO TO's DEPENDING ON list and SET's
 *      condition-name list.
 *
 *   3. (m10) `CALL "X" USING WS-Y, WS-Y` (the SAME caller variable passed as
 *      two different USING arguments) - real cobc aliases the callee's two
 *      distinctly-named LINKAGE parameters to the SAME storage; this
 *      generator's ordinary (non-recursive) CALL convention scatters each
 *      USING argument into its own independent module var, so the two
 *      parameters silently diverge the instant one is written. A full
 *      closure-based fix (generalizing round 21-23's RECURSIVE-only
 *      aliasing mechanism to every ordinary CALL) was judged too large a
 *      change for this round; instead `generateCall` now detects this
 *      narrow shape and emits a visible, honest decline comment at the call
 *      site instead of silently producing wrong output with no marker.
 *
 *   4. (m08) An FD (FILE SECTION) record's own alphanumeric field with no
 *      VALUE clause defaulted to spaces, like an ordinary WORKING-STORAGE
 *      item - real cobc leaves it at LOW-VALUES (NUL bytes) until a
 *      successful OPEN+READ/WRITE actually touches it. `buildFieldRegistry`
 *      (generator/scala-generator.js) now threads an `isFileSection` flag
 *      through its own `walk()`, set only for the FILE SECTION's own
 *      `walk(fileItems, ...)` call - a WORKING-STORAGE/LINKAGE item's
 *      default is completely unchanged.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/m01/m02/m04/m08/m10
 * programs provide via the data-driven oracle suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: centralization-gap audit - every LINKAGE-aliased write site now
// routes through assignExpr, not just renderAssignment's own callers.
// ---------------------------------------------------------------------------

describe('round-24 finding 1: centralization-gap audit - every write site now routes through assignExpr', () => {
  function nestedEntryBody(scala) {
    const start = scala.indexOf('def entry(_get0');
    assert.ok(start >= 0, 'expected a generateRecursiveEntryMethod entry() in the generated Scala');
    return scala.slice(start);
  }

  // m01 shape: INITIALIZE of a RECURSIVE program's own GROUP LINKAGE parameter.
  test('(m01) INITIALIZE of a RECURSIVE program\'s own GROUP LINKAGE parameter uses the explicit setter form, never bare assignment', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24INITMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-GRP.
           05 WS-A PIC 9(2) VALUE 9.
           05 WS-B PIC X(3) VALUE "ZZZ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24INITSUB" USING WS-GRP.
           DISPLAY "MAIN A=" WS-A " B=[" WS-B "]".
           STOP RUN.
       END PROGRAM T24INITMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24INITSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-GRP.
           05 LS-A PIC 9(2).
           05 LS-B PIC X(3).
       PROCEDURE DIVISION USING LS-GRP.
       MAIN-PARA.
           INITIALIZE LS-GRP.
           GOBACK.
       END PROGRAM T24INITSUB.
`;
    const body = nestedEntryBody(scalaOf(src));
    assert.doesNotMatch(body, /\n\s*lsA = 0/);
    assert.doesNotMatch(body, /\n\s*lsB = "/);
    assert.match(body, /lsA_=\(0\)/);
    assert.match(body, /lsB_=\("   "\)/);
  });

  // m02 shape: MOVE CORRESPONDING into a RECURSIVE program's own GROUP LINKAGE parameter.
  test('(m02) MOVE CORRESPONDING into a RECURSIVE program\'s own GROUP LINKAGE parameter uses the explicit setter form, never bare assignment', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24MCMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC.
           05 FLD-A PIC 9(2) VALUE 7.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24MCSUB" USING WS-SRC.
           STOP RUN.
       END PROGRAM T24MCMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24MCSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-SRC.
           05 FLD-A PIC 9(2).
       PROCEDURE DIVISION USING LS-SRC.
       MAIN-PARA.
           MOVE CORRESPONDING LS-SRC TO LS-SRC.
           GOBACK.
       END PROGRAM T24MCSUB.
`;
    const body = nestedEntryBody(scalaOf(src));
    assert.doesNotMatch(body, /\n\s*fldA = fldA\b/);
    assert.match(body, /fldA_=\(fldA\)/);
  });

  test('PERFORM VARYING\'s own loop-variable init/increment (generator/method-gen.js) uses the explicit setter form for a RECURSIVE LINKAGE scalar', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24PVMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24PVSUB" USING WS-N.
           STOP RUN.
       END PROGRAM T24PVMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24PVSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           PERFORM VARYING LS-N FROM 1 BY 1 UNTIL LS-N > 3
               DISPLAY LS-N
           END-PERFORM.
           GOBACK.
       END PROGRAM T24PVSUB.
`;
    const body = nestedEntryBody(scalaOf(src));
    assert.doesNotMatch(body, /\n\s*lsN = 1\b/);
    assert.doesNotMatch(body, /\n\s*lsN = lsN \+/);
    assert.match(body, /lsN_=\(1\)/);
    assert.match(body, /lsN_=\(lsN \+/);
  });

  test('SET condition-name TO TRUE (a level-88 attached to a RECURSIVE LINKAGE scalar) uses the explicit setter form for the parent field', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24SETMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24SETSUB" USING WS-FLAG.
           STOP RUN.
       END PROGRAM T24SETMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24SETSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-FLAG PIC X.
           88 LS-FLAG-YES VALUE "Y".
       PROCEDURE DIVISION USING LS-FLAG.
       MAIN-PARA.
           SET LS-FLAG-YES TO TRUE.
           GOBACK.
       END PROGRAM T24SETSUB.
`;
    const body = nestedEntryBody(scalaOf(src));
    assert.doesNotMatch(body, /\n\s*lsFlag = "Y"/);
    assert.match(body, /lsFlag_=\("Y"\)/);
  });

  test('regression guard: an ordinary (non-recursive-entry) copy of the same paragraph, and any ordinary WORKING-STORAGE identifier, keep plain bare assignment', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24REGMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24REGSUB" USING WS-N.
           STOP RUN.
       END PROGRAM T24REGMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24REGSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           SUBTRACT 1 FROM LS-N.
           GOBACK.
       END PROGRAM T24REGSUB.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /wsN_=/);
    const nestedStart = scala.indexOf('def entry(_get0');
    const beforeNested = scala.slice(0, nestedStart);
    assert.match(beforeNested, /\n\s*lsN = \(CobolFmt\.truncNumeric/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (m04): UNSTRING's comma-separated INTO target list.
// ---------------------------------------------------------------------------

describe('round-24 finding 2 (m04): UNSTRING INTO target1, target2 (comma-separated) no longer drops the second+ target', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24UNSTR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(7) VALUE "AAA,BBB".
       01 WS-A PIC X(3) VALUE SPACES.
       01 WS-B PIC X(3) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           UNSTRING WS-SRC DELIMITED BY "," INTO WS-A, WS-B.
           DISPLAY "A=[" WS-A "] B=[" WS-B "]".
           STOP RUN.
       END PROGRAM T24UNSTR.
`;

  test('both comma-separated INTO targets are parsed and written - no spurious paragraph split from the dropped/misparsed second target', () => {
    const scala = scalaOf(src);
    // The bug: the second target's own identifier token was left unconsumed
    // and misparsed as a spurious paragraph name, splitting MAIN-PARA in two
    // and producing a duplicate/conflicting `wsB` declaration (a hard
    // compile error). A clean single mainPara() with both wsA/wsB writes
    // confirms the whole INTO list parsed as ONE statement.
    assert.match(scala, /def mainPara\(\): Unit =/);
    assert.equal((scala.match(/def mainPara\(/g) || []).length, 1);
    assert.match(scala, /wsA = /);
    assert.match(scala, /wsB = /);
  });

  test('regression guard: a comma-free (space-separated) UNSTRING INTO list still parses correctly', () => {
    const spaceSrc = src.replace('INTO WS-A, WS-B', 'INTO WS-A WS-B');
    const scala = scalaOf(spaceSrc);
    assert.equal((scala.match(/def mainPara\(/g) || []).length, 1);
    assert.match(scala, /wsA = /);
    assert.match(scala, /wsB = /);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (m10): CALL argument aliasing - honest decline for the same
// caller variable passed as more than one BY REFERENCE USING argument.
// ---------------------------------------------------------------------------

describe('round-24 finding 3 (m10): CALL "X" USING WS-Y, WS-Y - honest decline comment for duplicate-caller-variable aliasing', () => {
  test('the same caller variable passed twice to an ORDINARY (non-recursive) target emits a visible TODO decline comment', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24ALIASMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9(4) VALUE 100.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24ALIASSUB" USING WS-X, WS-X.
           STOP RUN.
       END PROGRAM T24ALIASMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24ALIASSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       MAIN-PARA.
           ADD 500 TO LK-A.
           GOBACK.
       END PROGRAM T24ALIASSUB.
`;
    const scala = scalaOf(src);
    assert.match(scala, /TODO: CALL "T24ALIASSUB" USING \.\.\.: WS-X passed as more than one BY REFERENCE argument/);
  });

  test('regression guard: two DIFFERENT caller variables in the same CALL never emit the decline comment', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24NOALIASMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9(4) VALUE 100.
       01 WS-Y PIC 9(4) VALUE 200.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24NOALIASSUB" USING WS-X, WS-Y.
           STOP RUN.
       END PROGRAM T24NOALIASMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24NOALIASSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       MAIN-PARA.
           GOBACK.
       END PROGRAM T24NOALIASSUB.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /passed as more than one BY REFERENCE argument/);
  });

  test('regression guard: a RECURSIVE target with the same caller variable passed twice never emits the decline comment (its own closures already alias correctly)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24RECALIASMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9(4) VALUE 100.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T24RECALIASSUB" USING WS-X, WS-X.
           STOP RUN.
       END PROGRAM T24RECALIASMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24RECALIASSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       MAIN-PARA.
           GOBACK.
       END PROGRAM T24RECALIASSUB.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /passed as more than one BY REFERENCE argument/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (m08): an FD record's own alphanumeric field defaults to
// LOW-VALUES, not spaces - scoped only to FILE SECTION records.
// ---------------------------------------------------------------------------

describe('round-24 finding 4 (m08): an FD record\'s own alphanumeric field with no VALUE clause defaults to LOW-VALUES, not spaces', () => {
  test('an FD record field with no VALUE clause defaults to a full-width low-values (NUL) literal', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24FDMAIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T24FDNOSUCH"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "REC=[" SOME-REC "]".
           STOP RUN.
       END PROGRAM T24FDMAIN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var someRec: String = "(\\u0000){10}"/);
  });

  test('regression guard: an ORDINARY WORKING-STORAGE field of the identical shape (no VALUE clause) still defaults to spaces (an empty string, padded with spaces at DISPLAY time)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T24WSMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "REC=[" WS-REC "]".
           STOP RUN.
       END PROGRAM T24WSMAIN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var wsRec: String = ""/);
    assert.doesNotMatch(scala, /var wsRec: String = "\\u0000/);
  });
});
