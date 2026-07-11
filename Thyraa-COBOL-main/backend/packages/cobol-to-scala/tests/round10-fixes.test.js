/**
 * tests/round10-fixes.test.js
 *
 * Focused unit tests for the round-10 adversarial-refutation findings (6
 * dishonest divergences fixed - DECLARATIVES/USE AFTER STANDARD ERROR
 * PROCEDURE completely unhandled, an OPEN failure crashing instead of
 * setting FILE STATUS, WRITE/READ using two incompatible byte models for a
 * non-DISPLAY (COMP-3/binary) record, WRITE of an OCCURS ... DEPENDING ON
 * record falling back to a nonexistent bare var, ADD/SUBTRACT CORRESPONDING
 * ROUNDED never parsed, and multi-target COMPUTE's inverted break silently
 * dropping every target after the first) - see tests/oracle/README.md for
 * the full end-to-end (cobc-vs-generated-Scala) verification the promoted
 * tests/corpus/proc/x*.cbl programs provide via the data-driven oracle
 * suite. This file targets the individual generator/parser mechanisms each
 * finding traces to, in isolation (no cobc/scala-cli needed), so a
 * regression is caught at the unit level even on a machine without the
 * compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { parseProcedureDivision } from '../parser/procedure-parser.js';
import { tokenize } from '../parser/lexer.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: DECLARATIVES ... END DECLARATIVES had zero parser handling at
// all - the whole block (including its USE statement) was absorbed as an
// ordinary section, which meant its paragraph(s) ran unconditionally at
// program start (before MAIN-PARA) instead of only on a file-operation
// failure. Fixed by parseDeclaratives (a dedicated pre-pass immediately
// after PROCEDURE DIVISION's own USING/RETURNING) collecting every
// DECLARATIVES SECTION into division.declaratives (NOT division.sections),
// each with its own parsed useClause; the generator wires a `USE AFTER
// [STANDARD] ERROR PROCEDURE ON <file-name>` target into
// file-io-gen.js's/expression-gen.js's file-operation failure paths.
// ---------------------------------------------------------------------------

const DECLARATIVES_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. DECL1.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "NOSUCHFILE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD IN-FILE.
       01 IN-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON IN-FILE.
       ERR-PARA.
           DISPLAY "ERROR HANDLER FIRED STATUS=" WS-STATUS.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN INPUT IN-FILE.
           DISPLAY "AFTER OPEN STATUS=" WS-STATUS.
           STOP RUN.
`;

test('Finding 1a: DECLARATIVES parses into division.declaratives (not division.sections/paragraphs), with its USE clause captured', () => {
  const tokens = tokenize(DECLARATIVES_SOURCE, {});
  const division = parseProcedureDivision(tokens);
  assert.equal(division.declaratives.length, 1, 'exactly one DECLARATIVES SECTION');
  const decl = division.declaratives[0];
  assert.equal(decl.name, 'ERR-SECTION');
  assert.deepEqual(decl.useClause, { kind: 'ERROR', after: true, targets: [{ kind: 'FILE', name: 'IN-FILE' }] });
  assert.equal(decl.paragraphs.length, 1);
  assert.equal(decl.paragraphs[0].name, 'ERR-PARA');
  // The ordinary flow must start at MAIN-SECTION, never see ERR-SECTION/ERR-PARA.
  assert.equal(division.sections.length, 1);
  assert.equal(division.sections[0].name, 'MAIN-SECTION');
});

test('Finding 1b: the declarative handler method is generated but is never called unconditionally from the main program flow', () => {
  const code = scalaOf(DECLARATIVES_SOURCE);
  assert.match(code, /def errSection\(\): Unit =/, 'the DECLARATIVES section becomes its own callable method');
  assert.match(code, /def errPara\(\): Unit =/);
  const mainFlow = code.match(/@main def run\(\): Unit =[\s\S]*/)[0];
  assert.doesNotMatch(mainFlow, /errSection\(\)/, 'the @main entry point must not call the declarative handler directly - only a file-op failure path may');
});

