/**
 * tests/round3-fixes.test.js
 *
 * Focused unit tests for the round-3 adversarial-refutation findings (12
 * dishonest divergences, plus one more found while docs were being
 * fact-checked in parallel - "finding 13"/"unrounded truncation") - see
 * tests/oracle/README.md for the full end-to-end (cobc-vs-generated-Scala)
 * verification the promoted tests/corpus/proc/n*.cbl programs provide via
 * the data-driven oracle suite. This file targets the individual generator/
 * parser mechanisms each finding traces to, in isolation (no cobc/scala-cli
 * needed), so a regression is caught at the unit level even on a machine
 * without the compiler toolchain installed.
 *
 * Numbered to match the refutation's own findings list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function mainBodyOf(source, marker = 'def main') {
  const code = convertToScala(source, {}).scala;
  const idx = code.indexOf(marker);
  assert.ok(idx >= 0, `expected to find "${marker}" in generated code:\n${code}`);
  return code.slice(idx);
}

// ---------------------------------------------------------------------------
// Finding 1: EXIT PERFORM must exit only the nearest enclosing inline PERFORM
// loop (scala.util.boundary.break()), not `return` the whole method.
// ---------------------------------------------------------------------------

test('Finding 1: EXIT PERFORM compiles to scala.util.boundary.break() inside a boundary-wrapped loop', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM UNTIL WS-I >= 10
               ADD 1 TO WS-I
               IF WS-I = 5
                   EXIT PERFORM
               END-IF
           END-PERFORM
           DISPLAY 'AFTER'
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /scala\.util\.boundary \{/);
  assert.match(body, /scala\.util\.boundary\.break\(\) \/\/ EXIT PERFORM/);
  assert.doesNotMatch(body, /^\s*return\s*\/\/ EXIT PERFORM/m);
  // The statement after END-PERFORM must still be generated (not skipped as
  // if EXIT PERFORM were a method-level `return`).
  assert.match(body, /println\("AFTER"\)/);
});

// ---------------------------------------------------------------------------
// Finding 2: EXIT PARAGRAPH must skip the rest of *this* paragraph (`return`
// from its own method), not be a no-op comment.
// ---------------------------------------------------------------------------

test('Finding 2: EXIT PARAGRAPH compiles to a `return`, skipping the rest of the paragraph', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAG  PIC 9(1) VALUE 1.
       01  WS-B     PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM SUB-PARA
           STOP RUN.
       SUB-PARA.
           IF WS-FLAG = 1
               EXIT PARAGRAPH
           END-IF
           ADD 1 TO WS-B.
`;
  const body = mainBodyOf(source, 'def subPara');
  assert.match(body, /if wsFlag == 1 then\s*\n\s*return \/\/ EXIT PARAGRAPH/);
  assert.doesNotMatch(body, /\(\)\s*\/\/ EXIT PARAGRAPH/);
});

// ---------------------------------------------------------------------------
// Finding 3: reference modification is a documented gap - both the read and
// write paths must degrade to a visible, *compiling* `???` marker, never the
// pre-fix mis-parse (a stray `:length)` corrupting the rest of the
// statement stream) or a silent wrong value.
// ---------------------------------------------------------------------------

test("Finding 3: reference modification (start:length) parses cleanly (doesn't corrupt subsequent tokens) and degrades to a compiling ??? TODO", () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FIELD  PIC X(10) VALUE 'ABCDEFGHIJ'.
       01  WS-SUB    PIC X(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-FIELD(2:3) TO WS-SUB
           MOVE 'XYZ' TO WS-FIELD(4:3)
           DISPLAY WS-SUB
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // Read path: a visible, compiling TODO - not the whole field silently
  // substituted in, and not a parse corruption that would have swallowed
  // the rest of the statement (see parser/procedure-parser.js's
  // parseVariableReference fix).
  assert.match(code, /\?\?\? \/\* TODO: reference modification \(read\) not implemented/);
  // Write path: likewise a visible, compiling TODO - not the mis-dispatch
  // into subscript codegen the pre-fix parser produced. round-39 finding 2:
  // this is now a BLOCK comment (`/* ... */`), not the original's line
  // comment (`// ...`) - assignExpr's RECURSIVE_LEAF_NAMES branch (needed so
  // a ref-mod write TARGET naming a RECURSIVE program's own LINKAGE leaf
  // doesn't hit a "Reassignment to val" compile crash - see oo04) wraps this
  // value expression inside `<camel>_=( ... )`, and a `//` line comment
  // would have swallowed the closing `)` into the comment too.
  assert.match(code, /wsField = \?\?\? \/\* TODO: reference modification \(write\) not implemented/);
  // The DISPLAY statement (and everything else in the paragraph) must still
  // have parsed correctly - not been swallowed by a corrupted cursor.
  assert.match(code, /println\(\(wsSub\)/);
});

