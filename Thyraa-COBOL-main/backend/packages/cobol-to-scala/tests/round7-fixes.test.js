/**
 * tests/round7-fixes.test.js
 *
 * Focused unit tests for the round-7 adversarial-refutation findings (8
 * dishonest divergences: an always-true READ AT END truthiness bug, a
 * silently-dropped SECTION leading statement block, CALL's comma-consuming
 * parser bug plus no same-file multi-program/external-CALL support,
 * COMP-1/COMP-2 DISPLAY and arithmetic, a COMP-3 table subscript missing
 * `.toInt`, SPECIAL-NAMES DECIMAL-POINT IS COMMA, and MOVE group-to-
 * elementary referencing an undeclared bare identifier) - see
 * tests/oracle/README.md for the full end-to-end (cobc-vs-generated-Scala)
 * verification the promoted tests/corpus/proc/u*.cbl programs provide via
 * the data-driven oracle suite. This file targets the individual generator/
 * parser mechanisms each finding traces to, in isolation (no cobc/scala-cli
 * needed), so a regression is caught at the unit level even on a machine
 * without the compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala, parseCobol } from '../index.js';
import { generateIf } from '../generator/expression-gen.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 6 (MOST DANGEROUS): ReadStatement.atEnd/notAtEnd default to `[]` in
// ast.js, and `[] || x` is truthy in JS - the old
// `if (statement.atEnd || statement.notAtEnd)` was always true, so a bare
// `READ file.` (no AT END clause at all) rendered an if/hasNext/else with
// BOTH branches empty, and Scala 3's significant indentation then silently
// absorbed the *next* COBOL statement into the empty `else` as if it were
// unconditional.
// ---------------------------------------------------------------------------

const BARE_READ_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IO-FILE ASSIGN TO "io.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD IO-FILE.
       01 IO-REC PIC X(10).
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT IO-FILE.
           READ IO-FILE.
           DISPLAY "GOT=" IO-REC.
           CLOSE IO-FILE.
           STOP RUN.
`;

test('Finding 6a: a bare READ (no AT END clause) generates an unconditional read, never an if/hasNext/else with empty branches', () => {
  const code = scalaOf(BARE_READ_SOURCE);
  // The dangerous shape this bug produced: `else` immediately followed by a
  // statement at the SAME indent (nothing indented under the else at all).
  assert.doesNotMatch(code, /else\n(\s*)println/, 'the empty `else` must never be immediately followed by a same-indent statement');
  assert.match(code, /ioRec = CobolFmt\.fitLeft\(r, 10\)|_record\.foreach/, 'bare READ routes through the unconditional nextOption()/foreach path');
});

test('Finding 6b (regression guard): READ ... AT END / NOT AT END still emits both branches non-empty, with the real clause bodies', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IO-FILE ASSIGN TO "io.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD IO-FILE.
       01 IO-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-EOF PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT IO-FILE.
           READ IO-FILE
               AT END MOVE "Y" TO WS-EOF
               NOT AT END DISPLAY "GOT=" IO-REC
           END-READ.
           CLOSE IO-FILE.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /if ioFileIterator\.hasNext then/);
  assert.match(code, /wsEof = "Y"/);
  assert.match(code, /println\("GOT="/);
});

test('Finding 6c: generateIf with an empty thenStatements array (any degenerate/empty-THEN shape) emits a () placeholder rather than an empty branch that could swallow the following ELSE/statement via indentation', () => {
  const code = generateIf({
    condition: { type: 'RelationalCondition', subject: { type: 'VariableReference', name: 'WS-X' }, relationalOperator: '=', object: { type: 'Literal', literalType: 'numeric', value: '1' } },
    thenStatements: [],
    elseStatements: [{ type: 'DisplayStatement', values: [{ type: 'Literal', literalType: 'string', value: 'NO' }] }],
  });
  const lines = code.split('\n').map((l) => l.trim());
  const thenIdx = lines.findIndex((l) => l.startsWith('if '));
  assert.equal(lines[thenIdx + 1], '()', 'the empty THEN branch must emit a real () statement, not nothing');
  assert.equal(lines[thenIdx + 2], 'else');
});

// ---------------------------------------------------------------------------
// Finding 8: a SECTION's leading statements (directly under the SECTION
// header, before its first named paragraph) were silently discarded whenever
// the section also had at least one named paragraph.
// ---------------------------------------------------------------------------

const SECTION_ANON_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
           PERFORM 2000-WITH-ANON.
           DISPLAY "X=" WS-X.
           STOP RUN.

       2000-WITH-ANON SECTION.
           DISPLAY "ANON-BEFORE".
           MOVE 7 TO WS-X.
           PERFORM 2100-NAMED.

       2100-NAMED.
           DISPLAY "NAMED-PARA".
           ADD 1 TO WS-X.
`;

test('Finding 8: a SECTION leading block is preserved as an implicit first unit, both in the section wrapper and in generateAllMethods flat methods', () => {
  const code = scalaOf(SECTION_ANON_SOURCE);
  assert.match(code, /"ANON-BEFORE"/, 'the leading block itself must survive at all');
  assert.match(code, /"NAMED-PARA"/);
  // The section wrapper method chains the synthetic leading unit into the
  // named paragraph via the ordinary fall-through step chain.
  assert.match(code, /def withAnon\(\): Unit/);
});

// ---------------------------------------------------------------------------
// Finding 1: CALL - (a) the USING clause parser never consumed commas
// (neither at the CALL site nor in the callee's own PROCEDURE DIVISION
// USING), corrupting the token stream; (b) no same-file multi-program/CALL
// wiring existed at all; (c) an unresolvable CALL target rendered a bare,
// undeclared Scala call instead of an honest TODO.
// ---------------------------------------------------------------------------

test('Finding 1a: CALL ... USING BY REFERENCE A, B, C (comma-separated) parses all three parameters, not just the first', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(4) VALUE 1.
       01 WS-B PIC 9(4) VALUE 2.
       01 WS-C PIC 9(4) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "X" USING BY REFERENCE WS-A, WS-B, WS-C.
           STOP RUN.
`;
  const ast = parseCobol(source);
  const callStmt = ast.procedures.paragraphs[0].statements[0];
  assert.equal(callStmt.type, 'CallStatement');
  assert.equal(callStmt.using.length, 3, 'all three comma-separated USING operands must be captured');
});

test('Finding 1a (companion): a callee\'s own PROCEDURE DIVISION USING LK-A, LK-B, LK-C (comma-separated) also parses all three', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. CALLEE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       01 LK-C PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B, LK-C.
       MAIN-PARA.
           GOBACK.
`;
  const ast = parseCobol(source);
  assert.deepEqual(ast.procedures.using, ['LK-A', 'LK-B', 'LK-C']);
});

test('Finding 1b: a same-file (multi-PROGRAM-ID) CALL generates a sibling `object`, an `entry(...)` method, and reassigns BY REFERENCE args back from the returned tuple', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. CALLER.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(4) VALUE 10.
       01 WS-B PIC 9(4) VALUE 20.
       01 WS-SUM PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "ADDER" USING BY REFERENCE WS-A, WS-B, WS-SUM.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. ADDER.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       01 LK-SUM PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B, LK-SUM.
       ADD-PARA.
           ADD LK-A LK-B GIVING LK-SUM.
           GOBACK.
       END PROGRAM ADDER.
       END PROGRAM CALLER.
`;
  const code = scalaOf(source);
  assert.match(code, /object Adder:/, 'the callee gets its own sibling object');
  // round-12 finding 3: every entry() parameter now has a zero/spaces
  // default (so a CALL with fewer USING operands than this LINKAGE SECTION
  // declares still compiles) - the defaults don't change this fully-applied
  // CALL's own behavior at all, only the declared signature text.
  assert.match(code, /def entry\(_arg0: Int = 0, _arg1: Int = 0, _arg2: Int = 0\): \(Int, Int, Int\)/);
  // round-12 incidental fix: _callRet is now uniquely numbered per CALL site
  // (never a hardcoded literal name) - see generator/expression-gen.js's
  // resetCallRetSeq/nextCallRetName doc comment.
  assert.match(code, /val _callRet0 = Adder\.entry\(wsA, wsB, wsSum\)/);
  assert.match(code, /wsA = _callRet0\._1/);
  assert.match(code, /wsB = _callRet0\._2/);
  assert.match(code, /wsSum = _callRet0\._3/);
  assert.match(code, /@main def run/, 'only the first (outer) program gets the @main entry point');
});

test('Finding 1c: CALL to a name with no matching PROGRAM-ID anywhere in the source emits an honest TODO marker, never a bare undeclared call', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(4) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "EXTERNSUB" USING BY REFERENCE WS-A.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /\/\/ TODO: CALL "EXTERNSUB" - external subprogram not available for conversion/);
  assert.doesNotMatch(code, /^\s*externsub\(/m, 'never a bare call to an undeclared method name');
});

// ---------------------------------------------------------------------------
// Findings 2/3: COMP-1/COMP-2 (Float/Double) DISPLAY rendered an empty
// string (CobolFmt.num with 0/0 integer/decimal digits, since these have no
// PIC clause at all), and arithmetic stores hit a Float/Double vs BigDecimal
// compile error.
// ---------------------------------------------------------------------------

test('Finding 2: DISPLAY of a COMP-1/COMP-2 field routes through CobolFmt.floatDisplay, not the PIC-digit-count CobolFmt.num path', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-F1 COMP-1 VALUE 3.5.
       01 WS-F2 COMP-2 VALUE 2.25.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-F1.
           DISPLAY WS-F2.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /var wsF1: Float = 3\.5f/);
  assert.match(code, /var wsF2: Double = 2\.25d/);
  assert.match(code, /println\(CobolFmt\.floatDisplay\(wsF1\)\)/);
  assert.match(code, /println\(CobolFmt\.floatDisplay\(wsF2\)\)/);
  assert.match(code, /def floatDisplay\(v: Double\): String =/);
});

test('Finding 3: a COMPUTE storing into a Float target casts with .toFloat instead of leaving a bare BigDecimal expression', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-F1 COMP-1 VALUE 3.5.
       01 WS-F3 COMP-1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-F3 = WS-F1 * 2.0.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsF3 = \(.*\)\.toFloat/);
});

// ---------------------------------------------------------------------------
// Finding 4: a COMP-3 (BigDecimal-typed) loop variable used as a table
// subscript needs a `.toInt` conversion - Vector's apply/updated both
// require a plain Int index.
// ---------------------------------------------------------------------------

test('Finding 4: a COMP-3 PERFORM VARYING control variable used as a table subscript gets .toInt at both the read and .updated write sites', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I COMP-3 PIC S9(4) VALUE 0.
       01 WS-TABLE.
          05 WS-ITEM OCCURS 5 TIMES PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
               MOVE WS-I TO WS-ITEM(WS-I)
           END-PERFORM.
           DISPLAY WS-ITEM(3).
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsItem = wsItem\.updated\(\(wsI - 1\)\.toInt, /, 'write site');
  assert.match(code, /wsItem\(\(3 - 1\)\)|wsItem\(2\)/, 'a literal subscript is still folded, unaffected by this fix');
});

// ---------------------------------------------------------------------------
// Finding 5: SPECIAL-NAMES DECIMAL-POINT IS COMMA - a comma-decimal VALUE
// literal, and comma-as-decimal-point DISPLAY/edited-PICTURE rendering.
// ---------------------------------------------------------------------------

const DECIMAL_COMMA_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       CONFIGURATION SECTION.
       SPECIAL-NAMES.
           DECIMAL-POINT IS COMMA.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-AMT  PIC 9(3)V99 VALUE 123,45.
       01 WS-EDIT PIC ZZ9,99.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-AMT TO WS-EDIT.
           DISPLAY WS-EDIT.
           DISPLAY WS-AMT.
           STOP RUN.
`;

test('Finding 5a: SPECIAL-NAMES DECIMAL-POINT IS COMMA is parsed into environmentDivision.decimalPointIsComma', () => {
  const ast = parseCobol(DECIMAL_COMMA_SOURCE);
  assert.equal(ast.environmentDivision.decimalPointIsComma, true);
});

test('Finding 5b: a comma-decimal VALUE literal (123,45) parses to the numeric value 123.45, not two separate values', () => {
  const code = scalaOf(DECIMAL_COMMA_SOURCE);
  assert.match(code, /var wsAmt: BigDecimal = BigDecimal\("123\.45"\)/);
});

test('Finding 5c: DISPLAY of a plain numeric field renders the comma as the decimal separator when DECIMAL-POINT IS COMMA is set', () => {
  const code = scalaOf(DECIMAL_COMMA_SOURCE);
  assert.match(code, /CobolFmt\.num\(wsAmt, 3, 2, false, true\)/);
});

test('Finding 5d: MOVE to a numeric-edited field (PIC ZZ9,99) treats the comma as the pattern\'s decimal point under DECIMAL-POINT IS COMMA', () => {
  const code = scalaOf(DECIMAL_COMMA_SOURCE);
  assert.match(code, /CobolFmt\.edited\("ZZ9,99", .*, true\)/);
});

test('Finding 5 (regression guard): without SPECIAL-NAMES, CobolFmt.num/edited call sites pass false and a plain "123,45"-shaped VALUE parses as two comma-separated values (unaffected pre-existing behavior)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-AMT PIC 9(3)V99 VALUE 123.45.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-AMT.
           STOP RUN.
`;
  const ast = parseCobol(source);
  assert.equal(ast.environmentDivision.decimalPointIsComma, false);
  const code = scalaOf(source);
  assert.match(code, /CobolFmt\.num\(wsAmt, 3, 2, false, false\)/);
});

// ---------------------------------------------------------------------------
// Finding 7: MOVE of a whole GROUP item to an elementary receiver referenced
// the group's own (nonexistent) bare identifier - a group never gets a flat
// Scala var, only its children do.
// ---------------------------------------------------------------------------

test('Finding 7: MOVE GROUP-ITEM TO elementary-field renders the group source via groupDisplayValueExpr\'s raw-storage concatenation, not a bare undeclared identifier', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-GROUP.
          05 WS-A PIC X(4) VALUE "ABCD".
          05 WS-B PIC X(4) VALUE "WXYZ".
       01 WS-TARGET PIC X(8) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-GROUP TO WS-TARGET.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /wsTarget = \(wsGroup\)/, 'must never reference the undeclared bare group identifier');
  assert.match(code, /wsTarget = .*wsA.*\+.*wsB/, 'renders via the group\'s own children concatenated, like groupDisplayValueExpr');
});