test('Finding 1c: a registered USE AFTER ERROR PROCEDURE ON <file> handler is invoked from OPEN\'s catch block', () => {
  const code = scalaOf(DECLARATIVES_SOURCE);
  const openBlock = code.match(/try\n[\s\S]*?catch\n[\s\S]*?(?=\n\n|\n  def )/)[0];
  assert.match(openBlock, /case _: java\.io\.FileNotFoundException =>[\s\S]*?wsStatus = "35"[\s\S]*?errSection\(\)/,
    'the FileNotFoundException branch must set FILE STATUS to "35" AND invoke the declarative handler');
});

// ---------------------------------------------------------------------------
// Finding 2: an OPEN failure (missing file, bad path, ...) surfaced as a raw
// uncaught Java exception - no FILE STATUS mapping, a hard crash where cobc
// itself just sets FILE STATUS and continues. Fixed by wrapping every
// java.io-touching OPEN mode in try/catch: FileNotFoundException -> "35",
// any other IOException -> "30"; with no registered FILE STATUS field and no
// DECLARATIVES handler, the catch body is a bare `()` (matches cobc's own
// default OPEN-failure behavior of silently continuing).
// ---------------------------------------------------------------------------

const OPEN_FAILURE_STATUS_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. DECL2.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "NOSUCHFILE2.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD IN-FILE.
       01 IN-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT IN-FILE.
           DISPLAY "AFTER OPEN STATUS=" WS-STATUS.
           STOP RUN.
`;

test('Finding 2a: OPEN is wrapped in try/catch mapping FileNotFoundException -> "35" and any other IOException -> "30"', () => {
  const code = scalaOf(OPEN_FAILURE_STATUS_SOURCE);
  assert.match(code, /try\s*\n\s*inFileFile = new java\.io\.File/);
  assert.match(code, /case _: java\.io\.FileNotFoundException =>\s*\n\s*wsStatus = "35"/);
  assert.match(code, /case _: java\.io\.IOException =>\s*\n\s*wsStatus = "30"/);
});

test('Finding 2b regression guard: with no FILE STATUS clause and no DECLARATIVES handler, the catch body is a harmless no-op (never rethrows)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "NOSUCHFILE3.DAT" ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD IN-FILE.
       01 IN-REC PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT IN-FILE.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /case _: java\.io\.FileNotFoundException =>\s*\n\s*\(\)/);
  assert.match(code, /case _: java\.io\.IOException =>\s*\n\s*\(\)/);
});

// ---------------------------------------------------------------------------
// Finding 3: WRITE of a record with a non-DISPLAY (COMP-3/binary) child
// rendered its display-text digit representation (groupDisplayValueExpr),
// but READ of that same record decoded the bytes as real packed-decimal via
// the record's own case-class parse() - two incompatible byte models for
// the SAME record shape, guaranteed to crash/corrupt on any WRITE-then-READ
// round trip. Fixed by routing WRITE through the record's own byte-level
// format() (writeRecordPlan's 'bytes' mode) whenever any child is
// non-DISPLAY; a pure-DISPLAY record is completely unaffected (still the
// original text-concatenation + stripTrailing() path).
// ---------------------------------------------------------------------------

const COMP3_RECORD_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. FCOMP3C.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "FCOMP3C.DAT" ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD OUT-FILE RECORD CONTAINS 8 CHARACTERS.
       01 OUT-REC.
           05 OUT-AMT   PIC S9(5)V99 COMP-3.
           05 OUT-TAG   PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           WRITE OUT-REC.
           STOP RUN.
`;

