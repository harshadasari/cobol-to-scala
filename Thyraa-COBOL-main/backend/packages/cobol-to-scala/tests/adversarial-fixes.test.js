/**
 * tests/adversarial-fixes.test.js
 *
 * Focused unit tests for the fixes made in response to the Phase 1
 * adversarial-refutation programs (tests/corpus/data/a01-a12*.cbl) - see
 * those files and their sibling .oracle.txt captures for the full
 * end-to-end (cobc vs generated Scala) verification; this file targets the
 * individual generator/parser mechanisms those programs exercise, in
 * isolation, so a future regression is caught at the unit level rather than
 * only by a full oracle run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { tokenize } from '../parser/lexer.js';
import { parseProcedureDivision } from '../parser/procedure-parser.js';
import {
  formatEditedPicture,
  generateExpression,
  convertCondition,
  setFieldRegistry,
} from '../generator/expression-gen.js';

function parseSnippet(procedureDivisionBody) {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       0000-MAIN.
${procedureDivisionBody}
`;
  const tokens = tokenize(source, { format: 'fixed' });
  return parseProcedureDivision(tokens);
}

function firstStatement(procedureDivisionBody) {
  const division = parseSnippet(procedureDivisionBody);
  const paragraphs = division.paragraphs || division;
  return paragraphs[0].statements[0];
}

// ---------------------------------------------------------------------------
// MOVE: fixed-width alphanumeric truncation/padding, JUSTIFIED RIGHT,
// numeric MOVE truncation, numeric -> alphanumeric, numeric -> numeric-edited
// ---------------------------------------------------------------------------

test('MOVE: fixed-width alphanumeric truncates/pads right by default, left when JUSTIFIED RIGHT', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC              PIC X(10) VALUE 'ABCDEFGHIJ'.
       01  WS-TARGET-DEFAULT   PIC X(5).
       01  WS-TARGET-JUST      PIC X(5) JUSTIFIED RIGHT.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC TO WS-TARGET-DEFAULT
           MOVE WS-SRC TO WS-TARGET-JUST
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // Default alignment: fit to the source's own width, then fit-left (pad/
  // truncate right) to the target's width.
  assert.match(code, /wsTargetDefault = CobolFmt\.fitLeft\(CobolFmt\.fitLeft\(wsSrc, 10\), 5\)/);
  // JUSTIFIED RIGHT: same source fit, but fit-right (pad/truncate left) into
  // the target.
  assert.match(code, /wsTargetJust = CobolFmt\.fitRight\(CobolFmt\.fitLeft\(wsSrc, 10\), 5\)/);
});

test('MOVE: numeric source truncates to the target PIC digit widths (never rounds)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-5DIG      PIC 9(5) VALUE 12345.
       01  WS-TARGET-3DIG   PIC 9(3).
       01  WS-TARGET-8DIG   PIC 9(8).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC-5DIG TO WS-TARGET-3DIG
           MOVE WS-SRC-5DIG TO WS-TARGET-8DIG
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /CobolFmt\.truncNumeric\(BigDecimal\(wsSrc5dig\), 3, 0\)\.toInt/);
  assert.match(code, /CobolFmt\.truncNumeric\(BigDecimal\(wsSrc5dig\), 8, 0\)\.toInt/);
});

test('MOVE: numeric source to an alphanumeric target renders unsigned zero-padded digit text', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NUM-SRC       PIC 9(4) VALUE 7.
       01  WS-ALPHA-TARGET  PIC X(8).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-NUM-SRC TO WS-ALPHA-TARGET
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsAlphaTarget = CobolFmt\.fitLeft\(CobolFmt\.digitsOf\(BigDecimal\(wsNumSrc\), 4, 0\), 8\)/);
});

test('MOVE: a numeric variable source into a numeric-edited target routes through CobolFmt.edited at runtime', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-ZERO-SRC          PIC S9(3) VALUE 0.
       01  WS-ZERO-EDIT-TARGET  PIC ----9.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-ZERO-SRC TO WS-ZERO-EDIT-TARGET
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsZeroEditTarget = CobolFmt\.edited\("----9", .*wsZeroSrc.*, false\)/);
});

// ---------------------------------------------------------------------------
// MOVE: group-to-group (byte-wise, not type-converting)
// ---------------------------------------------------------------------------

test('MOVE group-to-group: identical child layout uses a plain per-field assignment (no case-class round trip)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-GROUP.
           05  WS-SRC-NUM      PIC S9(4) COMP-3 VALUE 1234.
           05  WS-SRC-TEXT     PIC X(5) VALUE 'HELLO'.
       01  WS-DST-GROUP.
           05  WS-DST-NUM      PIC S9(4) COMP-3.
           05  WS-DST-TEXT     PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC-GROUP TO WS-DST-GROUP
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  const mainBody = code.slice(code.indexOf('def main'));
  assert.match(mainBody, /wsDstNum = wsSrcNum/);
  assert.match(mainBody, /wsDstText = wsSrcText/);
  assert.ok(!mainBody.includes('.format('), 'identical-layout group MOVE should not need a byte-level round trip');
});

test('MOVE group-to-group: differing child layout (COMP-3 vs DISPLAY of the same size) round-trips through the case classes\' format/parse', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-GRP.
           05  WS-SRC-NUM     PIC S9(4) COMP-3 VALUE 1234.
           05  WS-SRC-TXT     PIC X(5) VALUE 'HELLO'.
       01  WS-DST-GRP.
           05  WS-DST-NUM     PIC S9(4).
           05  WS-DST-TXT     PIC X(5).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE WS-SRC-GRP TO WS-DST-GRP
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /WsSrcGrp\.format\(WsSrcGrp\(wsSrcNum, wsSrcTxt\)\)/);
  assert.match(code, /WsDstGrp\.parse\(_padded\)/);
  assert.match(code, /wsDstNum = _parsed\.wsDstNum/);
  assert.match(code, /wsDstTxt = _parsed\.wsDstTxt/);
});

// ---------------------------------------------------------------------------
// Subscript arithmetic: WS-T(WS-I + 1)
// ---------------------------------------------------------------------------

test('parser: a subscript is parsed as a full arithmetic expression, not truncated at the first operator', () => {
  const stmt = firstStatement(`           DISPLAY WS-T(WS-I + 1)
`);
  const ref = (stmt.values || stmt.items)[0];
  assert.equal(ref.subscripts.length, 1);
  const sub = ref.subscripts[0];
  // Must be a real ArithmeticExpression (operator '+', left=WS-I, right=1),
  // not the old {type:'variable', value:'WS-I'} shape that silently dropped
  // everything after the identifier.
  assert.equal(sub.type, 'ArithmeticExpression');
  assert.equal(sub.operator, '+');
  assert.ok(sub.left, 'left operand (WS-I) must be present');
  assert.ok(sub.right, 'right operand (1) must be present');
});

test('generator: WS-T(WS-I + 1) renders the full subscript expression, not just WS-I', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I  PIC 9(2) VALUE 1.
       01  WS-FLAT-TABLE.
           05  WS-T OCCURS 5 TIMES PIC S9(4) COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           DISPLAY WS-T(WS-I + 1)
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsT\(\(\(wsI \+ 1\)\) - 1\)/);
});

// ---------------------------------------------------------------------------
// ON SIZE ERROR (COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE)
// ---------------------------------------------------------------------------

test('parser: SUBTRACT/MULTIPLY/DIVIDE accept ON SIZE ERROR / NOT ON SIZE ERROR (previously only COMPUTE/ADD did)', () => {
  const subtractStmt = firstStatement(`           SUBTRACT 1 FROM WS-X GIVING WS-Y
               ON SIZE ERROR
                   DISPLAY 'ERR'
               NOT ON SIZE ERROR
                   DISPLAY 'OK'
           END-SUBTRACT
`);
  assert.equal(subtractStmt.onSizeError.length, 1);
  assert.equal(subtractStmt.notOnSizeError.length, 1);

  const multiplyStmt = firstStatement(`           MULTIPLY WS-X BY WS-Y
               ON SIZE ERROR
                   DISPLAY 'ERR'
           END-MULTIPLY
`);
  assert.equal(multiplyStmt.onSizeError.length, 1);

  const divideStmt = firstStatement(`           DIVIDE WS-X BY WS-Y GIVING WS-Q REMAINDER WS-R
               ON SIZE ERROR
                   DISPLAY 'ERR'
               NOT ON SIZE ERROR
                   DISPLAY 'OK'
           END-DIVIDE
`);
  assert.equal(divideStmt.remainder?.name, 'WS-R');
  assert.equal(divideStmt.onSizeError.length, 1);
  assert.equal(divideStmt.notOnSizeError.length, 1);
});

test('generator: MULTIPLY ON SIZE ERROR checks digit capacity and leaves the target unchanged on overflow', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC S9(18) COMP-3.
       01  WS-B  PIC S9(18) COMP-3 VALUE 2.
       01  WS-R  PIC S9(18) COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           MULTIPLY WS-A BY WS-B GIVING WS-R
               ON SIZE ERROR
                   DISPLAY 'ERR'
               NOT ON SIZE ERROR
                   DISPLAY 'OK'
           END-MULTIPLY
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  const mainBody = code.slice(code.indexOf('def main'));
  assert.match(mainBody, /if \(!CobolFmt\.fitsDigits\(\(wsA \* wsB\), 18\)\) then/);
  // The assignment to wsR must only happen in the else (not-on-size-error)
  // branch, after the error check - not unconditionally.
  const ifIdx = mainBody.indexOf('if (!CobolFmt.fitsDigits');
  const elseIdx = mainBody.indexOf('else', ifIdx);
  const assignIdx = mainBody.indexOf('wsR = wsA * wsB');
  assert.ok(assignIdx > elseIdx && elseIdx > ifIdx, 'assignment must be inside the else (no-size-error) branch');
});

test('generator: DIVIDE ON SIZE ERROR also guards against divide-by-zero', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DIVIDEND      PIC S9(5) COMP-3 VALUE 17.
       01  WS-ZERO-DIVISOR  PIC S9(5) COMP-3 VALUE 0.
       01  WS-QUOT          PIC S9(5) COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           DIVIDE WS-DIVIDEND BY WS-ZERO-DIVISOR GIVING WS-QUOT
               ON SIZE ERROR
                   DISPLAY 'ERR'
               NOT ON SIZE ERROR
                   DISPLAY 'OK'
           END-DIVIDE
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /\(wsZeroDivisor\) == BigDecimal\(0\)/);
});

test('generator: DIVIDE GIVING into a BigDecimal target does not double-wrap BigDecimal (the reported compile bug)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DIVIDEND  PIC S9(5) COMP-3 VALUE 17.
       01  WS-DIVISOR   PIC S9(5) COMP-3 VALUE 5.
       01  WS-QUOT      PIC S9(5) COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           DIVIDE WS-DIVIDEND BY WS-DIVISOR GIVING WS-QUOT
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsQuot = \(wsDividend \/ wsDivisor\)/);
  assert.ok(!code.includes('BigDecimal(wsDividend / wsDivisor)'), 'must not wrap an already-BigDecimal expression in BigDecimal(...)');
});

// ---------------------------------------------------------------------------
// 88-level condition names (IF / EVALUATE TRUE WHEN)
// ---------------------------------------------------------------------------

test('IF <88-name> generates the VALUE/THRU range test against the condition\'s parent field', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS-CODE      PIC 9(2) VALUE 5.
           88  WS-STATUS-OK        VALUE 1.
           88  WS-STATUS-ERROR    VALUE 5 THRU 9.
       01  WS-FLAG             PIC X VALUE 'Y'.
           88  WS-FLAG-YES         VALUE 'Y'.
       PROCEDURE DIVISION.
       0000-MAIN.
           IF WS-STATUS-ERROR
               DISPLAY 'ERR'
           END-IF
           IF WS-FLAG-YES
               DISPLAY 'YES'
           END-IF
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /if \(\(wsStatusCode >= 5 && wsStatusCode <= 9\)\) then/);
  assert.match(code, /if \(\(wsFlag == "Y"\)\) then/);
});

test('EVALUATE TRUE WHEN <88-name> generates the condition test directly (not a bogus TRUE == field comparison)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS-CODE      PIC 9(2) VALUE 5.
           88  WS-STATUS-OK        VALUE 1.
           88  WS-STATUS-ERROR    VALUE 5 THRU 9.
       PROCEDURE DIVISION.
       0000-MAIN.
           EVALUATE TRUE
               WHEN WS-STATUS-OK
                   DISPLAY 'OK'
               WHEN WS-STATUS-ERROR
                   DISPLAY 'ERROR'
               WHEN OTHER
                   DISPLAY 'OTHER'
           END-EVALUATE
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  const mainBody = code.slice(code.indexOf('def main'));
  assert.match(mainBody, /if \(\(\(wsStatusCode == 1\)\)\) then/);
  assert.match(mainBody, /else if \(\(\(wsStatusCode >= 5 && wsStatusCode <= 9\)\)\) then/);
  assert.ok(!mainBody.includes('wsStatusOk'), 'a condition name must never be treated as its own field reference');
});

// ---------------------------------------------------------------------------
// REDEFINES over an OCCURS table
// ---------------------------------------------------------------------------

test('REDEFINES over an OCCURS table generates a character-sliced Vector[String] accessor, not the numeric digit-slicing template', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FLAT-VIEW        PIC X(12).
       01  WS-TABLE-VIEW REDEFINES WS-FLAT-VIEW.
           05  WS-CHUNK OCCURS 3 TIMES PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /def wsChunk: Vector\[String\] =/);
  assert.match(code, /wsFlatView\.substring\(0 \+ i \* 4, 0 \+ \(i \+ 1\) \* 4\)/);
  assert.match(code, /def wsChunk_=\(v: Vector\[String\]\): Unit =/);
  // Must not fall back to the numeric (division/modulo) digit-slicing
  // template, which doesn't compile against a String target.
  assert.ok(!code.includes('% 1)'), 'must not emit the numeric digit-slicing template for a String-backed REDEFINES');
});

// ---------------------------------------------------------------------------
// Edited pictures: all-suppress zero -> blank, BLANK WHEN ZERO
// ---------------------------------------------------------------------------

test('formatEditedPicture: an all-Z (no 9) picture with a zero value zero-suppresses to all spaces', () => {
  assert.equal(formatEditedPicture('ZZZZZ', '0'), '     ');
});

test('formatEditedPicture: a picture with a trailing 9 still shows the anchored zero digit', () => {
  assert.equal(formatEditedPicture('ZZZ9', '0'), '   0');
});

test('formatEditedPicture: BLANK WHEN ZERO blanks the entire field when the value is zero', () => {
  assert.equal(formatEditedPicture('ZZZ9', '0', true), '    ');
});

test('formatEditedPicture: BLANK WHEN ZERO has no effect for a non-zero value', () => {
  assert.equal(formatEditedPicture('ZZZ9', '42', true), '  42');
});

// ---------------------------------------------------------------------------
// Coverage honesty: safeNodeString ordering + generateExpression default case
// ---------------------------------------------------------------------------

test('convertCondition: a FunctionCall node reaching a path with no dedicated FunctionCall handling never renders as a bare identifier', () => {
  setFieldRegistry(new Map());
  const fakeFunctionCallNode = { type: 'FunctionCall', name: 'UPPER-CASE', arguments: [] };
  const rendered = convertCondition(fakeFunctionCallNode);
  assert.match(rendered, /\?\?\?.*TODO.*FunctionCall/);
  assert.ok(!rendered.includes('upperCase'), `must not silently render as a bare identifier: ${rendered}`);
});

test('convertCondition: a synthetic/future unknown node type renders the TODO marker before any bare-name fallback', () => {
  setFieldRegistry(new Map());
  const syntheticNode = { type: 'FutureConstructNotYetSupported', name: 'SOME-FIELD' };
  const rendered = convertCondition(syntheticNode);
  assert.match(rendered, /\?\?\?.*TODO.*FutureConstructNotYetSupported/);
  assert.ok(!rendered.includes('someField'), `must not silently render as a bare identifier: ${rendered}`);
});

test('generateExpression: an unsupported statement type still compiles (no-op) and carries a visible TODO marker', () => {
  const code = generateExpression({ type: 'SomeUnsupportedFutureStatement' }, 1);
  assert.match(code, /^\s*\(\)/, 'must still be a valid, compiling no-op statement');
  assert.match(code, /\?\?\?/);
  assert.match(code, /SOMEUNSUPPORTEDFUTURE/i);
});
