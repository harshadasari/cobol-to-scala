/**
 * tests/round13-fixes.test.js
 *
 * Focused unit tests for the round-13 adversarial-refutation findings:
 *   1. CALL ... USING BY REFERENCE of a GROUP containing an OCCURS table fell
 *      through generateCall's argExprs to a bare, undeclared-identifier
 *      reference (a group has no flat Scala var of its own) - a hard compile
 *      error. Fixed with an honest, visible, compiling TODO placeholder
 *      (the same route the writeback side already used) - true marshalling
 *      of an OCCURS-bearing group across a CALL boundary is NOT implemented
 *      (see tests/oracle/README.md's known gaps); this finding stays an
 *      honest degradation, not a hard pass.
 *   2. SORT ... INPUT PROCEDURE/OUTPUT PROCEDURE ... THRU never had its THRU
 *      range collected into generateAllMethods' THRU-wrapper-method pass (only
 *      PerformStatement nodes were scanned) - generateSort's own
 *      procedureCallExpr called a wrapper method that was never generated at
 *      all. Fixed by collecting SortStatement.inputProcedure/.outputProcedure
 *      THRU ranges the same way.
 *   3. (SEVERE) DECLARATIVES handler registries (DECL_FILE_HANDLERS/
 *      DECL_MODE_HANDLERS) were installed only AFTER every declarative
 *      body was already generated - any file operation INSIDE a DECLARATIVES
 *      section (a handler retrying its own OPEN, or one handler's body
 *      triggering another) saw empty/partial registries. Fixed with a real
 *      two-pass split: collectDeclarativeHandlers (no codegen) builds the
 *      complete registries FIRST, then generateDeclarativeMethodBodies
 *      generates bodies with the registries already fully visible.
 *   4. Level-66 RENAMES was parsed (item.renames/renamesThrough) but had
 *      zero codegen - it fell into the ordinary elementary-leaf branch and
 *      got its own disconnected, wrong flat var. Fixed by registering it as
 *      a synthetic GROUP_REGISTRY entry over the contiguous sibling range it
 *      renames (buildFieldRegistry's new flatLeafOrder), so DISPLAY
 *      (groupDisplayValueExpr) and MOVE INTO it (new
 *      generateScalarIntoGroupMove/scatterGroupFromString) both work exactly
 *      like an ordinary group.
 *   5. REDEFINES of a group-with-OCCURS by another group-with-OCCURS: three
 *      registries (TABLE_REGISTRY/subscripting, the REDEFINES-stub fallback,
 *      SEARCH's own lookupTable) disagreed about whether the redefining
 *      group's OCCURS child was a table at all - todoStubRedefinesLines
 *      declared its elementary children as bare scalar `def`s (occursDepth
 *      0), which a subscripted reference then tried to call as
 *      `String#apply(Int)` - a hard, mismatched-type Scala COMPILE error -
 *      while TABLE_REGISTRY had no entry for it at all, so SEARCH ALL
 *      silently degraded to "no metadata found" and never ran. Fixed via
 *      the documented "all three registries honestly agree" route (a true
 *      byte-slice table view is NOT implemented): todoStubRedefinesLines now
 *      registers the same TABLE_REGISTRY entry (times/indexed/ascending/
 *      descending) a real OCCURS item would get (fixing SEARCH ALL's
 *      "no metadata found" gap for a redefining table specifically) and
 *      declares each elementary child as a Vector-typed (not bare scalar)
 *      honest `???` stub - compiles cleanly, only throws NotImplementedError
 *      if actually read at runtime, never a type-mismatched compile error.
 *      This finding also stays an honest degradation, not a hard pass - see
 *      tests/oracle/README.md's known gaps.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/aa*.cbl programs
 * provide via the data-driven oracle suite. This file targets the individual
 * generator mechanisms each finding traces to, in isolation (no cobc/
 * scala-cli needed), so a regression is caught at the unit level even on a
 * machine without the compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: CALL ... USING BY REFERENCE of a GROUP containing an OCCURS
// table - generateCall's argExprs must degrade to a visible, compiling TODO
// placeholder, never a bare reference to a nonexistent Scala identifier.
// ---------------------------------------------------------------------------

const CALL_GROUP_OCCURS_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1303C.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 2.
               10  WS-VAL      PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-VAL(1).
           MOVE "BBB" TO WS-VAL(2).
           CALL "R1303D" USING BY REFERENCE WS-TABLE.
           STOP RUN.
       END PROGRAM R1303C.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1303D.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-TABLE.
           05  LK-ENTRY OCCURS 2.
               10  LK-VAL      PIC X(3).
       PROCEDURE DIVISION USING LK-TABLE.
       SUB-MAIN.
           DISPLAY "SUB SAW=" LK-VAL(1) "/" LK-VAL(2).
           GOBACK.
       END PROGRAM R1303D.
`;

test('Finding 1: CALL BY REFERENCE of a group containing an OCCURS table degrades to a visible TODO placeholder, never an undeclared-identifier reference', () => {
  const code = scalaOf(CALL_GROUP_OCCURS_SOURCE);
  assert.match(code, /TODO: CALL "R1303D" USING WS-TABLE/, 'must emit a visible, grep-able TODO for the unsupported argument shape');
  // The bug: a bare `wsTable` reference (no flat var of that name exists).
  assert.doesNotMatch(code, /\.entry\(\s*wsTable\s*\)/, 'must never reference a nonexistent flat var as the CALL argument');
});

test('Finding 1 regression guard: the pre-existing writeback-side TODO fallback (CALL BY REFERENCE group writeback) is untouched', () => {
  const code = scalaOf(CALL_GROUP_OCCURS_SOURCE);
  assert.match(code, /TODO: CALL \.\.\. USING BY REFERENCE .*: group writeback not/, 'writeback fallback must still fire');
});

// ---------------------------------------------------------------------------
// Finding 2: SORT ... INPUT PROCEDURE/OUTPUT PROCEDURE ... THRU must collect
// the THRU range into generateAllMethods' wrapper-method pass.
// ---------------------------------------------------------------------------

const SORT_THRU_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1308.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT WORK-FILE ASSIGN TO "SORTWK1".
       DATA DIVISION.
       FILE SECTION.
       SD  WORK-FILE.
       01  WORK-REC.
           05  WR-KEY   PIC 9(2).
       WORKING-STORAGE SECTION.
       01  WS-EOF-FLAG  PIC X(1) VALUE "N".
           88  SORT-EOF          VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SORT WORK-FILE ASCENDING KEY WR-KEY
               INPUT PROCEDURE IS 1000-FILL THRU 1000-FILL-EXIT
               OUTPUT PROCEDURE IS 2000-PRINT.
           STOP RUN.

       1000-FILL.
           MOVE 20 TO WR-KEY.
           RELEASE WORK-REC.
       1000-FILL-EXIT.
           EXIT.

       2000-PRINT.
           PERFORM UNTIL SORT-EOF
               RETURN WORK-FILE
                   AT END
                       SET SORT-EOF TO TRUE
                   NOT AT END
                       DISPLAY "KEY=" WR-KEY
               END-RETURN
           END-PERFORM.
`;

test('Finding 2: SORT ... INPUT PROCEDURE ... THRU generates the fromTo() wrapper method generateSort calls', () => {
  const code = scalaOf(SORT_THRU_SOURCE);
  // procedureCallExpr builds `<from>To<To-with-numeric-prefix-stripped>()`.
  assert.match(code, /def fillToFillExit/, 'the THRU wrapper method must actually be generated');
  assert.match(code, /fillToFillExit\(\)/, 'generateSort must call the wrapper it expects to exist');
});

// ---------------------------------------------------------------------------
// Finding 3 (SEVERE): DECLARATIVES handler registries must be fully
// populated BEFORE any declarative body is generated - a self-retriggering
// handler must fire (and terminate) more than once, and a two-handler
// reentrancy case must resolve both handlers regardless of declaration
// order.
// ---------------------------------------------------------------------------

const SELF_RETRIGGER_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1309B.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "R1309BA.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-A.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A               PIC X(10).
       WORKING-STORAGE SECTION.
       01  FS-A                PIC X(2).
       01  WS-RETRY-COUNT      PIC 9(1) VALUE 0.
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE-A-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-A.
       FILE-A-HANDLER-PARA.
           ADD 1 TO WS-RETRY-COUNT.
           IF WS-RETRY-COUNT = 1
               OPEN INPUT FILE-A
           END-IF.
       END DECLARATIVES.
       MAIN-PARA.
           OPEN INPUT FILE-A.
           DISPLAY "COUNT=" WS-RETRY-COUNT.
           STOP RUN.
`;

test('Finding 3 (termination/reentrancy): a DECLARATIVES handler retrying its own OPEN resolves to itself (registry already populated when its body is generated), not an empty registry', () => {
  const code = scalaOf(SELF_RETRIGGER_SOURCE);
  // The OPEN INSIDE the handler's own body must resolve to the SAME handler
  // method (fileAHandler) via declarativeHandlerFor - i.e. the generated
  // OPEN for FILE-A anywhere in this program calls the same handler name.
  const handlerCalls = code.match(/fileAHandler\w*\(\)/g) || [];
  assert.ok(handlerCalls.length >= 2, `expected the handler to be wired at least twice (its own retry OPEN + MAIN-PARA's OPEN), got: ${JSON.stringify(handlerCalls)}`);
});

const TWO_HANDLER_REENTRANCY_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1309.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "R1309A.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-A.
           SELECT FILE-B ASSIGN TO "R1309B.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-B.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A               PIC X(10).
       FD  FILE-B.
       01  REC-B               PIC X(10).
       WORKING-STORAGE SECTION.
       01  FS-A                PIC X(2).
       01  FS-B                PIC X(2).
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE-B-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-B.
       FILE-B-HANDLER-PARA.
           DISPLAY "HANDLER-B FIRED".
           OPEN INPUT FILE-A.
       FILE-A-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-A.
       FILE-A-HANDLER-PARA.
           DISPLAY "HANDLER-A FIRED".
       END DECLARATIVES.
       MAIN-PARA.
           OPEN INPUT FILE-B.
           STOP RUN.
`;

test('Finding 3 (two-handler reentrancy): handler B (declared FIRST) can trigger handler A (declared AFTER it) - both registries fully populated regardless of textual order', () => {
  const code = scalaOf(TWO_HANDLER_REENTRANCY_SOURCE);
  // Handler B's own body opens FILE-A - that OPEN must resolve to handler A's
  // method, even though handler A is declared AFTER handler B in the source.
  assert.match(code, /def fileBHandler/, 'handler B method must be generated');
  assert.match(code, /def fileAHandler/, 'handler A method must be generated');
  const fileBBody = code.slice(code.indexOf('def fileBHandler'), code.indexOf('def fileAHandler'));
  assert.match(fileBBody, /fileAHandler\(\)/, "handler B's own OPEN INPUT FILE-A must call handler A - only possible if the registry was already complete when handler B's body was generated");
});

// ---------------------------------------------------------------------------
// Finding 4: level-66 RENAMES - DISPLAY concatenates the covered range,
// MOVE INTO it scatters across the covered fields.
// ---------------------------------------------------------------------------

const RENAMES_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1311.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-A            PIC X(3).
           05  WS-B            PIC X(3).
           05  WS-C            PIC X(3).
       66  WS-AB RENAMES WS-A THRU WS-B.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-A.
           MOVE "BBB" TO WS-B.
           DISPLAY "AB=[" WS-AB "]".
           MOVE "XXXXXX" TO WS-AB.
           DISPLAY "A=[" WS-A "] B=[" WS-B "] C=[" WS-C "]".
           STOP RUN.
`;

test('Finding 4a: DISPLAY of a level-66 RENAMES name concatenates the covered sibling range (like a group)', () => {
  const code = scalaOf(RENAMES_SOURCE);
  assert.match(code, /wsA\b.*\+.*wsB\b/, 'the RENAMES name must render as wsA concatenated with wsB, like an ordinary group DISPLAY');
});

test('Finding 4b: MOVE INTO a level-66 RENAMES name scatters the source value across the covered fields by width', () => {
  const code = scalaOf(RENAMES_SOURCE);
  // scatterGroupFromString slices the source into per-child substrings and
  // assigns each covered field - both wsA and wsB must be assigned from a
  // substring of the scattered source, not left untouched.
  assert.match(code, /wsA = .*substring\(0, ?3\)/, 'WS-A must be assigned the first 3 characters of the scattered MOVE source');
  assert.match(code, /wsB = .*substring\(3, ?6\)/, 'WS-B must be assigned the next 3 characters of the scattered MOVE source');
});

test('Finding 4c regression guard: WS-C (outside the RENAMES range) keeps its own ordinary flat var untouched by the RENAMES wiring', () => {
  const code = scalaOf(RENAMES_SOURCE);
  assert.match(code, /var wsC: String/, 'WS-C must still be an ordinary elementary flat var');
});

// ---------------------------------------------------------------------------
// Finding 5: REDEFINES of a group-with-OCCURS by a group-with-OCCURS - all
// three registries (TABLE_REGISTRY/subscripting, the REDEFINES stub,
// SEARCH's own lookupTable) must agree it's a table, not a mismatched mix
// that crashes at compile time.
// ---------------------------------------------------------------------------

const REDEFINES_OCCURS_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R1313.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TAB-BY-NUM.
           05  WS-ENTRY-NUM OCCURS 3 ASCENDING KEY IS WS-NUM-KEY
               INDEXED BY IDX-N.
               10  WS-NUM-KEY   PIC 9(3).
               10  WS-NUM-VAL   PIC X(5).
       01  WS-TAB-BY-NAME REDEFINES WS-TAB-BY-NUM.
           05  WS-ENTRY-NAME OCCURS 3 ASCENDING KEY IS WS-NAME-KEY
               INDEXED BY IDX-S.
               10  WS-NAME-KEY  PIC X(3).
               10  WS-NAME-VAL  PIC X(5).
       01  WS-FOUND-FLAG        PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 100 TO WS-NUM-KEY(1).
           MOVE "NO " TO WS-FOUND-FLAG.
           SEARCH ALL WS-ENTRY-NAME
               AT END
                   MOVE "NO " TO WS-FOUND-FLAG
               WHEN WS-NAME-KEY(IDX-S) = "200"
                   MOVE "YES" TO WS-FOUND-FLAG
           END-SEARCH.
           DISPLAY "FLAG=" WS-FOUND-FLAG.
           STOP RUN.
`;

test('Finding 5a: a subscripted reference into a redefining OCCURS group\'s elementary child type-checks as a Vector (not a bare scalar that a subscript would call as String#apply)', () => {
  const code = scalaOf(REDEFINES_OCCURS_SOURCE);
  assert.match(code, /def wsNameKey: Vector\[String\]/, 'the redefining table\'s own elementary child must be declared Vector-typed, matching every other table-child shape');
  assert.doesNotMatch(code, /def wsNameKey: String\s*=\s*\?\?\?/, 'must never regress to the pre-fix bare-scalar stub (the r1313 compile-error shape)');
});

test('Finding 5b: SEARCH ALL over a redefining OCCURS group finds real TABLE_REGISTRY metadata (no more "no metadata found" no-op)', () => {
  const code = scalaOf(REDEFINES_OCCURS_SOURCE);
  assert.doesNotMatch(code, /no OCCURS\/INDEXED BY metadata found/, 'SEARCH ALL must no longer silently no-op for a redefining table');
  // A real SEARCH ALL binary search references the table's own INDEXED BY
  // index var and builds low/high bounds - substantially more than a bare
  // no-op comment.
  assert.match(code, /var idxS: Int/, 'the redefining table\'s own INDEXED BY name must get a real Int var');
});

test('Finding 5c: the whole program still compiles-shaped (both bare and Vector-consistent) - no undeclared identifier, no residual bare-scalar/subscript mismatch anywhere in the redefining table\'s own accessors', () => {
  const code = scalaOf(REDEFINES_OCCURS_SOURCE);
  assert.match(code, /def wsNameVal: Vector\[String\]/, 'WS-NAME-VAL must also be Vector-typed for the same reason as WS-NAME-KEY');
});
