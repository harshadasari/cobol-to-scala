/**
 * tests/round5-fixes.test.js
 *
 * Focused unit tests for the round-5 adversarial-refutation findings (6
 * dishonest divergences: FILE I/O, PERFORM THRU section-collision, DISPLAY of
 * a bare group, INITIALIZE, ACCEPT FROM DATE/TIME/DAY/DAY-OF-WEEK, and MOVE
 * from a numeric-edited source into a numeric target) - see
 * tests/oracle/README.md for the full end-to-end (cobc-vs-generated-Scala)
 * verification the promoted tests/corpus/proc/s*.cbl programs provide via the
 * data-driven oracle suite. This file targets the individual generator/parser
 * mechanisms each finding traces to, in isolation (no cobc/scala-cli needed),
 * so a regression is caught at the unit level even on a machine without the
 * compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala, parseCobol } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: FILE I/O - ENVIRONMENT DIVISION wiring, record-name/file-name
// registry, and OPEN OUTPUT-then-INPUT var reuse.
// ---------------------------------------------------------------------------

const FILE_IO_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "out.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(20).
       WORKING-STORAGE SECTION.
       01  WS-LINE             PIC X(20).
       01  WS-EOF-FLAG         PIC X(1) VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE "HELLO" TO OUT-REC.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           OPEN INPUT OUT-FILE.
           READ OUT-FILE INTO WS-LINE
               AT END MOVE 'Y' TO WS-EOF-FLAG
           END-READ.
           CLOSE OUT-FILE.
           STOP RUN.
`;

test('Finding 1a: parseCobol wires up the ENVIRONMENT DIVISION (FILE-CONTROL reaches the AST)', () => {
  const ast = parseCobol(FILE_IO_SOURCE);
  assert.ok(ast.environmentDivision, 'parseCobol() result must carry environmentDivision');
  assert.equal(ast.environmentDivision.fileControls.length, 1);
  assert.equal(ast.environmentDivision.fileControls[0].fileName, 'OUT-FILE');
  assert.equal(ast.environmentDivision.fileControls[0].assignTo, 'out.dat');
});

test('Finding 1b: WRITE of a record whose name differs from its FD file name uses the FILE-keyed writer', () => {
  const code = scalaOf(FILE_IO_SOURCE);
  // OPEN OUTPUT OUT-FILE must declare/assign an outFileWriter (file-keyed).
  assert.match(code, /outFileWriter = new java\.io\.PrintWriter/);
  // WRITE OUT-REC must print through THAT SAME file-keyed writer, not a
  // nonexistent "outRecWriter" (record-keyed).
  assert.match(code, /outFileWriter\.println/);
  assert.doesNotMatch(code, /outRecWriter/);
});

test('Finding 1c: OPEN OUTPUT then OPEN INPUT of the same file never redeclares its File/reader/writer as `val`', () => {
  const code = scalaOf(FILE_IO_SOURCE);
  // File handles must be declared exactly once, as `var`s, at object scope.
  const fileDecls = code.match(/var outFileFile: java\.io\.File/g) || [];
  assert.equal(fileDecls.length, 1, 'outFileFile must be declared exactly once');
  // Neither OPEN should re-declare it with `val` inside the method body.
  assert.doesNotMatch(code, /val outFileFile = /);
  assert.doesNotMatch(code, /val outFileReader = /);
  assert.doesNotMatch(code, /val outFileWriter = /);
  // Both OPENs must assign (not declare) the shared File handle.
  const assigns = code.match(/ {4}outFileFile = new java\.io\.File\(outFilePath\)/g) || [];
  assert.equal(assigns.length, 2, 'both OPEN OUTPUT and OPEN INPUT must assign the pre-declared var');
});

test('Finding 1: READ ... INTO pads the physical line back out to the target field\'s declared width', () => {
  const code = scalaOf(FILE_IO_SOURCE);
  assert.match(code, /wsLine = CobolFmt\.fitLeft\(_record, 20\)/);
});

// ---------------------------------------------------------------------------
// Finding 2: PERFORM ... THRU spanning multiple SECTIONs, where two
// paragraphs in the range share a bare (post-numeric-prefix-strip) name.
// ---------------------------------------------------------------------------

test('Finding 2: PERFORM ... THRU across sections qualifies colliding nested-def names instead of duplicating them', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(1).
       PROCEDURE DIVISION.
       0000-ENTRY.
           PERFORM 1000-PARA-A THRU 2000-PARA-A
           STOP RUN.
       1000-SECTION-A SECTION.
       1000-PARA-A.
           DISPLAY '1000-A'.
       2000-SECTION-B SECTION.
       2000-PARA-A.
           DISPLAY '2000-A'.
`;
  const code = scalaOf(source);
  // The wrapper method itself must exist.
  assert.match(code, /def paraAToParaA\(\): Unit =/);
  // It must NOT declare "paraA" twice as a nested local def (the pre-fix
  // bug: both 1000-PARA-A and 2000-PARA-A stripped to the same bare name).
  const nestedParaA = code.match(/^ {4}def paraA\(\): Unit =/gm) || [];
  assert.equal(nestedParaA.length, 0, `expected no unqualified nested paraA inside the THRU wrapper, found:\n${code}`);
  // Each colliding paragraph gets its own section-qualified nested def.
  assert.match(code, /def sectionAParaA\(\): Unit =/);
  assert.match(code, /def sectionBParaA\(\): Unit =/);
});

// ---------------------------------------------------------------------------
// Finding 3: DISPLAY of a bare GROUP identifier.
// ---------------------------------------------------------------------------

test('Finding 3: DISPLAY of a bare group concatenates its children\'s fixed-width display forms', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-TAG          PIC X(3) VALUE "ABC".
           05  WS-NUM          PIC 9(3) VALUE 42.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-GROUP.
           STOP RUN.
`;
  const code = scalaOf(source);
  // No reference to a nonexistent flat "wsGroup" var.
  assert.doesNotMatch(code, /println\(wsGroup\)/);
  // The alphanumeric child is fitted to its own width, the numeric child
  // renders its own zero-padded digit text, concatenated together.
  assert.match(code, /CobolFmt\.fitLeft\(wsTag, 3\)/);
  assert.match(code, /CobolFmt\.digitsOf\(BigDecimal\(wsNum\), 3, 0\)/);
});

// ---------------------------------------------------------------------------
// Finding 4: INITIALIZE - per-category defaults, REPLACING, FILLER untouched.
// ---------------------------------------------------------------------------

test('Finding 4: INITIALIZE on an elementary item never emits `.copy()`', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NUM              PIC 9(3) VALUE 42.
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-NUM.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /\.copy\(\)/);
  assert.match(code, /wsNum = 0/);
});

test('Finding 4: INITIALIZE on a GROUP sets alphanumeric children to spaces and numeric children to zero', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-NAME         PIC X(5) VALUE "NAMEX".
           05  FILLER          PIC X(2) VALUE "ZZ".
           05  WS-AMOUNT       PIC 9(4) VALUE 9999.
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-GROUP.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsName = "\s*"/);
  assert.match(code, /wsAmount = 0/);
  // FILLER has no COBOL name to assign through - it must never appear as an
  // assignment target.
  assert.doesNotMatch(code, /_filler\d+ = /);
});

test('Finding 4: INITIALIZE ... REPLACING only touches the matching category, leaving the rest untouched', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-NAME         PIC X(5) VALUE "NAMEX".
           05  WS-AMOUNT       PIC 9(4) VALUE 9999.
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-GROUP REPLACING ALPHANUMERIC DATA BY "Q".
           STOP RUN.
`;
  const code = scalaOf(source);
  // WS-NAME (ALPHANUMERIC) is set via the REPLACING value, fitted to width.
  assert.match(code, /wsName = "Q\s*"/);
  // WS-AMOUNT (NUMERIC, no matching REPLACING category) must be left
  // completely untouched by the INITIALIZE statement's own generated body -
  // no assignment line for it at all there (verified against installed
  // GnuCOBOL: it keeps its own VALUE-clause value, not reset to zero). It
  // legitimately does appear once, earlier, in its own `var wsAmount: Int =
  // 9999` WORKING-STORAGE declaration - only the mainPara() method body is
  // checked here.
  const bodyMatch = code.match(/def mainPara\(\): Unit =([\s\S]*?)\n\s*@main/);
  assert.ok(bodyMatch, 'expected to find mainPara() method body');
  assert.doesNotMatch(bodyMatch[1], /wsAmount = /);
});

// ---------------------------------------------------------------------------
// Finding 5: ACCEPT FROM DATE/TIME/DAY/DAY-OF-WEEK.
// ---------------------------------------------------------------------------

test('Finding 5: ACCEPT FROM DAY-OF-WEEK assigns the target\'s real registered var, not a shadowing val', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DOW              PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           ACCEPT WS-DOW FROM DAY-OF-WEEK.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /val wsDow = /);
  // Numeric target: coerced through CobolFmt.truncNumeric + BigDecimal(...),
  // not left as raw/untyped date text.
  assert.match(code, /wsDow = CobolFmt\.truncNumeric\(BigDecimal\(java\.time\.LocalDate\.now\.getDayOfWeek\.getValue\.toString\), 1, 0\)\.toInt/);
});

// ---------------------------------------------------------------------------
// Finding 6: MOVE from a numeric-edited source into a numeric target.
// ---------------------------------------------------------------------------

test('Finding 6: MOVE from a numeric-edited source to a numeric target de-edits via CobolFmt.numval', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-EDITED           PIC ZZ9.99 VALUE 12.50.
       01  WS-PLAIN            PIC S9(5)V99 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-EDITED TO WS-PLAIN.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /CobolFmt\.numval\(wsEdited\)/);
  assert.doesNotMatch(code, /BigDecimal\(wsEdited\)/);
});
