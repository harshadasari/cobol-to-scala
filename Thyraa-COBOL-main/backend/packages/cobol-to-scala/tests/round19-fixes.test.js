/**
 * tests/round19-fixes.test.js
 *
 * Focused unit tests for the round-19 adversarial-refutation findings (4
 * reported) - see tests/oracle/README.md's round-19 table for the full
 * write-up and the h08/h09/h11/h12 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification.
 *
 * Findings 1 and 3 are FULL FIXES - the promoted program for each fully
 * passes `oracleCompare()`. Finding 2 is a documented HONEST-DECLINE (a
 * visible, compiling marker comment - the underlying runtime divergence is
 * unchanged, a large/invasive architecture change was judged not worth the
 * risk for this one narrow finding). Finding 4 is mostly a documented
 * ACCEPTED LIMITATION (chasing cobc's own undefined behavior would be
 * wrong), with one small, genuinely-safe visibility/consistency improvement
 * bundled in for the one sub-case that actually IS decidable at generation
 * time (a bare negative/zero integer literal subscript).
 *
 *   1. MERGE ... USING of a FLAT (non-group, elementary) FD record silently
 *      lost data: `positionalPairs` only ever walks GROUP_REGISTRY children,
 *      so a USING file whose FD record has no named children (e.g. `01
 *      IN-REC-1 PIC X(6)`) always produced an EMPTY pair list - the SD
 *      record's own fields were never actually assigned from the file at
 *      all (though the merge ORDERING was already correct). Fixed in
 *      `generateMergeUsingFileLines` (generator/expression-gen.js): when
 *      positionalPairs finds nothing AND the FD record resolved to a plain
 *      elementary field, the already-fitted raw line text is scattered
 *      across the SD record's own children via the existing
 *      `scatterGroupFromString` helper (the same elementary-source-into-
 *      group-target convention MOVE/CALL BY REFERENCE already use).
 *
 *   2. GO TO (plain or DEPENDING ON) escaping an active PERFORM x THRU y
 *      range is, in real COBOL, a PERMANENT transfer - control never
 *      returns to the PERFORM's own caller. This generator models every
 *      paragraph as a Scala method and PERFORM as an ordinary call, which
 *      can only ever return normally, so it silently RESUMES after the
 *      PERFORM once nested calls unwind. No existing "abandon the whole
 *      call stack" mechanism generalizes to "resume at an arbitrary
 *      paragraph, then continue normal fallthrough from there" without a
 *      large, invasive refactor (threading "which THRU range is lexically
 *      active" through every statement-generation call site). Route taken:
 *      HONEST DECLINE - `annotateGoToThruEscapes` (generator/method-gen.js)
 *      statically detects, for every PERFORM ... THRU range in the program,
 *      any GO TO textually inside that range whose target lies outside it,
 *      and tags the AST node; `generateGoTo` (generator/expression-gen.js)
 *      renders a visible, compiling inline comment on the affected
 *      case/return - runtime behavior is otherwise UNCHANGED.
 *
 *   3. CALL ... USING BY REFERENCE of a single already-subscripted SCALAR
 *      table element (`WS-VAL(2)`) dropped the subscript entirely - the
 *      whole table's flat `Vector[...]` var was passed instead of the one
 *      element, a hard "Found: Vector[String], Required: String" compile
 *      crash, plus a second crash at the writeback site. Fixed in
 *      `generateCall` (generator/expression-gen.js): a subscripted, non-
 *      group USING operand now builds the correct `wsVal(idx)` read via
 *      `convertIdentifier` for the argument, and writes back through
 *      `renderAssignment`'s existing `.updated(idx, ...)` rebuild - both
 *      helpers already used elsewhere (MOVE/STRING/INSPECT, RELEASE/RETURN)
 *      for exactly this shape.
 *
 *   4. A genuinely negative/zero LITERAL subscript falls into two different
 *      generation-time-decidable buckets. (a) A bare literal directly in the
 *      subscript position (`WS-VAL(-1)`, `WS-VAL(0)`) is now `.max(0)`-
 *      clamped (it previously had NO clamp at all - a hard crash - unlike
 *      the dynamic case's existing round-18 guard) AND gets a visible inline
 *      block comment - a small, safe, purely additive fix
 *      (`literalSubscriptIndexExpr`, generator/expression-gen.js). (b) A
 *      *variable* holding a negative value at runtime (h08's own repro,
 *      `WS-VAL(WS-NEG)` with `WS-NEG` a signed field `VALUE -1`) is NOT
 *      decidable as a literal at generation time without whole-program
 *      constant-propagation (out of scope, fragile) - this case is left
 *      exactly as round-18 finding 8 built it (a defensive `.max(0)` clamp,
 *      no marker), documented as an ACCEPTED LIMITATION: cobc's own output
 *      for this shape is genuine, non-reproducible undefined behavior (an
 *      out-of-bounds memory read), so there is no "more correct" value to
 *      chase here - see tests/oracle/README.md's round-19 table.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/h08/h09/h11/h12
 * programs provide via the data-driven oracle suite. This file targets the
 * individual parser/generator mechanisms each finding traces to, in
 * isolation (no cobc/scala-cli needed).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: MERGE ... USING of a flat (non-group) FD record.
// ---------------------------------------------------------------------------

describe('round-19 finding 1: MERGE ... USING of a flat/elementary FD record scatters the raw line across the SD record\'s own children, not zero pairs', () => {
  test('h09 shape: a USING file whose FD record is a single elementary PIC X field is sliced into the SD record\'s own (differently-shaped) group children', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. H19MERGE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "IN1" ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "WORK".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1            PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY           PIC 9(3).
           05  M-TAG           PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           DISPLAY "DONE".
`;
    const scala = scalaOf(src);
    // The FD record's own elementary var must be read and fitted first...
    assert.match(scala, /inRec1 = CobolFmt\.fitLeft\(_mergeLine, 6\)/);
    // ...then SLICED across the SD record's own children by position/width -
    // never left unassigned (the pre-fix behavior: zero pairs, mKey/mTag
    // silently kept their stale/default values).
    assert.match(scala, /mKey = .*inRec1.*substring\(0, 3\)/);
    assert.match(scala, /mTag = \(inRec1\)\.substring\(3, 6\)/);
  });

  test('a USING file whose FD record is already a GROUP (the pre-existing, unaffected shape) still uses ordinary positional pairing', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "IN1" ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "WORK".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1.
           05  I1-KEY PIC 9(3).
           05  I1-VAL PIC X(3).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05  M-KEY  PIC 9(3).
           05  M-TAG  PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           DISPLAY "DONE".
`;
    const scala = scalaOf(src);
    assert.match(scala, /mKey = i1Key/);
    assert.match(scala, /mTag = i1Val/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: GO TO escaping an active PERFORM ... THRU range.
// ---------------------------------------------------------------------------

describe('round-19 finding 2: a GO TO whose target lies outside an enclosing PERFORM ... THRU range gets a visible, compiling honest-decline marker (documented non-fix)', () => {
  test('h11 shape: GO TO ... DEPENDING ON with one in-range and one out-of-range target only marks the out-of-range case', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. H19GODEP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BRANCH PIC 9(1) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM STEP-ONE THRU STEP-THREE.
           DISPLAY "MAIN-DONE".
           STOP RUN.
       STEP-ONE.
           GO TO STEP-TWO-A STEP-TWO-B DEPENDING ON WS-BRANCH.
       STEP-TWO-A.
       STEP-THREE.
           DISPLAY "STEP-THREE".
       STEP-TWO-B.
           DISPLAY "STEP-TWO-B".
       STEP-FOUR.
           DISPLAY "STEP-FOUR".
`;
    const scala = scalaOf(src);
    // STEP-TWO-A is inside the STEP-ONE..STEP-THREE range - no marker.
    assert.match(scala, /case 1 => return stepTwoA\(\)\n/);
    // STEP-TWO-B is outside the range - must carry a visible, compiling
    // honest-decline comment (round-19 finding 2), never a silent bare call.
    assert.match(scala, /case 2 => return stepTwoB\(\) \/\/ TODO\(round-19 finding 2\): "STEP-TWO-B" lies outside the enclosing PERFORM STEP-ONE THRU STEP-THREE range/);
  });

  test('a plain (no DEPENDING ON) GO TO to a paragraph outside the THRU range also gets the marker', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM STEP-ONE THRU STEP-TWO.
           STOP RUN.
       STEP-ONE.
           DISPLAY "ONE".
       STEP-TWO.
           GO TO STEP-THREE.
       STEP-THREE.
           DISPLAY "THREE".
`;
    const scala = scalaOf(src);
    assert.match(scala, /return stepThree\(\) \/\/ GO TO \/\/ TODO\(round-19 finding 2\): "STEP-THREE" lies outside the enclosing PERFORM STEP-ONE THRU STEP-TWO range/);
  });

  test('a GO TO whose target is INSIDE the enclosing THRU range is completely unaffected (no marker at all - regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM STEP-ONE THRU STEP-THREE.
           STOP RUN.
       STEP-ONE.
           GO TO STEP-THREE.
       STEP-TWO.
           DISPLAY "TWO".
       STEP-THREE.
           DISPLAY "THREE".
`;
    const scala = scalaOf(src);
    assert.match(scala, /return stepThree\(\) \/\/ GO TO\n/);
    assert.doesNotMatch(scala, /TODO\(round-19 finding 2\)/);
  });

  test('an ordinary GO TO with no enclosing PERFORM ... THRU at all is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       MAIN-PARA.
           GO TO STEP-TWO.
       STEP-TWO.
           DISPLAY "TWO".
`;
    const scala = scalaOf(src);
    assert.match(scala, /return stepTwo\(\) \/\/ GO TO\n/);
    assert.doesNotMatch(scala, /TODO\(round-19 finding 2\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: CALL ... USING BY REFERENCE of a single subscripted table
// element.
// ---------------------------------------------------------------------------

describe('round-19 finding 3: CALL ... USING BY REFERENCE of a single subscripted table element reads/writes back the correct element, not the whole table', () => {
  test('h12 shape: the argument is the subscripted element, and the writeback rebuilds the table via .updated at that same index', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. H19CBRMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-VAL PIC X(5) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "H19CBRSUB" USING BY REFERENCE WS-VAL(2).
           STOP RUN.
       END PROGRAM H19CBRMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. H19CBRSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-VAL PIC X(5).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-PARA.
           DISPLAY LK-VAL.
       END PROGRAM H19CBRSUB.
`;
    const scala = scalaOf(src);
    // The argument must be the subscripted READ, never the bare whole-table var.
    assert.match(scala, /val _callRet0 = H19cbrsub\.entry\(wsVal\(1\)\)/);
    // The writeback must rebuild the SAME element via .updated, never a bare
    // scalar-into-Vector assignment.
    assert.match(scala, /wsVal = wsVal\.updated\(1, _callRet0\)/);
  });

  test('CALL BY REFERENCE of an UNSUBSCRIPTED scalar is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. M.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-VAL PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "SUBX" USING BY REFERENCE WS-VAL.
           STOP RUN.
       END PROGRAM M.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. SUBX.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-VAL PIC X(5).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-PARA.
           DISPLAY LK-VAL.
       END PROGRAM SUBX.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsVal = Subx\.entry\(wsVal\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4: negative/zero subscripts - literal (fixed, small+safe) vs.
// dynamic-from-a-variable (documented accepted limitation, unchanged).
// ---------------------------------------------------------------------------

describe('round-19 finding 4: a bare negative/zero LITERAL subscript is now clamped AND marked (previously crashed with no clamp at all); a variable-derived negative subscript is an unchanged, documented accepted limitation', () => {
  test('a literal negative subscript (WS-VAL(-1)) is clamped to .max(0) and carries a visible inline block-comment marker', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-VAL-TABLE.
           05  WS-VAL PIC X(3) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-VAL(-1).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsVal\(\(-2\)\.max\(0\) \/\* TODO: literal COBOL subscript -1 is out of range/);
  });

  test('a literal zero subscript (WS-VAL(0)) is likewise clamped and marked', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-VAL-TABLE.
           05  WS-VAL PIC X(3) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-VAL(0).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsVal\(\(-1\)\.max\(0\) \/\* TODO: literal COBOL subscript 0 is out of range/);
  });

  test('an ordinary in-range literal subscript (>=1) is completely unaffected - no clamp, no marker (regression guard, matches round-18 finding 8\'s own test)', () => {
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
    assert.doesNotMatch(scala, /TODO: literal COBOL subscript/);
  });

  test('h08 shape: a VARIABLE holding a negative value at runtime (not a literal) is NOT special-cased - it keeps round-18\'s plain defensive .max(0) clamp with no marker (documented accepted limitation, not a regression)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEG PIC S9(2) VALUE -1.
       01  WS-VAL-TABLE.
           05  WS-VAL PIC X(3) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-VAL(WS-NEG).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsVal\(\(wsNeg - 1\)\.toInt\.max\(0\)\)/);
    assert.doesNotMatch(scala, /TODO: literal COBOL subscript/);
  });
});
