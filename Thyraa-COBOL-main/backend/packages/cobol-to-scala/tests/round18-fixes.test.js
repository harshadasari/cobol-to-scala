/**
 * tests/round18-fixes.test.js
 *
 * Focused unit tests for the round-18 adversarial-refutation findings (8
 * reported) - see tests/oracle/README.md's round-18 table for the full
 * write-up and the g03/g07/g08/g09/g10/g12/g13/g14 promoted oracle corpus
 * programs for the end-to-end cobc-vs-generated-Scala verification.
 *
 * Findings 1, 2, 3, 4, 5, 6, 7 are FULL FIXES - the promoted program for
 * each fully passes `oracleCompare()` (generated Scala output matches real
 * GnuCOBOL byte-for-byte). Finding 8 is a DEFENSIVE-GUARD fix, not a
 * capability implementation - reference modification (Known Gap #1) stays
 * exactly as out of scope as round-17 left it; the fix only stops a
 * downstream crash from an already-documented honest placeholder.
 *
 *   1. A PROCEDURE DIVISION whose very first thing is a STATEMENT, not a
 *      paragraph/section name - an entirely unnamed implicit "main" body
 *      (legal COBOL) - previously produced ZERO paragraphs/sections at all
 *      (every such statement silently discarded). Fixed at the PARSER level
 *      (`parseProcedureDivision`, parser/procedure-parser.js): synthesizes
 *      an implicit `IMPLICIT-MAIN-PARAGRAPH` the first time a statement
 *      arrives with neither a current paragraph nor section, mirroring
 *      round-7 finding 8's `sectionLeadingUnit` one level up.
 *
 *   2. MERGE had zero generator support at all (no 'MERGE' case in
 *      generateExpression's switch). Fixed with a real implementation
 *      (`generateMerge`, generator/expression-gen.js) reusing SORT's own
 *      SD work-file/buffer machinery and a new shared `sortCascadeLines`
 *      key-ordering helper. A companion gap (`WRITE rec FROM "literal"`)
 *      needed for the corpus program to even set up its own test data is
 *      fixed via `parseOperand`-based FROM parsing plus a new
 *      `writeFromLiteralPlan` helper.
 *
 *   3. `EVALUATE ... WHEN a WHEN b WHEN c <shared body>` (repeated WHEN
 *      keywords sharing one body) rendered every WHEN as an independent
 *      `if`/`else if` branch with only its OWN (possibly empty) body -
 *      silently running the shared body only when the subject matched the
 *      LAST condition. Fixed via a new `mergeCascadingWhenClauses` merge
 *      pass. A second, compounding bug (a nested PERFORM THRU inside a
 *      shared WHEN body never called the THRU wrapper method) is fixed via
 *      `performTargetCallExpr`/`performThruWrapperNameLocal`.
 *
 *   4. STRING/UNSTRING with the SAME subscripted table element as both
 *      source and destination diverged from cobc's live-aliasing
 *      semantics (a single batch call evaluated the source ONCE, before
 *      any target write). Fixed by restructuring UNSTRING into one
 *      per-target field call, re-evaluating the source fresh each time,
 *      plus padding target writes to their full declared width
 *      (`unstringTargetWidth`) so a re-read observes the correct length.
 *
 *   5. ADD/SUBTRACT CORRESPONDING between SUBSCRIPTED rows of two OCCURS
 *      tables dropped both operands' own subscripts entirely, feeding a
 *      bare whole-table Vector into BigDecimal(...) - a hard compile
 *      crash. Fixed by resolving each side's own subscript suffix
 *      (`subscriptSuffixExpr`) and writing back via `renderCamelAssignment`.
 *
 *   6. OCCURS directly on a REDEFINES 01-level item ITSELF (not a
 *      descendant) mis-modeled its children as scalars instead of a
 *      table - a hard "method does not take parameters" compile error.
 *      Fixed via new `occursOnRedefinesItemLines`/
 *      `flattenRedefinesLeavesAllowingFiller`.
 *
 *   7. REDEFINES nested 4 levels deep on the REDEFINING side never
 *      registered the deepest flat accessor - `characterSlicedGroupRedefinesLines`
 *      only ever handled one flat level. Fixed by making it genuinely
 *      recursive.
 *
 *   8. A round-17 finding 1 honest placeholder (`BigDecimal(0)`) reaching a
 *      table subscript computed a negative 0-based index -
 *      `IndexOutOfBoundsException` at runtime. Fixed via a defensive
 *      `.max(0)` clamp in `subscriptIndexExpr`, applied to every dynamic
 *      subscript uniformly (not special-cased to ref-mod).
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/g03/g07/g08/g09/g10/
 * g12/g13/g14 programs provide via the data-driven oracle suite. This file
 * targets the individual parser/generator mechanisms each finding traces
 * to, in isolation (no cobc/scala-cli needed).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala, parseCobol } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: PROCEDURE DIVISION with no paragraph/section name at all.
// ---------------------------------------------------------------------------

describe('round-18 finding 1: a PROCEDURE DIVISION whose very first thing is a statement (no paragraph/section name) is no longer dropped entirely', () => {
  test('g14 shape: statements before any paragraph name are collected into an implicit top-level paragraph and generated into run()', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G14MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
           DISPLAY "MAIN-BEFORE-CALL".
           ADD 5 TO WS-X.
           DISPLAY "MAIN-AFTER X=" WS-X.
           STOP RUN.
`;
    const ast = parseCobol(src);
    assert.equal(ast.procedures.paragraphs.length, 1, 'the implicit paragraph must be the sole top-level paragraph');
    assert.equal(ast.procedures.paragraphs[0].statements.length, 4, 'DISPLAY, ADD, DISPLAY, STOP RUN - none dropped');

    const scala = scalaOf(src);
    assert.match(scala, /def implicitMainParagraph\(\): Unit =/);
    assert.match(scala, /println\("MAIN-BEFORE-CALL"\)/);
    assert.match(scala, /wsX = \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsX\) \+ \(BigDecimal\("5"\)\)\), 3, 0\)\)\.toInt/);
    assert.match(scala, /@main def run\(\): Unit =\s*\n\s*def _step0\(\): Unit =\s*\n\s*implicitMainParagraph\(\)/);
  });

  test('a PROCEDURE DIVISION that opens with an ordinary named paragraph is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "X".
           STOP RUN.
`;
    const ast = parseCobol(src);
    assert.equal(ast.procedures.paragraphs.length, 1);
    assert.equal(ast.procedures.paragraphs[0].name, 'MAIN-PARA');
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /implicitMainParagraph/);
    assert.match(scala, /def mainPara\(\): Unit =/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: MERGE (and its WRITE ... FROM <literal> companion gap).
// ---------------------------------------------------------------------------

describe('round-18 finding 2: MERGE now has real generator support (previously a silent no-op)', () => {
  test('g12 shape: MERGE ... USING ... OUTPUT PROCEDURE generates a real fill-buffer-then-sort-then-run-procedure sequence, not a no-op', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G18MERGE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MERGE-FILE ASSIGN TO "WORK".
           SELECT IN-FILE-1 ASSIGN TO "IN1" ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "IN2" ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY  PIC 9(3).
           05  M-VAL  PIC X(5).
       FD  IN-FILE-1.
       01  IN-REC-1.
           05  I1-KEY PIC 9(3).
           05  I1-VAL PIC X(5).
       FD  IN-FILE-2.
       01  IN-REC-2.
           05  I2-KEY PIC 9(3).
           05  I2-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-EOF PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1 IN-FILE-2
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN MERGE-FILE AT END MOVE "Y" TO WS-EOF
               NOT AT END DISPLAY "M=" M-KEY
           END-PERFORM.
`;
    const scala = scalaOf(src);
    // Never the old silent no-op - a MERGE statement must generate real code.
    assert.doesNotMatch(scala, /\(\) \/\/ MERGE.*not (yet )?implemented/);
    // Clears and refills the shared SD buffer from BOTH USING files (each
    // opened/read/closed by MERGE itself, not by the user's own PROCEDURE
    // DIVISION), then sorts it, exactly like SORT's own buffer model.
    assert.match(scala, /mergeFileBuffer\.clear\(\)/);
    assert.match(scala, /while inFile1Iterator\.hasNext do/);
    assert.match(scala, /while inFile2Iterator\.hasNext do/);
    assert.match(scala, /mergeFileBuffer\.sortInPlaceWith \{ \(a, b\) =>/);
    assert.match(scala, /if a\.mKey != b\.mKey then a\.mKey < b\.mKey/);
    assert.match(scala, /mergeFileIdx = 0/);
    assert.match(scala, /emitPara\(\)/);
  });

  test('a MERGE with no matching SD record declines honestly (visible comment, never a crash)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MERGE NO-SUCH-FILE ASCENDING KEY WS-X USING A B OUTPUT PROCEDURE IS X.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /no matching SD record found/);
  });

  test('WRITE rec FROM "literal text" companion gap: the literal is fitted/padded to the record\'s own declared width, not the record\'s own (unrelated) current field values', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "OUT" ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC.
           05  O-KEY PIC 9(3).
           05  O-VAL PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           WRITE OUT-REC FROM "010AAAAA".
           CLOSE OUT-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // The literal ("010AAAAA", exactly 8 characters = O-KEY(3) + O-VAL(5))
    // must be written directly - never a stray, unrelated UnknownStatement
    // from the literal token being left unconsumed by the parser.
    assert.doesNotMatch(scala, /unsupported statement type \(UNKNOWN\)/);
    assert.match(scala, /outFileWriter\.println\(\("010AAAAA"\)\.stripTrailing\(\)\)/);
  });

  test('a non-literal (identifier) WRITE ... FROM source is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "OUT" ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC PIC X(8).
       WORKING-STORAGE SECTION.
       01  WS-SRC PIC X(8) VALUE "ABCDEFGH".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           WRITE OUT-REC FROM WS-SRC.
           CLOSE OUT-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /unsupported statement type \(UNKNOWN\)/);
    assert.match(scala, /outFileWriter\.println\(\(wsSrc\)\.stripTrailing\(\)\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: EVALUATE cascading WHEN clauses sharing one body, plus a
// nested PERFORM THRU inside that shared body.
// ---------------------------------------------------------------------------

describe('round-18 finding 3: EVALUATE WHEN a WHEN b WHEN c <shared body> runs the shared body for EVERY one of a/b/c, not just the last', () => {
  test('g08 shape (minus the nested PERFORM THRU): three cascading WHENs sharing one body render a single OR\'d condition, not three independent branches each with only their own (mostly empty) body', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE PIC X(1) VALUE "B".
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE WS-CODE
               WHEN "A" WHEN "B" WHEN "C"
                   DISPLAY "ABC"
               WHEN OTHER
                   DISPLAY "OTHER"
           END-EVALUATE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /if \(\(wsCode == "A"\) \|\| \(wsCode == "B"\) \|\| \(wsCode == "C"\)\) then\s*\n\s*println\("ABC"\)/);
    // Never three separate branches, two of them empty.
    assert.doesNotMatch(scala, /if \(wsCode == "A"\) then\s*\n\s*\(\)/);
  });

  test('g08 shape (full): the shared body\'s own nested PERFORM x THRU y correctly calls the THRU wrapper method, not just x\'s own standalone method', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE   PIC X(1).
       01  WS-TOTAL  PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           MOVE "B" TO WS-CODE.
           EVALUATE WS-CODE
               WHEN "A" WHEN "B" WHEN "C"
                   PERFORM STEP-ONE THRU STEP-THREE
               WHEN OTHER
                   DISPLAY "OTHER"
           END-EVALUATE.
           STOP RUN.
       STEP-ONE.
           ADD 10 TO WS-TOTAL.
       STEP-TWO.
           ADD 20 TO WS-TOTAL.
       STEP-THREE.
           ADD 30 TO WS-TOTAL.
`;
    const scala = scalaOf(src);
    assert.match(scala, /stepOneToStepThree\(\)/);
    // Never the pre-fix bug's bare single-paragraph call inside the WHEN body.
    assert.doesNotMatch(scala, /if \(\(wsCode == "A"\)\)[\s\S]*?\n\s*stepOne\(\)\s*\n(?!.*stepOneToStepThree)/);
  });

  test('an ordinary (non-cascading) EVALUATE with one WHEN per body is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE PIC X(1) VALUE "A".
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE WS-CODE
               WHEN "A"
                   DISPLAY "A"
               WHEN "B"
                   DISPLAY "B"
           END-EVALUATE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /if \(wsCode == "A"\) then/);
    assert.match(scala, /else if \(wsCode == "B"\) then/);
  });

  test('an ordinary nested PERFORM (no THRU) inside an IF branch is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAG PIC X(1) VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-FLAG = "Y"
               PERFORM STEP-ONE
           END-IF.
           STOP RUN.
       STEP-ONE.
           DISPLAY "ONE".
`;
    const scala = scalaOf(src);
    assert.match(scala, /if wsFlag == "Y" then\s*\n\s*stepOne\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4: STRING/UNSTRING live-aliasing (same subscripted table element
// as both source and destination).
// ---------------------------------------------------------------------------

describe('round-18 finding 4: UNSTRING re-reads its source fresh for each target field, observing an earlier target\'s own write', () => {
  test('g09 shape: UNSTRING source and one INTO target alias the same table element - the second field\'s own call re-reads the (already-overwritten) source', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G09.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 3 TIMES.
               10  R-FIELD PIC X(10).
       01  WS-PTR PIC 9(3) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           UNSTRING R-FIELD(1) DELIMITED BY "-"
               INTO R-FIELD(1) R-FIELD(3)
               WITH POINTER WS-PTR.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // Two independent per-field calls, each re-reading the live rField(0)
    // expression - never a single batch call for both targets at once.
    assert.match(scala, /val \(_parts0, _delims0, _newPtr0, _ovf0\) = CobolUnstring\.unstring\(rField\(0\), _ptr, Seq\(\("-", false\)\), 1\)/);
    assert.match(scala, /val \(_parts1, _delims1, _newPtr1, _ovf1\) = CobolUnstring\.unstring\(rField\(0\), _ptr, Seq\(\("-", false\)\), 1\)/);
    // The first target's own write happens BEFORE the second field's own
    // call textually - Scala executes them in exactly that order, so the
    // second call's `rField(0)` read is the first write's own effect.
    const firstWriteIdx = scala.indexOf('rField = rField.updated(0, CobolFmt.fitLeft(_parts0');
    const secondCallIdx = scala.indexOf('CobolUnstring.unstring(rField(0), _ptr, Seq(("-", false)), 1)', firstWriteIdx + 1);
    assert.ok(firstWriteIdx > 0 && secondCallIdx > firstWriteIdx, 'the first target write must precede the second field\'s own source read');
    // Every target write is padded to its own full declared width (10),
    // not left as the bare, unpadded matched substring.
    assert.match(scala, /CobolFmt\.fitLeft\(_parts0\.headOption\.getOrElse\(""\), 10\)/);
  });

  test('a plain (non-aliased) UNSTRING is completely unaffected in its final observable values (regression guard, verified by round4/round6/phase2-refutation-fixes tests already updated for the new per-target shape)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC PIC X(10) VALUE "AA,BB".
       01  WS-T1  PIC X(4).
       01  WS-T2  PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           UNSTRING WS-SRC DELIMITED BY "," INTO WS-T1 WS-T2.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsT1 = CobolFmt\.fitLeft\(_parts0\.headOption\.getOrElse\(""\), 4\)/);
    assert.match(scala, /wsT2 = CobolFmt\.fitLeft\(_parts1\.headOption\.getOrElse\(""\), 4\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 5: ADD/SUBTRACT CORRESPONDING between subscripted OCCURS rows.
// ---------------------------------------------------------------------------

describe('round-18 finding 5: ADD/SUBTRACT CORRESPONDING between two SUBSCRIPTED table rows resolves each operand\'s own subscript before building the arithmetic expression', () => {
  test('g13 shape: ADD CORRESPONDING WS-ROW-A(1) TO WS-ROW-B(2) reads/writes the correct row of each table, never the bare whole-table Vector', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G13.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNT PIC 9(2) VALUE 3.
       01  WS-TABLE-A.
           05  WS-ROW-A OCCURS 1 TO 5 TIMES DEPENDING ON WS-COUNT.
               10  A-AMT1 PIC 9(4).
               10  A-AMT2 PIC 9(4).
       01  WS-TABLE-B.
           05  WS-ROW-B OCCURS 1 TO 5 TIMES DEPENDING ON WS-COUNT.
               10  A-AMT1 PIC 9(4) VALUE 1000.
               10  A-AMT2 PIC 9(4) VALUE 2000.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD CORRESPONDING WS-ROW-A(1) TO WS-ROW-B(2).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /wsTableBWsRowBAAmt1 = wsTableBWsRowBAAmt1\.updated\(1, \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsTableBWsRowBAAmt1\(1\)\) \+ BigDecimal\(wsTableAWsRowAAAmt1\(0\)\)\), 4, 0\)\)\.toInt\)/
    );
    assert.match(
      scala,
      /wsTableBWsRowBAAmt2 = wsTableBWsRowBAAmt2\.updated\(1, \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsTableBWsRowBAAmt2\(1\)\) \+ BigDecimal\(wsTableAWsRowAAAmt2\(0\)\)\), 4, 0\)\)\.toInt\)/
    );
    // Never the bare (whole-table) Vector fed straight into BigDecimal(...).
    assert.doesNotMatch(scala, /BigDecimal\(wsTableAWsRowAAAmt1\)\)/);
  });

  test('a non-subscripted ADD CORRESPONDING (ordinary, whole-group operands) is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP-A.
           05  G-AMT PIC 9(4) VALUE 10.
       01  WS-GRP-B.
           05  G-AMT PIC 9(4) VALUE 100.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD CORRESPONDING WS-GRP-A TO WS-GRP-B.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsGrpBGAmt = \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsGrpBGAmt\) \+ BigDecimal\(wsGrpAGAmt\)\), 4, 0\)\)\.toInt/);
  });

  test('SUBTRACT CORRESPONDING gets the identical subscript-propagation fix', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE-A.
           05  WS-ROW-A OCCURS 3 TIMES.
               10  A-AMT PIC 9(4).
       01  WS-TABLE-B.
           05  WS-ROW-B OCCURS 3 TIMES.
               10  A-AMT PIC 9(4) VALUE 1000.
       PROCEDURE DIVISION.
       MAIN-PARA.
           SUBTRACT CORRESPONDING WS-ROW-A(1) FROM WS-ROW-B(2).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /wsTableBWsRowBAAmt = wsTableBWsRowBAAmt\.updated\(1, \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsTableBWsRowBAAmt\(1\)\) - BigDecimal\(wsTableAWsRowAAAmt\(0\)\)\), 4, 0\)\)\.toInt\)/
    );
  });
});

// ---------------------------------------------------------------------------
// Finding 6: OCCURS directly on a REDEFINES 01-level item itself.
// ---------------------------------------------------------------------------

describe('round-18 finding 6: OCCURS directly on a REDEFINES item itself models its children as a TABLE, not per-occurrence scalars', () => {
  test('g07 shape: children of an OCCURS-bearing REDEFINES item become subscriptable Vector accessors, sliced by row from a synthetic flat view over the (all-FILLER) target', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-TABLE.
           05  FILLER PIC X(8) VALUE "030VVVVV".
           05  FILLER PIC X(8) VALUE "010WWWWW".
           05  FILLER PIC X(8) VALUE "020XXXXX".
       01  WS-SRC-ARR REDEFINES WS-SRC-TABLE OCCURS 3 TIMES.
           05  A-KEY PIC 9(3).
           05  A-VAL PIC X(5).
       01  WS-IDX PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY A-KEY(WS-IDX).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /def aKey: Vector\[Int\] =/);
    assert.match(scala, /def aKey_=\(v: Vector\[Int\]\): Unit =/);
    assert.match(scala, /def aVal: Vector\[String\] =/);
    assert.match(scala, /def aVal_=\(v: Vector\[String\]\): Unit =/);
    // A-KEY must be genuinely subscriptable - never the old zero-parameter
    // scalar accessor a subscript reference would fail to compile against.
    assert.match(scala, /aKey\(\(wsIdx - 1\)\.toInt\.max\(0\)\)/);
    // The flat view must be built from the target's own FILLER vars
    // (_filler1/_filler2/_filler3), not bail out on them.
    assert.match(scala, /wsSrcArrBaseFlat: String = CobolFmt\.fitLeft\(_filler1, 8\) \+ CobolFmt\.fitLeft\(_filler2, 8\) \+ CobolFmt\.fitLeft\(_filler3, 8\)/);
    assert.doesNotMatch(scala, /def aKey: Int = \?\?\?/, 'must never fall back to the honest scalar decline stub for this shape');
  });

  test('OCCURS on a nested CHILD of a redefining group (not the redefining item itself) is completely unaffected (regression guard - the pre-existing supported shape)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC X(12) VALUE "ABCDEFGHIJKL".
       01  WS-B REDEFINES WS-A.
           05  WS-CHUNK OCCURS 3 TIMES PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-CHUNK(2).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /def wsChunk: Vector\[String\] =/);
    assert.match(scala, /\(0 until 3\)\.map\(i => wsA\.substring\(0 \+ i \* 4, 0 \+ \(i \+ 1\) \* 4\)\)\.toVector/);
  });
});

// ---------------------------------------------------------------------------
// Finding 7: REDEFINES nested 4 levels deep on the REDEFINING side.
// ---------------------------------------------------------------------------

describe('round-18 finding 7: characterSlicedGroupRedefinesLines recurses to any nesting depth on the REDEFINING side', () => {
  test('g10 shape: a REDEFINES item whose own leaf is 4 group levels deep still gets a real accessor, not "Not found"', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-L1.
           05  WS-L2.
               10  WS-L3.
                   15  WS-L4.
                       20  WS-CODE PIC X(4) VALUE "ABCD".
                       20  WS-NUM  PIC 9(4) VALUE 1234.
       01  WS-ALT REDEFINES WS-L1.
           05  WS-ALT-L2.
               10  WS-ALT-L3.
                   15  WS-ALT-L4.
                       20  WS-ALT-FLAT PIC X(8).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-ALT-FLAT.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /def wsAltFlat: String = wsAltBaseFlat\.substring\(0, 8\)/);
    assert.match(scala, /def wsAltFlat_=\(v: String\): Unit =/);
    assert.doesNotMatch(scala, /Not found: wsAltFlat/);
  });

  test('a 2-level-deep REDEFINES (the pre-round-18 depth) is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A.
           05  WS-CODE PIC X(4) VALUE "WXYZ".
           05  WS-NUM  PIC 9(4) VALUE 5678.
       01  WS-B REDEFINES WS-A.
           05  WS-FLAT PIC X(8).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-FLAT.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /def wsFlat: String = wsBBaseFlat\.substring\(0, 8\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 8: a defensive .max(0) clamp on every dynamic subscript index.
// ---------------------------------------------------------------------------

describe('round-18 finding 8: every dynamic (non-literal) subscript index is defensively clamped to .max(0)', () => {
  test('g03 shape: a ref-mod\'d MOVE into a numeric field (round-17\'s own honest BigDecimal(0) placeholder), then used as a table subscript, no longer crashes with IndexOutOfBoundsException', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. G03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-IDXSRC PIC X(10) VALUE "0000030000".
       01  WS-IDXNUM PIC 9(1) VALUE 0.
       01  WS-TABLE.
           05  WS-ROW OCCURS 5 TIMES.
               10  WS-VAL PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-IDXSRC(6:1) TO WS-IDXNUM.
           DISPLAY WS-VAL(WS-IDXNUM).
           STOP RUN.
`;
    const scala = scalaOf(src);
    // The known-gap ref-mod placeholder is still exactly BigDecimal(0) - not
    // this finding's concern to fix.
    assert.match(scala, /BigDecimal\(0\) \/\* TODO: reference modification/);
    // But the subscript built from it must be defensively clamped so a
    // computed 0-based index of -1 can never reach Vector.apply.
    assert.match(scala, /wsVal\(\(wsIdxnum - 1\)\.toInt\.max\(0\)\)/);
  });

  test('a plain variable subscript gets the same defensive .max(0) clamp (a no-op for any legitimately in-range value)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9 VALUE 2.
       01  WS-TABLE.
           05  WS-ELEM PIC 9(2) OCCURS 5 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-ELEM(WS-I).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsElem\(\(wsI - 1\)\.toInt\.max\(0\)\)/);
  });

  test('a literal subscript is folded at generation time and completely unaffected (never wrapped in .max(0) - it is always a known-safe compile-time constant)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ELEM PIC 9(2) OCCURS 5 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-ELEM(3).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsElem\(2\)/);
    assert.doesNotMatch(scala, /wsElem\(2\)\.max\(0\)/);
  });
});