// ---------------------------------------------------------------------------
// Finding 4: a relational condition's subject/object must be a full
// arithmetic expression, not truncated to a single term.
// ---------------------------------------------------------------------------

test('Finding 4: IF subject/object parse as full arithmetic expressions, not just the first term', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC 9(3) VALUE 5.
       01  WS-B  PIC 9(3) VALUE 4.
       01  WS-C  PIC 9(3) VALUE 18.
       PROCEDURE DIVISION.
       0000-MAIN.
           IF WS-A * WS-B > WS-C
               DISPLAY 'GT'
           END-IF
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /if \(wsA \* wsB\) > wsC then/);
});

// ---------------------------------------------------------------------------
// Finding 5: relational type coercion - a numeric literal vs. an
// alphanumeric field must not emit a hard Scala 3 compile error
// ("Values of types Int and String cannot be compared").
// ---------------------------------------------------------------------------

test('Finding 5: numeric literal compared to an alphanumeric field coerces instead of comparing Int to String directly', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS  PIC X(1) VALUE '0'.
       PROCEDURE DIVISION.
       0000-MAIN.
           IF WS-STATUS = 0
               DISPLAY 'ZERO'
           END-IF
           STOP RUN.
`;
  const body = mainBodyOf(source);
  // Compiler-verified (probe1.cbl, see the fix's doc comment): the numeric
  // literal contributes its own bare digit text (here 1 char, matching
  // WS-STATUS's own width - no padding needed), compared as strings - never
  // `wsStatus == 0` (String == Int, a Scala 3 compile error).
  assert.match(body, /if wsStatus == "0" then/);
  assert.doesNotMatch(body, /wsStatus == 0(?!\d)/);
});

// ---------------------------------------------------------------------------
// Finding 6: REDEFINES of a GROUP by another GROUP must declare working
// vars/accessors for the redefining item's own children - not leave them
// entirely undeclared (a hard compile error the instant they're referenced).
// ---------------------------------------------------------------------------

test('Finding 6: group-over-group REDEFINES declares a synthetic flat view and character-slices the redefining children over it', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DATE.
           05  WS-YEAR   PIC 9(4).
           05  WS-MONTH  PIC 9(2).
       01  WS-DATE-ALT REDEFINES WS-DATE.
           05  WS-MONTH-ALT  PIC 9(2).
           05  WS-YEAR-ALT   PIC 9(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(
    code,
    /def wsDateAltBaseFlat: String = CobolFmt\.digitsOf\(BigDecimal\(wsYear\), 4, 0\) \+ CobolFmt\.digitsOf\(BigDecimal\(wsMonth\), 2, 0\)/
  );
  assert.match(code, /def wsDateAltBaseFlat_=\(v: String\): Unit =/);
  assert.match(code, /def wsMonthAlt: String = wsDateAltBaseFlat\.substring\(0, 2\)/);
  assert.match(code, /def wsMonthAlt_=\(v: String\): Unit = wsDateAltBaseFlat = /);
  assert.ok(!code.includes('target not found'), 'must not fall back to the "target not found" no-op comment');
});

test('Finding 6: an unsupported group-over-group shape (FILLER gap) degrades to a visible, compiling ??? TODO, never an undeclared reference', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BASE.
           05  WS-A  PIC 9(2).
           05  FILLER PIC X(2).
       01  WS-BASE-ALT REDEFINES WS-BASE.
           05  WS-B  PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /def wsB: String = \?\?\? \/\/ TODO REDEFINES WS-BASE: unsupported group shape/);
  assert.match(code, /def wsB_=\(v: String\): Unit = \(\) \/\/ TODO REDEFINES WS-BASE: write discarded/);
});

// ---------------------------------------------------------------------------
// Finding 7: a numeric STRING segment must contribute its digit-display
// text, not a bare Int/BigDecimal value (which has no .indices/.take and
// would not even compile in the segment-copy loop).
// ---------------------------------------------------------------------------

test('Finding 7: a numeric STRING segment is coerced to its digit-display string before the char-copy codegen', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-QTY  PIC 9(3) VALUE 1.
       01  WS-OUT  PIC X(20).
       PROCEDURE DIVISION.
       0000-MAIN.
           STRING 'Q=' WS-QTY DELIMITED BY SIZE INTO WS-OUT
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /val _seg1 = CobolFmt\.digitsOf\(BigDecimal\(wsQty\), 3, 0\)/);
  assert.match(body, /_seg1\.indices/);
});

// ---------------------------------------------------------------------------
// Finding 8: COMPUTE ROUNDED must round (HALF_UP); its absence must truncate
// - not silently do neither (the pre-fix behavior: ROUNDED was a no-op
// trailing comment and non-ROUNDED never truncated at all).
// ---------------------------------------------------------------------------

test('Finding 8: COMPUTE ROUNDED uses CobolFmt.roundNumeric; without ROUNDED it truncates via CobolFmt.truncNumeric', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A   PIC S9(3)V99 VALUE 8.75.
       01  WS-R1  PIC S9(3)V9 VALUE 0.
       01  WS-R2  PIC S9(3)V9 VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           COMPUTE WS-R1 ROUNDED = WS-A
           COMPUTE WS-R2 = WS-A
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /wsR1 = CobolFmt\.roundNumeric\(wsA, 3, 1\)/);
  assert.match(body, /wsR2 = CobolFmt\.truncNumeric\(wsA, 3, 1\)/);
});

// ---------------------------------------------------------------------------
// Finding 9: ADD ... GIVING with multiple targets must apply ROUNDED/
// truncation *per target*, to each target's own declared digit widths, and
// coerce BigDecimal -> Int for a 0-decimal target.
// ---------------------------------------------------------------------------

test('Finding 9: ADD GIVING multiple targets each get their own store-time coercion (and BigDecimal->Int for a 0-decimal target)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A     PIC S9(3)V99 VALUE 1.
       01  WS-B     PIC S9(3)V99 VALUE 1.
       01  WS-SUM1  PIC S9(3)V9 VALUE 0.
       01  WS-SUM2  PIC S9(3) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           ADD WS-A WS-B GIVING WS-SUM1 ROUNDED WS-SUM2 ROUNDED
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /wsSum1 = CobolFmt\.roundNumeric\(\(wsA \+ wsB\), 3, 1\)/);
  assert.match(body, /wsSum2 = \(CobolFmt\.roundNumeric\(\(wsA \+ wsB\), 3, 0\)\)\.toInt/);
});

// ---------------------------------------------------------------------------
// Finding 10: SUBTRACT CORRESPONDING was entirely unimplemented (fell
// through to treating a GROUP reference as a bare elementary operand).
// ---------------------------------------------------------------------------

test('Finding 10: SUBTRACT CORRESPONDING subtracts every matched child pair, mirroring ADD CORRESPONDING', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC1.
           05  WS-AMT  PIC S9(5) VALUE 1.
       01  WS-REC2.
           05  WS-AMT  PIC S9(5) VALUE 1.
       PROCEDURE DIVISION.
       0000-MAIN.
           SUBTRACT CORRESPONDING WS-REC1 FROM WS-REC2
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /wsRec2WsAmt = \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsRec2WsAmt\) - BigDecimal\(wsRec1WsAmt\)\), 5, 0\)\)\.toInt/);
});

// ---------------------------------------------------------------------------
// Finding 11: MOVE ALL 'literal' must tile the literal across the whole
// target width, not space-pad it once like a plain MOVE.
// ---------------------------------------------------------------------------

test("Finding 11: MOVE ALL 'lit' repeats the literal to fill the target width", () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FILL  PIC X(10).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE ALL 'AB' TO WS-FILL
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /wsFill = "ABABABABAB"/);
});

// ---------------------------------------------------------------------------
// Finding 12: abbreviated combined relation conditions (`A = 1 OR 2`,
// `A > 1 AND < 5`) must expand to carry the subject (and operator, when
// elided) into each abbreviated term - not silently become literal `true`.
// ---------------------------------------------------------------------------

test('Finding 12: abbreviated OR carries the subject into the elided term (A = 1 OR 2)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       0000-MAIN.
           IF WS-A = 1 OR 2
               DISPLAY 'X'
           END-IF
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /if \(wsA == 1 \|\| wsA == 2\) then/);
  assert.doesNotMatch(body, /\|\| true\)/);
});

test('Finding 12: abbreviated AND carries the subject and the new operator into the elided term (A > 1 AND < 5)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       0000-MAIN.
           IF WS-A > 1 AND < 5
               DISPLAY 'X'
           END-IF
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /if \(wsA > 1 && wsA < 5\) then/);
  assert.doesNotMatch(body, /&& true\)/);
});

// ---------------------------------------------------------------------------
// Finding 13 (found while docs were being fact-checked in parallel):
// arithmetic without ROUNDED must truncate to the target's declared decimal
// digits at store time - not silently keep the exact (over-precise) result,
// which CobolFmt.num's own HALF_UP DISPLAY formatting then rounds instead of
// truncating.
// ---------------------------------------------------------------------------

test('Finding 13: unrounded COMPUTE truncates (never rounds) to the target scale, including negative values', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC S9(3)V999 VALUE 2.345.
       01  WS-NEG  PIC S9(3)V999 VALUE -2.345.
       01  WS-R  PIC S9(3)V99 VALUE 0.
       01  WS-RN  PIC S9(3)V99 VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           COMPUTE WS-R = WS-A
           COMPUTE WS-RN = WS-NEG
           STOP RUN.
`;
  const body = mainBodyOf(source);
  assert.match(body, /wsR = CobolFmt\.truncNumeric\(wsA, 3, 2\)/);
  assert.match(body, /wsRn = CobolFmt\.truncNumeric\(wsNeg, 3, 2\)/);
});
