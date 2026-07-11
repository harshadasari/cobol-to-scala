/**
 * tests/round6-fixes.test.js
 *
 * Focused unit tests for the round-6 adversarial-refutation findings (6
 * dishonest divergences across 3 programs: WRITE ... ADVANCING, a
 * convertLiteral text-shape guess that discarded quoted-string identity,
 * STRING/UNSTRING ON OVERFLOW, and an unguarded STRING copy loop) - see
 * tests/oracle/README.md for the full end-to-end (cobc-vs-generated-Scala)
 * verification the promoted tests/corpus/proc/t*.cbl programs provide via
 * the data-driven oracle suite. This file targets the individual generator/
 * parser mechanisms each finding traces to, in isolation (no cobc/scala-cli
 * needed), so a regression is caught at the unit level even on a machine
 * without the compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala, parseCobol } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: WRITE ... AFTER/BEFORE ADVANCING n LINES/PAGE - previously
// parsed but completely ignored by the live codegen path (generateWriteStatement).
// ---------------------------------------------------------------------------

const ADVANCING_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "out.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE "LINE-ONE" TO OUT-REC.
           WRITE OUT-REC AFTER ADVANCING 1 LINE.
           MOVE "LINE-TWO" TO OUT-REC.
           WRITE OUT-REC AFTER ADVANCING 3 LINES.
           CLOSE OUT-FILE.
           STOP RUN.
`;

test('Finding 1a: WRITE AFTER ADVANCING n LINES emits CobolFmt.advanceSep as a leading separator, not a trailing println', () => {
  const code = scalaOf(ADVANCING_SOURCE);
  assert.match(code, /def advanceSep\(n: Int\): String = if n <= 0 then "\\r" else "\\n" \* n/);
  assert.match(code, /outFileWriter\.print\(CobolFmt\.advanceSep\(\(1\)\.toInt\)\); outFileWriter\.print\(\(outRec\)\.stripTrailing\(\)\)/);
  assert.match(code, /outFileWriter\.print\(CobolFmt\.advanceSep\(\(3\)\.toInt\)\); outFileWriter\.print\(\(outRec\)\.stripTrailing\(\)\)/);
});

test('Finding 1b: CLOSE flushes a final newline for a file that uses ADVANCING (the deferred terminator model leaves the last line unterminated otherwise)', () => {
  const code = scalaOf(ADVANCING_SOURCE);
  assert.match(code, /if outFileWriter != null then \{ try outFileWriter\.print\("\\n"\) catch case _: Exception => \(\) \}/);
});

test('Finding 1c (regression guard): a WRITE with no ADVANCING clause anywhere in the program keeps the exact pre-round-6 println call', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "out.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE "HELLO" TO OUT-REC.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /outFileWriter\.println\(\(outRec\)\.stripTrailing\(\)\)/);
  // CobolFmt.advanceSep's *definition* is always embedded (part of the
  // always-present CobolFmt runtime helper) - what must NOT appear is a
  // *call site* for this file, or the CLOSE-time final-newline flush.
  assert.doesNotMatch(code, /CobolFmt\.advanceSep\(/);
  assert.doesNotMatch(code, /outFileWriter\.print\("\\n"\)/);
});

// ---------------------------------------------------------------------------
// Findings 2/3: convertLiteral inferred string-vs-numeric from the literal's
// own TEXT SHAPE (a bare regex), discarding the parser's own literalType tag
// - a quoted digit-shaped string ("10", "0") rendered as a bare Scala Int,
// breaking both relational-condition comparisons (FILE STATUS = "10") and any
// runtime helper expecting a String argument (CobolInspect.replaceCharacters).
// ---------------------------------------------------------------------------

test('Finding 2: a quoted digit-shaped string literal in a relational condition renders as a Scala string, not a bare Int', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS  PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-STATUS = "10"
               DISPLAY "EOF"
           END-IF.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsStatus == "10"/);
  assert.doesNotMatch(code, /wsStatus == 10\b/);
});

test('Finding 3: INSPECT REPLACING CHARACTERS BY a quoted digit-shaped literal passes it to CobolInspect as a String, not a bare Int', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TEXT  PIC X(10) VALUE "AB12CD34Z".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-TEXT REPLACING CHARACTERS BY "0" BEFORE INITIAL "Z".
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /CobolInspect\.replaceCharacters\(_reg, "0"\)/);
  assert.doesNotMatch(code, /CobolInspect\.replaceCharacters\(_reg, 0\)/);
});

test('Finding 2/3 (regression guard): a bare (unquoted) numeric literal still renders as a plain Scala numeric token', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-N  PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-N = 10
               DISPLAY "TEN"
           END-IF.
           MOVE 10 TO WS-N.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsN == 10\b/);
  assert.doesNotMatch(code, /wsN == "10"/);
});

// ---------------------------------------------------------------------------
// Findings 4/5: STRING ON OVERFLOW/NOT ON OVERFLOW was parsed but dropped at
// codegen entirely, and the character-copy loop had no bounds check at all -
// a guaranteed StringIndexOutOfBoundsException the moment the combined
// source segments exceeded the target's declared width.
// ---------------------------------------------------------------------------

const STRING_OVERFLOW_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SMALL  PIC X(6).
       01  WS-SRC1   PIC X(5) VALUE "HELLO".
       01  WS-SRC2   PIC X(5) VALUE "WORLD".
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-SRC1 DELIMITED BY SIZE
                  WS-SRC2 DELIMITED BY SIZE
                  INTO WS-SMALL
               ON OVERFLOW
                   DISPLAY "OVERFLOWED"
               NOT ON OVERFLOW
                   DISPLAY "FIT-OK"
           END-STRING.
           STOP RUN.
`;

test('Finding 4: STRING ON OVERFLOW/NOT ON OVERFLOW branches are generated and gated on an _overflow flag', () => {
  const code = scalaOf(STRING_OVERFLOW_SOURCE);
  assert.match(code, /var _overflow = false/);
  assert.match(code, /if _overflow then/);
  assert.match(code, /"OVERFLOWED"/);
  assert.match(code, /"FIT-OK"/);
});

test('Finding 5: the STRING copy loop is bounds-checked against the target width instead of an unguarded setCharAt', () => {
  const code = scalaOf(STRING_OVERFLOW_SOURCE);
  assert.match(code, /if _pos >= 0 && _pos < 6 then _sb\.setCharAt\(_pos, _seg\d+\(_i\)\) else _overflow = true/);
  assert.doesNotMatch(code, /_sb\.setCharAt\(_ptr - 1 \+ _i, _seg\d+\(_i\)\)/);
});

test('Finding 4/5 (regression guard): STRING with neither overflow clause still gets the bounds-checked copy but no overflow branch', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TARGET  PIC X(20).
       01  WS-SRC     PIC X(5) VALUE "HELLO".
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-SRC DELIMITED BY SIZE INTO WS-TARGET.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /var _overflow = false/);
  assert.doesNotMatch(code, /if _overflow then/);
});

// ---------------------------------------------------------------------------
// Finding 6: UNSTRING ON OVERFLOW/NOT ON OVERFLOW was not parsed AT ALL - the
// unconsumed clause corrupted the statement stream (its branch bodies leaked
// out as unconditional top-level siblings after the UNSTRING statement).
// ---------------------------------------------------------------------------

const UNSTRING_OVERFLOW_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC  PIC X(20) VALUE "AA,BB,CC,DD,EE".
       01  WS-U1   PIC X(4).
       01  WS-U2   PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           UNSTRING WS-SRC DELIMITED BY ","
               INTO WS-U1 WS-U2
               ON OVERFLOW
                   DISPLAY "OVERFLOWED"
               NOT ON OVERFLOW
                   DISPLAY "FIT-OK"
           END-UNSTRING.
           DISPLAY "AFTER".
           STOP RUN.
`;

test('Finding 6a: parseUnstringStatement parses ON OVERFLOW / NOT ON OVERFLOW instead of leaking them as sibling statements', () => {
  const ast = parseCobol(UNSTRING_OVERFLOW_SOURCE);
  const statements = ast.procedures.paragraphs[0].statements;
  assert.equal(statements.length, 3, 'UNSTRING, DISPLAY "AFTER", STOP RUN - no leaked ON OVERFLOW siblings');

  const stmt = statements[0];
  assert.equal(stmt.type, 'UnstringStatement');
  assert.equal(stmt.onOverflow.length, 1);
  assert.equal(stmt.notOnOverflow.length, 1);
  assert.equal(stmt.onOverflow[0].type, 'DisplayStatement');
  assert.equal(stmt.notOnOverflow[0].type, 'DisplayStatement');
});

test('Finding 6b: generateUnstring destructures CobolUnstring.unstring\'s 4th (overflow) element and gates ON OVERFLOW/NOT ON OVERFLOW on it', () => {
  const code = scalaOf(UNSTRING_OVERFLOW_SOURCE);
  assert.match(code, /val \(_parts, _delims, _newPtr, _overflow\) = CobolUnstring\.unstring/);
  assert.match(code, /if _overflow then/);
  assert.match(code, /"OVERFLOWED"/);
  assert.match(code, /"FIT-OK"/);
  assert.match(code, /def unstring\(source: String, startPos: Int, delims: Seq\[\(String, Boolean\)\], maxFields: Int\): \(Vector\[String\], Vector\[String\], Int, Boolean\)/);
});

test('Finding 6 (regression guard): UNSTRING with neither overflow clause still compiles to the plain 4-tuple destructure with no overflow branch', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC  PIC X(10) VALUE "AA,BB".
       01  WS-U1   PIC X(4).
       01  WS-U2   PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           UNSTRING WS-SRC DELIMITED BY "," INTO WS-U1 WS-U2.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /val \(_parts, _delims, _newPtr, _overflow\) = CobolUnstring\.unstring/);
  assert.doesNotMatch(code, /if _overflow then/);
});
