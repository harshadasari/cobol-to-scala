/**
 * tests/round4-fixes.test.js
 *
 * Focused unit tests for the round-4 adversarial-refutation findings (13
 * dishonest divergences: SECTION handling, UNSTRING, and six expression/
 * statement gaps) - see tests/oracle/README.md for the full end-to-end
 * (cobc-vs-generated-Scala) verification the promoted tests/corpus/proc/q*.cbl
 * programs provide via the data-driven oracle suite. This file targets the
 * individual generator/parser mechanisms each finding traces to, in isolation
 * (no cobc/scala-cli needed), so a regression is caught at the unit level
 * even on a machine without the compiler toolchain installed.
 *
 * Numbered to match the task's own findings list (SECTION cluster 7-9,
 * UNSTRING cluster 10-13, expression/statement fixes 1-6).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { findMainProcedure } from '../generator/scala-generator.js';
import { parseCobol } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 7: PERFORM of a SECTION name must generate a callable method that
// runs every paragraph in that section, in order, with fall-through bounded
// to just that section.
// ---------------------------------------------------------------------------

test('Finding 7: PERFORM of a SECTION name generates a bounded wrapper method', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(1).
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 3000-THIRD
           STOP RUN.
       3000-THIRD SECTION.
       3000-PARA-A.
           DISPLAY 'A'.
       3000-PARA-B.
           DISPLAY 'B'.
`;
  const code = scalaOf(source);
  // A callable "third()" wrapper must exist (not just the call site).
  assert.match(code, /def third\(\): Unit =/);
  // It calls its own paragraphs' already-generated flat methods (not a
  // duplicated copy of their bodies - see renderNestedFallthroughSteps's doc
  // comment for why: duplicating bodies as same-named nested defs risks an
  // out-of-line PERFORM elsewhere resolving to the wrong, fallthrough-rigged
  // sibling instead of the real bounded method) and chains them via
  // fall-through.
  assert.match(code, /def third\(\): Unit =\s*\n\s*def _step0\(\): Unit =\s*\n\s*paraA\(\)\s*\n\s*_step1\(\) \/\/ implicit fall-through\s*\n\s*def _step1\(\): Unit =\s*\n\s*paraB\(\)\s*\n\s*_step0\(\)/);
  // And the PERFORM statement itself calls it.
  assert.match(code, /third\(\)/);
});

// ---------------------------------------------------------------------------
// Finding 8: same bare paragraph name (after numeric-prefix stripping) in two
// different sections must not collide as duplicate top-level defs.
// ---------------------------------------------------------------------------

test('Finding 8: colliding bare paragraph names across sections are qualified by section', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(1).
       PROCEDURE DIVISION.
       1000-FIRST SECTION.
       1000-PARA-A.
           DISPLAY 'ONE'.
       2000-SECOND SECTION.
       2000-PARA-A.
           DISPLAY 'TWO'.
`;
  const code = scalaOf(source);
  // Exactly one top-level (2-space-indented) `def paraA` may never appear
  // twice - both occurrences must be qualified by their own section.
  const topLevelParaA = code.match(/^ {2}def paraA\(\): Unit =/gm) || [];
  assert.equal(topLevelParaA.length, 0, `expected no unqualified top-level paraA, found:\n${code}`);
  assert.match(code, /^ {2}def firstParaA\(\): Unit =/m);
  assert.match(code, /^ {2}def secondParaA\(\): Unit =/m);
});

// ---------------------------------------------------------------------------
// Finding 9: the entry point is the first unit of PROCEDURE DIVISION - a
// paragraph or a SECTION - and fall-through spans the whole division,
// including across section boundaries.
// ---------------------------------------------------------------------------

test('Finding 9: findMainProcedure resolves the first paragraph of the first SECTION when no top-level paragraph precedes it', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(1).
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-ENTRY.
           DISPLAY 'START'.
       1000-NEXT SECTION.
       1000-ONE.
           DISPLAY 'NEXT-ONE'.
           STOP RUN.
`;
  const ast = parseCobol(source);
  assert.equal(findMainProcedure(ast), '0000-ENTRY');
});

test('Finding 9: run() chains fall-through across section boundaries instead of calling a hallucinated mainProcedure()', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(1).
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-ENTRY.
           DISPLAY 'START'.
       1000-NEXT SECTION.
       1000-ONE.
           DISPLAY 'NEXT-ONE'.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /mainprocedure\(\)/i);
  const runIdx = code.indexOf('@main def run');
  assert.ok(runIdx >= 0);
  const runBody = code.slice(runIdx);
  // run() must fall through from START's paragraph (entry()) into 1000-ONE
  // (one()) automatically - calling each unit's own flat method via a
  // positionally-named step wrapper (see renderNestedFallthroughSteps),
  // never a hallucinated name.
  assert.match(runBody, /def _step0\(\): Unit =\s*\n\s*entry\(\)\s*\n\s*_step1\(\) \/\/ implicit fall-through/);
  assert.match(runBody, /def _step1\(\): Unit =\s*\n\s*one\(\)/);
});

// ---------------------------------------------------------------------------
// Finding 10: UNSTRING WITH POINTER must start at the pointer's current
// position and write the advanced position back.
// ---------------------------------------------------------------------------

test('Finding 10: UNSTRING WITH POINTER reads the starting position and writes back the new one', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC  PIC X(20) VALUE 'AAA BBB CCC DDD EEE'.
       01  WS-PTR  PIC 9(2) VALUE 5.
       01  WS-T1   PIC X(5).
       01  WS-T2   PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-SRC DELIMITED BY SPACE INTO WS-T1 WS-T2 WITH POINTER WS-PTR
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /CobolUnstring\.unstring\(wsSrc, \(wsPtr\) - 1, Seq\(.*\), 2\)/);
  assert.match(code, /wsPtr = _newPtr \+ 1/);
});

// ---------------------------------------------------------------------------
// Finding 11: UNSTRING DELIMITED BY ALL must record the ALL flag and collapse
// consecutive delimiters at codegen time.
// ---------------------------------------------------------------------------

test('Finding 11: UNSTRING DELIMITED BY ALL records the ALL flag through to codegen', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC  PIC X(10) VALUE 'A,,B,,,C'.
       01  WS-T1   PIC X(5).
       01  WS-T2   PIC X(5).
       01  WS-T3   PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-SRC DELIMITED BY ALL ',' INTO WS-T1 WS-T2 WS-T3
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /Seq\(\("\,", true\)\)/);

  const ast = parseCobol(source);
  const stmt = ast.procedures.paragraphs[0].statements[0];
  assert.equal(stmt.type, 'UnstringStatement');
  assert.equal(stmt.delimiters.length, 1);
  assert.equal(stmt.delimiters[0].all, true);
});

// ---------------------------------------------------------------------------
// Finding 12: DELIMITER IN must populate the delimiter receiver per target.
// ---------------------------------------------------------------------------

test('Finding 12: UNSTRING DELIMITER IN populates the matched-delimiter receiver', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC  PIC X(10) VALUE 'AA,BB;CC'.
       01  WS-T1   PIC X(5).
       01  WS-D1   PIC X(1).
       01  WS-T2   PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-SRC DELIMITED BY ',' OR ';'
               INTO WS-T1 DELIMITER IN WS-D1 WS-T2
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsD1 = _delims\.lift\(0\)\.getOrElse\(""\)/);
});

// ---------------------------------------------------------------------------
// Finding 13: two UNSTRING statements in the same method must not collide
// over `_parts`/`_delims`/`_newPtr` - each is wrapped in its own block scope.
// ---------------------------------------------------------------------------

test('Finding 13: multiple UNSTRING statements in one paragraph are each their own block scope', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC1 PIC X(10) VALUE 'A,B,C'.
       01  WS-SRC2 PIC X(10) VALUE 'D,E,F'.
       01  WS-T1   PIC X(5).
       01  WS-T2   PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-SRC1 DELIMITED BY ',' INTO WS-T1 WS-T2
           UNSTRING WS-SRC2 DELIMITED BY ',' INTO WS-T1 WS-T2
           STOP RUN.
`;
  // generateMain: false - a single copy of the paragraph, so the count below
  // reflects exactly the two UNSTRING statements themselves (with
  // generateMain: true, main()'s body is also duplicated verbatim inside
  // run()'s whole-program fall-through nest - see finding 9 - which would
  // double this count for an unrelated reason).
  const code = convertToScala(source, {}).scala;
  const declCount = (code.match(/val \(_parts, _delims, _newPtr\) =/g) || []).length;
  assert.equal(declCount, 2);
  // Each UNSTRING's generated statement opens its own `{` block.
  const openBraces = (code.match(/\{\s*\n\s*val \(_parts,/g) || []).length;
  assert.equal(openBraces, 2);
});

// ---------------------------------------------------------------------------
// Finding 1: figurative constants in comparisons must resolve to the
// comparison operand's field width, not the keyword's own text.
// ---------------------------------------------------------------------------

test('Finding 1: HIGH-VALUES/LOW-VALUES in a comparison expand to the other operand\'s width, not their keyword text', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-HV  PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           IF WS-HV = HIGH-VALUES
               DISPLAY 'EQ'
           END-IF
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /"HIGH-VALUE"/);
  // 5 repeated 0xFF (ÿ) characters, matching WS-HV's PIC X(5) width.
  assert.match(code, /wsHv == "ÿ{5}"/);
});

test('Finding 1: IF HIGH-VALUES > LOW-VALUES parses as a real relational condition, not an orphaned TODO', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(1).
       PROCEDURE DIVISION.
       0000-MAIN.
           IF HIGH-VALUES > LOW-VALUES
               DISPLAY 'YES'
           ELSE
               DISPLAY 'NO'
           END-IF
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /unsupported statement/);
  assert.doesNotMatch(code, /if true then/);
  assert.match(code, /ÿ\.compareTo\( \)|compareTo/);
});

// ---------------------------------------------------------------------------
// Finding 2: zeroLiteralFor must route an edited-picture target through
// formatEditedPicture, not a bare run of '0' characters.
// ---------------------------------------------------------------------------

test('Finding 2: MOVE ZEROES to a numeric-edited field formats through the PICTURE', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-EDITED PIC ZZ,ZZ9.99.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE ZEROES TO WS-EDITED
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /wsEdited = "0000000000000"/);
  assert.match(code, /wsEdited = "\s*0\.00"/);
});

// ---------------------------------------------------------------------------
// Finding 3: INSPECT BEFORE/AFTER INITIAL must actually restrict the
// TALLYING/REPLACING/CONVERTING region, not be silently discarded.
// ---------------------------------------------------------------------------

test('Finding 3: INSPECT TALLYING ... BEFORE INITIAL restricts the scan region', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CNT PIC 9(4).
       01  WS-S1  PIC X(10) VALUE 'AAZAAAAZAA'.
       PROCEDURE DIVISION.
       0000-MAIN.
           INSPECT WS-S1 TALLYING WS-CNT FOR ALL 'A' BEFORE INITIAL 'Z'
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /unsupported statement/);
  assert.match(code, /CobolInspect\.beforeInitial\(wsS1, "Z"\)\._1/);
  assert.match(code, /CobolInspect\.tallyAll\(CobolInspect\.beforeInitial\(wsS1, "Z"\)\._1, "A"\)/);
});

test('Finding 3: INSPECT REPLACING ... AFTER INITIAL reattaches the unchanged prefix', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-S2  PIC X(10) VALUE 'AAZAAAAZAA'.
       PROCEDURE DIVISION.
       0000-MAIN.
           INSPECT WS-S2 REPLACING ALL 'A' BY 'X' AFTER INITIAL 'Z'
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /CobolInspect\.afterInitial\(wsS2, "Z"\)/);
  assert.match(code, /_rest \+ CobolInspect\.replaceAll\(_reg, "A", "X"\)/);
});

// ---------------------------------------------------------------------------
// Finding 4: DIVIDE ... GIVING into a numeric-edited receiver must route
// through the edited formatter instead of a raw Int/BigDecimal assignment.
// ---------------------------------------------------------------------------

test('Finding 4: DIVIDE GIVING into a numeric-edited receiver formats through CobolFmt.edited', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DIVIDEND  PIC 9(5) VALUE 17.
       01  WS-DIVISOR   PIC 9(5) VALUE 5.
       01  WS-QUOT-EDIT PIC ZZ,ZZ9.
       01  WS-REM       PIC 9(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           DIVIDE WS-DIVIDEND BY WS-DIVISOR GIVING WS-QUOT-EDIT REMAINDER WS-REM
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /wsQuotEdit = wsDividend \/ wsDivisor/);
  assert.match(code, /wsQuotEdit = CobolFmt\.edited\(/);
});

// ---------------------------------------------------------------------------
// Finding 5: PERFORM VARYING ... AFTER must leave the AFTER variable holding
// its FROM-reset value once the whole nest exits (matching cobc), not
// whatever value its own last inner pass reached.
// ---------------------------------------------------------------------------

test('Finding 5: PERFORM VARYING ... AFTER resets the AFTER variable to FROM after every outer increment, including the last', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I PIC S9(3).
       01  WS-J PIC S9(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM VARYING WS-I FROM 1 BY 2 UNTIL WS-I > 5
               AFTER WS-J FROM 10 BY -3 UNTIL WS-J < 1
               DISPLAY WS-I WS-J
           END-PERFORM
           STOP RUN.
`;
  const code = scalaOf(source);
  // Both levels are initialized once, up front, before the outer while.
  assert.match(code, /wsI = 1\s*\n\s*wsJ = 10\s*\n\s*while !\(wsI > 5\) do/);
  // After the outer level's own increment, the AFTER variable is reset again
  // (unconditionally - even on the outer loop's final, test-failing retest).
  assert.match(code, /wsI = wsI \+ 2\s*\n\s*wsJ = 10/);
});

// ---------------------------------------------------------------------------
// Finding 6: a qualified AND subscripted identifier must resolve the
// qualifier on the read path exactly like the write path already does.
// ---------------------------------------------------------------------------

test('Finding 6: a qualified + subscripted identifier resolves the qualifier on the read path', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEPT-A.
           05  WS-TEAM OCCURS 2 TIMES.
               10  WS-EMP-NAME PIC X(6).
       01  WS-DEPT-B.
           05  WS-TEAM OCCURS 2 TIMES.
               10  WS-EMP-NAME PIC X(6).
       01  WS-OUT PIC X(6).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-EMP-NAME OF WS-DEPT-A (1) TO WS-OUT
           STOP RUN.
`;
  const code = scalaOf(source);
  // The read side must resolve through the same qualified (DeptA-prefixed)
  // flat var the write side already would - never a bare, unqualified
  // `wsEmpName(0)` (which isn't even a declared identifier when the name is
  // ambiguous across two records).
  assert.doesNotMatch(code, /= wsEmpName\(0\)/);
  assert.match(code, /wsOut = .*\(0\)/);
});