test('Finding 3a: WRITE of a record containing a COMP-3 child routes through the record\'s own case-class format(), not display-text digitsOf', () => {
  const code = scalaOf(COMP3_RECORD_SOURCE);
  assert.match(code, /OutRec\.format\(OutRec\(outAmt, outTag\)\)/, 'must build the record and format() it byte-level');
  assert.doesNotMatch(code, /CobolFmt\.digitsOf\(BigDecimal\(outAmt\)/, 'must NOT render OUT-AMT as unsigned display-digit text (that is what silently corrupted x03)');
});

test('Finding 3b regression guard: a pure-DISPLAY record keeps the original text-concatenation + stripTrailing() WRITE path', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "T.DAT" ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD OUT-FILE.
       01 OUT-REC.
           05 OUT-A PIC X(4).
           05 OUT-B PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           WRITE OUT-REC.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /\.println\(\([\s\S]*?\)\.stripTrailing\(\)\)/, 'the plain-DISPLAY record must still use the println+stripTrailing text path');
  assert.doesNotMatch(code, /OutRec\.format\(OutRec/, 'must not be routed through the byte-level format() path at all');
});

// ---------------------------------------------------------------------------
// Finding 4: WRITE of a record with an OCCURS ... DEPENDING ON child bailed
// out of groupDisplayValueExpr entirely (an OCCURS child always short-
// circuits it to null), falling back to a nonexistent bare variable
// reference. Fixed by odoDisplayValueExpr: a DISPLAY-only ODO child now
// contributes exactly `<counter>`-many elements' worth of digit text (the
// table's LIVE runtime length), not the fixed max occurrence count.
// ---------------------------------------------------------------------------

const ODO_WRITE_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. ODOWRITE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "ODOWRITE.DAT" ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD OUT-FILE.
       01 OUT-REC.
           05 OUT-COUNT PIC 9(2).
           05 OUT-ITEM  OCCURS 1 TO 5 TIMES DEPENDING ON OUT-COUNT PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           WRITE OUT-REC.
           STOP RUN.
`;

test('Finding 4: WRITE of an ODO record concatenates exactly outCount-many elements (the live counter), never the fixed max occurrence count', () => {
  const code = scalaOf(ODO_WRITE_SOURCE);
  assert.match(code, /\(0 until \(outCount\)\.toInt\)\.map\(i => CobolFmt\.digitsOf\(BigDecimal\(outItem\(i\)\), 3, 0\)\)\.mkString/,
    'must drive the element count from the live outCount value, not a literal 5');
  assert.doesNotMatch(code, /\bWRITE OUT-REC\b.*nonexistent|\.println\(outRec\)/, 'must never fall back to a bare/nonexistent record var');
});

// ---------------------------------------------------------------------------
// Finding 5: ADD/SUBTRACT CORRESPONDING never consumed a trailing ROUNDED at
// all - it leaked out as a bogus separate UnknownStatement, and
// generateAddCorresponding/generateSubtractCorresponding always truncated
// regardless. Fixed by consuming ROUNDED right after the CORRESPONDING
// TO/FROM target in the parser, and honoring statement.rounded via the
// standard storeNumericByInfo rounding path in both generators.
// ---------------------------------------------------------------------------

const ADD_CORRESPONDING_ROUNDED_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. ADDCORRR2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC.
           05 WS-A PIC 9(3)V99 VALUE 0.06.
       01 WS-DST.
           05 WS-A PIC 9(3)V9 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD CORRESPONDING WS-SRC TO WS-DST ROUNDED.
           STOP RUN.
`;

test('Finding 5a: ADD CORRESPONDING ... ROUNDED parses into a single statement, not a leaked UnknownStatement', () => {
  const tokens = tokenize(ADD_CORRESPONDING_ROUNDED_SOURCE, {});
  const division = parseProcedureDivision(tokens);
  const stmts = division.paragraphs[0].statements;
  assert.equal(stmts.length, 2, 'ADD CORRESPONDING...ROUNDED (1) then STOP RUN (1) - no extra leaked statement');
  assert.equal(stmts[0].type, 'AddStatement');
  assert.equal(stmts[0].rounded, true);
});

test('Finding 5b: generateAddCorresponding honors ROUNDED via CobolFmt.roundNumeric (not truncNumeric)', () => {
  const code = scalaOf(ADD_CORRESPONDING_ROUNDED_SOURCE);
  // WS-A is ambiguous between WS-SRC and WS-DST, so both get parent-qualified
  // identifiers (wsDstWsA/wsSrcWsA) - see case-class-gen.js's resolveClassName-
  // style ambiguity qualification this generator applies to flat vars too.
  assert.match(code, /wsDstWsA = CobolFmt\.roundNumeric\(\(wsDstWsA \+ wsSrcWsA\), 3, 1\)/,
    'ADD CORRESPONDING ROUNDED must round (HALF_UP) to the target\'s own decimal digits, not truncate');
});

