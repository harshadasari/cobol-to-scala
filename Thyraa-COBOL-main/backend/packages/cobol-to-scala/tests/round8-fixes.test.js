/**
 * tests/round8-fixes.test.js
 *
 * Focused unit tests for the round-8 adversarial-refutation findings (4
 * dishonest divergences: CALL ... USING BY REFERENCE of a GROUP item
 * generating a reference to a nonexistent flat Scala var, FUNCTION
 * NUMVAL crashing under SPECIAL-NAMES' DECIMAL-POINT IS COMMA, an
 * unequal-width alphanumeric relational comparison silently doing a bare
 * (unpadded) Scala string `==`, and a group-level VALUE clause never
 * flowing down to its VALUE-less children) - see tests/oracle/README.md for
 * the full end-to-end (cobc-vs-generated-Scala) verification the promoted
 * tests/corpus/proc/v*.cbl programs provide via the data-driven oracle
 * suite. This file targets the individual generator mechanisms each finding
 * traces to, in isolation (no cobc/scala-cli needed), so a regression is
 * caught at the unit level even on a machine without the compiler toolchain
 * installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: CALL "X" USING BY REFERENCE <group-item> - generateCall
// (generator/expression-gen.js) and generateEntryMethod
// (generator/scala-generator.js) both assumed every USING operand was a
// scalar registered in the field registry; a group operand has no flat
// Scala var of its own (only its children do), so both the caller-side
// argument expression and the callee-side `entry(...)` parameter
// assignment/return referenced a nonexistent identifier - a hard "Not
// found" Scala compile error. Fixed by passing/returning the group's own
// concatenated raw-storage text (groupDisplayValueExpr) and scattering it
// back into the group's children by fixed byte offsets/widths
// (scatterGroupFromString) on whichever side receives it.
// ---------------------------------------------------------------------------

const GROUP_BYREF_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. V02-CALL-GROUP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-A    PIC 9(4) VALUE 1.
           05 WS-B    PIC X(4) VALUE "INIT".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE A=" WS-A " B=" WS-B.
           CALL "V02SUB" USING BY REFERENCE WS-REC.
           DISPLAY "AFTER  A=" WS-A " B=" WS-B.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. V02SUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-REC.
           05 LK-A    PIC 9(4).
           05 LK-B    PIC X(4).
       PROCEDURE DIVISION USING LK-REC.
       SUB-PARA.
           MOVE 99 TO LK-A.
           MOVE "ZZZZ" TO LK-B.
           GOBACK.
       END PROGRAM V02SUB.
       END PROGRAM V02-CALL-GROUP.
`;

test('Finding 1a: CALL ... USING BY REFERENCE of a GROUP passes the concatenated group text in, never a bare (nonexistent) group var', () => {
  const code = scalaOf(GROUP_BYREF_SOURCE);
  assert.doesNotMatch(code, /\bwsRec\b/, 'WS-REC has no flat Scala var of its own - nothing should reference one named wsRec');
  assert.match(code, /V02sub\.entry\(\(CobolFmt\.digitsOf\(BigDecimal\(wsA\), 4, 0\) \+ CobolFmt\.fitLeft\(wsB, 4\)\)\)/,
    'the CALL argument must be the group\'s own concatenated raw-storage text, built from its real children (wsA/wsB)');
});

test('Finding 1b: the BY REFERENCE group writeback scatters the call\'s returned string back into the caller\'s own child vars by fixed offset/width', () => {
  const code = scalaOf(GROUP_BYREF_SOURCE);
  assert.match(code, /val _callRet = V02sub\.entry/);
  assert.match(code, /wsA = BigDecimal\(\(_callRet\)\.substring\(0, 4\)\)\.toInt/, 'WS-A (4 numeric digits at offset 0) must be parsed back out of the returned string');
  assert.match(code, /wsB = \(_callRet\)\.substring\(4, 8\)/, 'WS-B (4 chars at offset 4) must be sliced back out of the returned string');
});

test('Finding 1c: the callee entry(...) scatters its incoming string into its own LINKAGE children and returns their concatenated text back out', () => {
  const code = scalaOf(GROUP_BYREF_SOURCE);
  assert.doesNotMatch(code, /\blkRec\b/, 'LK-REC has no flat Scala var of its own either - nothing should reference one named lkRec');
  assert.match(code, /def entry\(_arg0: String\): String =/, 'a group LINKAGE parameter still has no fieldRegistry entry, so it keeps the pre-existing String fallback type');
  assert.match(code, /lkA = BigDecimal\(\(_arg0\)\.substring\(0, 4\)\)\.toInt/);
  assert.match(code, /lkB = \(_arg0\)\.substring\(4, 8\)/);
  // The method's final expression must be the group's own children
  // concatenated back together (mirrors groupDisplayValueExpr), never a bare
  // reference to the nonexistent `lkRec` var.
  assert.match(code, /CobolFmt\.digitsOf\(BigDecimal\(lkA\), 4, 0\) \+ CobolFmt\.fitLeft\(lkB, 4\)/);
});

// ---------------------------------------------------------------------------
// Finding 2: FUNCTION NUMVAL under SPECIAL-NAMES' DECIMAL-POINT IS COMMA -
// CobolFmt.numval had no decimalComma parameter (unlike its num/edited
// siblings), so a comma-decimal string like "123,45" crashed
// BigDecimal's parser instead of parsing to 123.45.
// ---------------------------------------------------------------------------

const NUMVAL_COMMA_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. V05C.
       ENVIRONMENT DIVISION.
       CONFIGURATION SECTION.
       SPECIAL-NAMES.
           DECIMAL-POINT IS COMMA.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-STR       PIC X(8) VALUE "123,45".
       01 WS-NUM       PIC 9(4)V99 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE FUNCTION NUMVAL(WS-STR) TO WS-NUM.
           DISPLAY "NUMVAL=" WS-NUM.
           STOP RUN.
`;

test('Finding 2a: CobolFmt.numval\'s runtime definition accepts a decimalComma parameter, defaulting to false', () => {
  const code = scalaOf(NUMVAL_COMMA_SOURCE);
  assert.match(code, /def numval\(s: String, decimalComma: Boolean = false\): BigDecimal =/);
});

test('Finding 2b: FUNCTION NUMVAL threads the current DECIMAL-POINT IS COMMA setting through to CobolFmt.numval', () => {
  const code = scalaOf(NUMVAL_COMMA_SOURCE);
  assert.match(code, /CobolFmt\.numval\(wsStr, true\)/);
});

test('Finding 2c (regression guard): FUNCTION NUMVAL without DECIMAL-POINT IS COMMA still passes false', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-STR       PIC X(8) VALUE "123.45".
       01 WS-NUM       PIC 9(4)V99 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE FUNCTION NUMVAL(WS-STR) TO WS-NUM.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /CobolFmt\.numval\(wsStr, false\)/);
});

// ---------------------------------------------------------------------------
// Finding 3: an unequal-width alphanumeric relational comparison
// (renderRelationalCondition's string-vs-string branch) did a bare Scala
// `==`/`.compareTo` with no space-padding - COBOL always pads the shorter
// operand to the longer's declared width before comparing.
// ---------------------------------------------------------------------------

const UNEQUAL_COMPARE_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SHORT     PIC X(3) VALUE "AB ".
       01 WS-LONG      PIC X(6) VALUE "AB    ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-SHORT = WS-LONG
               DISPLAY "EQUAL"
           END-IF.
           STOP RUN.
`;

test('Finding 3a: two alphanumeric fields of different declared widths are padded to the longer width before Scala == comparison', () => {
  const code = scalaOf(UNEQUAL_COMPARE_SOURCE);
  assert.match(code, /\(wsShort \+ "   "\) == wsLong/, 'the 3-char WS-SHORT must be padded with 3 spaces before comparing against the 6-char WS-LONG');
});

test('Finding 3b: a literal operand\'s own text length is used as its width for padding, same as a field\'s picLength', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-LONG      PIC X(6) VALUE "AB    ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-LONG = "AB"
               DISPLAY "EQUAL"
           END-IF.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsLong == \("AB" \+ "    "\)/, 'the 2-char literal "AB" must be padded with 4 spaces before comparing against the 6-char WS-LONG');
});

test('Finding 3c (regression guard): two alphanumeric operands of the SAME declared width still compare directly, with no padding spliced in', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A         PIC X(4) VALUE "AAAA".
       01 WS-B         PIC X(4) VALUE "BBBB".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-A = WS-B
               DISPLAY "EQUAL"
           END-IF.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsA == wsB/);
  assert.doesNotMatch(code, /wsA \+ "/, 'same-width operands must not have any padding spliced onto them');
});

// ---------------------------------------------------------------------------
// Finding 4: a group-level VALUE clause never propagated down to a
// VALUE-less child (buildFieldRegistry's defaultElementaryValue only ever
// read a leaf's OWN VALUE clause) - every child of such a group silently
// defaulted to zero/blank instead of its own slice of the ancestor's
// literal.
// ---------------------------------------------------------------------------

const GROUP_VALUE_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. V10-GROUP-VALUE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC VALUE "AB1234".
           05 WS-CODE   PIC X(2).
           05 WS-NUM    PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "CODE=" WS-CODE " NUM=" WS-NUM.
           STOP RUN.
`;

test('Finding 4a: a VALUE-less alphanumeric child of a VALUE-bearing group initializes to its own positional slice of the ancestor\'s literal', () => {
  const code = scalaOf(GROUP_VALUE_SOURCE);
  assert.match(code, /var wsCode: String = "AB"/);
});

test('Finding 4b: a VALUE-less numeric child of a VALUE-bearing group initializes to the digit text at its own offset (implied decimal point reinserted per its own PICTURE)', () => {
  const code = scalaOf(GROUP_VALUE_SOURCE);
  assert.match(code, /var wsNum: Int = 1234/);
});

test('Finding 4c: a child WITH its own VALUE clause still wins over an enclosing group\'s VALUE (own VALUE always overrides inheritance)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC VALUE "AB1234".
           05 WS-CODE   PIC X(2) VALUE "ZZ".
           05 WS-NUM    PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /var wsCode: String = "ZZ"/, 'WS-CODE\'s own VALUE clause must win over WS-REC\'s inherited "AB"');
  assert.match(code, /var wsNum: Int = 1234/, 'WS-NUM (no VALUE of its own) still inherits from WS-REC');
});

test('Finding 4d: a group VALUE literal shorter than the full group width is space-padded, and a numeric child landing on that padding falls back to its ordinary zero default (not a parse crash/garbage value)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC VALUE "AB".
           05 WS-CODE   PIC X(2).
           05 WS-NUM    PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /var wsCode: String = "AB"/);
  assert.match(code, /var wsNum: Int = 0/, 'WS-NUM\'s slice of the padding ("    ") is not digit text, so it falls back to the ordinary zero default');
});

test('Finding 4e: a nested group with no VALUE of its own still inherits a slice of a further-up ancestor\'s VALUE clause', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC VALUE "AB1234CD".
           05 WS-CODE   PIC X(2).
           05 WS-INNER.
               10 WS-NUM  PIC 9(4).
               10 WS-TAIL PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /var wsCode: String = "AB"/);
  assert.match(code, /var wsNum: Int = 1234/);
  assert.match(code, /var wsTail: String = "CD"/);
});

test('Finding 4f regression guard: an ordinary group with NO group-level VALUE clause leaves its VALUE-less children at their normal zero/blank defaults', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-CODE   PIC X(2).
           05 WS-NUM    PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /var wsCode: String = ""/);
  assert.match(code, /var wsNum: Int = 0/);
});