test('Finding 5c: SUBTRACT CORRESPONDING ... ROUNDED is parsed and honored the same way', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC.
           05 WS-A PIC 9(3)V99 VALUE 0.06.
       01 WS-DST.
           05 WS-A PIC 9(3)V9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           SUBTRACT CORRESPONDING WS-SRC FROM WS-DST ROUNDED.
           STOP RUN.
`;
  const tokens = tokenize(source, {});
  const division = parseProcedureDivision(tokens);
  assert.equal(division.paragraphs[0].statements[0].rounded, true);
  const code = scalaOf(source);
  assert.match(code, /CobolFmt\.roundNumeric\(/);
});

// ---------------------------------------------------------------------------
// Finding 6: parseComputeStatement's target-collection loop had an inverted
// break (`if (!ctx.check(TokenType.OP_EQUAL)) break;`) that fired after the
// very first target (since the second target's own name is itself an
// IDENTIFIER, not `=`), silently discarding every target after the first.
// Fixed by removing the stray break (the `while (ctx.check(IDENTIFIER))`
// condition alone already terminates correctly at `=`) and stashing ROUNDED
// on the individual target's own VariableReference node, so
// `COMPUTE A B ROUNDED C = expr` rounds only B.
// ---------------------------------------------------------------------------

const COMPUTE_MULTI_TARGET_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. COMPMULTI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(3)V99.
       01 WS-B PIC 9(3).
       01 WS-C PIC 9(3)V9.
       01 WS-X PIC 9(2) VALUE 7.
       01 WS-Y PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-A WS-B WS-C ROUNDED = WS-X * WS-Y + 1.055.
           STOP RUN.
`;

test('Finding 6a: COMPUTE with multiple targets collects ALL of them, not just the first', () => {
  const tokens = tokenize(COMPUTE_MULTI_TARGET_SOURCE, {});
  const division = parseProcedureDivision(tokens);
  const compute = division.paragraphs[0].statements[0];
  assert.equal(compute.type, 'ComputeStatement');
  assert.equal(compute.targets.length, 3, 'WS-A, WS-B, and WS-C must all be collected as targets');
  assert.equal(compute.targets[0].name, 'WS-A');
  assert.equal(compute.targets[1].name, 'WS-B');
  assert.equal(compute.targets[2].name, 'WS-C');
});

test('Finding 6b: ROUNDED applies only to the target it immediately follows, per-target', () => {
  const tokens = tokenize(COMPUTE_MULTI_TARGET_SOURCE, {});
  const division = parseProcedureDivision(tokens);
  const compute = division.paragraphs[0].statements[0];
  assert.ok(!compute.targets[0].rounded, 'WS-A has no ROUNDED of its own');
  assert.ok(!compute.targets[1].rounded, 'WS-B has no ROUNDED of its own');
  assert.equal(compute.targets[2].rounded, true, 'WS-C is immediately followed by ROUNDED');
});

test('Finding 6c: the generator assigns the expression to every target, rounding/truncating each independently', () => {
  const code = scalaOf(COMPUTE_MULTI_TARGET_SOURCE);
  assert.match(code, /wsA = CobolFmt\.truncNumeric\([\s\S]*?, 3, 2\)/, 'WS-A (unrounded) must truncate to its own 2 decimal digits');
  assert.match(code, /wsB = \(CobolFmt\.truncNumeric\([\s\S]*?, 3, 0\)\)\.toInt/, 'WS-B (unrounded, 0 decimals) must truncate');
  assert.match(code, /wsC = CobolFmt\.roundNumeric\([\s\S]*?, 3, 1\)/, 'WS-C (ROUNDED) must round HALF_UP to its own 1 decimal digit');
});
