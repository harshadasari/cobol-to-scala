/**
 * tests/round29-fixes.test.js
 *
 * Focused unit tests for round-29 adversarial-refutation findings - see
 * tests/oracle/README.md's round-29 table for the full write-up and the
 * ee09/ee10/ee13 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs, matching cobc byte-for-byte for ee09/ee10; ee13 is
 * a deliberate, documented `t.todo(...)` - see finding 3's own describe
 * block below and the README's Known Gaps entry).
 *
 * This file covers only the 3 findings owned by this fix agent (ee09, ee10,
 * ee13). A parallel workstream's own round-29 COMP-1/COMP-2 float-codec
 * findings (ee01-ee08, ee11, ee12) may add further `describe` blocks to
 * this SAME file - nothing below should be read as covering those.
 *
 *   1. (ee09) EXIT SECTION (and, latently, EXIT PARAGRAPH) inside a
 *      RECURSIVE program's own nested-local-def paragraph
 *      (generateProgramFlowLinesNested/renderNestedFallthroughDefs) cascaded
 *      WAY too far - a bare `return`, correct for the ordinary (non-
 *      recursive) convention's own separate top-level methods, instead
 *      skipped every paragraph chained after the current one (fall-through
 *      is appended INSIDE each paragraph's own nested def), all the way past
 *      the true end of the RECURSIVE program's own flow.
 *   2. (ee10) A bare out-of-line PERFORM to a paragraph inside a RECURSIVE
 *      program incorrectly auto-cascaded into whatever paragraph comes
 *      "after" it, even when reached via an explicit, deliberate PERFORM -
 *      the single nested-def-per-paragraph convention baked BOTH "natural
 *      fall-through" and "an out-of-line call target" into the same def.
 *   3. (ee13) ALTER (`ALTER <para> TO [PROCEED TO] <target>.`) - confirmed
 *      nowhere in this parser/generator at all - corrupted the surrounding
 *      parse (a phantom duplicate paragraph, named after the ALTER clause's
 *      own target, silently swallowing the CURRENT paragraph's own trailing
 *      statements) instead of degrading to a clean, visible decline.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala, parseCobol } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1 (ee09): RECURSIVE program's own nested-def paragraphs use
// scala.util.boundary/throw instead of a cascading bare `return` for EXIT
// SECTION/EXIT PARAGRAPH.
// ---------------------------------------------------------------------------

describe('round-29 finding 1 (ee09): EXIT SECTION/EXIT PARAGRAPH no longer cascade past a RECURSIVE program\'s own nested-def paragraphs', () => {
  const recursiveSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T29SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       SECTION-A SECTION.
       PARA-A1.
           DISPLAY "A1" LS-DEPTH.
           IF LS-DEPTH = 1
               EXIT SECTION
           END-IF.
           DISPLAY "A1-TAIL" LS-DEPTH.
       PARA-A2.
           DISPLAY "A2" LS-DEPTH.
       SECTION-B SECTION.
       PARA-B1.
           DISPLAY "B1" LS-DEPTH.
           GOBACK.
`;
  const scala = scalaOf(recursiveSrc, { emitEntryPoint: true });

  test('EXIT SECTION becomes `throw CobolExitSectionSignal`, not a bare `return`, inside entry()', () => {
    const entryIdx = scala.indexOf('def entry(');
    assert.ok(entryIdx >= 0, 'entry() must exist');
    const entryBody = scala.slice(entryIdx);
    assert.match(entryBody, /throw CobolExitSectionSignal \/\/ EXIT SECTION/);
    assert.doesNotMatch(entryBody, /return \/\/ EXIT SECTION/);
  });

  test('a shared CobolExitSectionSignal object is emitted for the RECURSIVE program', () => {
    assert.match(scala, /private object CobolExitSectionSignal extends RuntimeException/);
  });

  test('the cross-SECTION fall-through call is wrapped in try/catch, resuming at the next SECTION on EXIT SECTION', () => {
    const entryIdx = scala.indexOf('def entry(');
    const entryBody = scala.slice(entryIdx);
    assert.match(entryBody, /catch\s+case CobolExitSectionSignal =>/);
  });

  test('regression: EXIT PARAGRAPH inside a RECURSIVE nested-def paragraph uses scala.util.boundary.break(), matching the pre-existing EXIT PERFORM precedent', () => {
    const exitParaSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T29PARA RECURSIVE.
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       PARA-ONE.
           DISPLAY "ONE" LS-DEPTH.
           IF LS-DEPTH = 1
               EXIT PARAGRAPH
           END-IF.
           DISPLAY "ONE-TAIL" LS-DEPTH.
       PARA-TWO.
           DISPLAY "TWO" LS-DEPTH.
           GOBACK.
`;
    const paraScala = scalaOf(exitParaSrc, { emitEntryPoint: true });
    const entryIdx = paraScala.indexOf('def entry(');
    const entryBody = paraScala.slice(entryIdx);
    assert.match(entryBody, /scala\.util\.boundary \{/);
    assert.match(entryBody, /scala\.util\.boundary\.break\(\) \/\/ EXIT PARAGRAPH/);
    // round-29 REGRESSION fix (dd05-goto-depending-recursive.cbl): the
    // separate `_stepN` wrapper chain this test originally asserted was
    // itself the root cause of a later regression (GO TO DEPENDING ON
    // followed by a fallback statement spuriously double-cascaded) - see
    // method-gen.js's renderNestedFallthroughDefs doc comment. It has been
    // replaced by a `_chain: Boolean = false` parameter directly on each
    // paragraph's own flat def: paraOne()'s own boundary must wrap ONLY its
    // original statements, with the gated fall-through call to paraTwo()
    // OUTSIDE that boundary (still correctly skipped whenever EXIT PARAGRAPH
    // actually broke out of the boundary, and still firing normally
    // otherwise) - and the program's true entry point now calls paraOne()
    // directly with `_chain = true` (renderSectionAwareEntryCall), with no
    // `_stepN` involved at all.
    assert.match(entryBody, /def paraOne\(_chain: Boolean = false\): Unit =\s+scala\.util\.boundary \{[\s\S]*?\}\s+if _chain then\s+paraTwo\(_chain = true\) \/\/ implicit fall-through/);
    assert.match(entryBody, /paraOne\(_chain = true\)\s*\n?end /);
  });

  test('regression: the ordinary (non-recursive) convention is completely unchanged - still a bare `return`', () => {
    const nonRecursiveSrc = recursiveSrc.replace('T29SUB RECURSIVE', 'T29SUB');
    const nrScala = scalaOf(nonRecursiveSrc, { emitEntryPoint: false });
    assert.match(nrScala, /return \/\/ EXIT SECTION/);
    assert.doesNotMatch(nrScala, /CobolExitSectionSignal/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (ee10): an explicit out-of-line PERFORM to a RECURSIVE program's
// own nested-def paragraph is a genuine call-and-return - natural
// fall-through is modeled by a separate _stepN chain instead.
// ---------------------------------------------------------------------------

describe('round-29 finding 2 (ee10): explicit out-of-line PERFORM into a RECURSIVE program no longer auto-cascades', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T29PC RECURSIVE.
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-SECTION SECTION.
       MAIN-START.
           PERFORM COMMON-PARA OF SECTION-ONE.
           PERFORM COMMON-PARA OF SECTION-TWO.
           GOBACK.
       SECTION-ONE SECTION.
       COMMON-PARA.
           DISPLAY "IN-ONE" LS-DEPTH.
       SECTION-TWO SECTION.
       COMMON-PARA.
           DISPLAY "IN-TWO" LS-DEPTH.
`;
  const scala = scalaOf(src, { emitEntryPoint: true });

  test('SECTION-ONE\'s own COMMON-PARA nested def has NO auto-chained call to SECTION-TWO\'s', () => {
    const entryIdx = scala.indexOf('def entry(');
    const entryBody = scala.slice(entryIdx);
    const oneIdx = entryBody.indexOf('def sectionOneCommonPara');
    const twoDeclIdx = entryBody.indexOf('def sectionTwoCommonPara');
    assert.ok(oneIdx >= 0 && twoDeclIdx >= 0, 'both qualified nested defs must exist');
    // The body of sectionOneCommonPara's own def (up to the next `def`) must
    // not itself call sectionTwoCommonPara() - that would be the round-29
    // finding 2 bug (auto-cascading into the other SECTION's own paragraph).
    const oneBody = entryBody.slice(oneIdx, twoDeclIdx);
    assert.doesNotMatch(oneBody, /sectionTwoCommonPara\(\)/);
  });

  test('the whole-program natural fall-through is modeled by a `_chain` parameter, entered with `_chain = true`', () => {
    // round-29 REGRESSION fix (dd05-goto-depending-recursive.cbl): the
    // original `_stepN` wrapper chain this test asserted was itself the root
    // cause of a later regression - see method-gen.js's
    // renderNestedFallthroughDefs doc comment for the replacement mechanism
    // (a `_chain: Boolean = false` parameter directly on each paragraph's own
    // flat def, gating its own appended fall-through tail call). The
    // program's true entry point now calls its first unit directly with
    // `_chain = true` (renderSectionAwareEntryCall) - no `_stepN` at all.
    const entryIdx = scala.indexOf('def entry(');
    const entryBody = scala.slice(entryIdx);
    assert.match(entryBody, /def mainStart\(_chain: Boolean = false\): Unit =/);
    assert.doesNotMatch(entryBody, /_step\d/);
    assert.match(entryBody, /mainStart\(_chain = true\)\s*\n?end /);
  });

  test('a qualified PERFORM call site still resolves to the correct (collision-safe) nested def', () => {
    assert.match(scala, /sectionOneCommonPara\(\)/);
    assert.match(scala, /sectionTwoCommonPara\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (ee13): ALTER no longer corrupts the surrounding parse.
// ---------------------------------------------------------------------------

describe('round-29 finding 3 (ee13): ALTER parses as its own statement instead of corrupting the surrounding parse', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T29ALTER.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-ALTER".
           ALTER JUMP-PARA TO PROCEED TO TARGET-TWO.
           PERFORM JUMP-PARA.
           DISPLAY "AFTER-PERFORM".
           STOP RUN.
       JUMP-PARA.
           GO TO TARGET-ONE.
       TARGET-ONE.
           DISPLAY "IN-TARGET-ONE".
       TARGET-TWO.
           DISPLAY "IN-TARGET-TWO".
`;

  test('the parse produces exactly the 4 real paragraphs, no phantom duplicate', () => {
    const ast = parseCobol(src);
    const names = ast.procedures.paragraphs.map((p) => p.name);
    assert.deepEqual(names, ['MAIN-PARA', 'JUMP-PARA', 'TARGET-ONE', 'TARGET-TWO']);
  });

  test('MAIN-PARA keeps its own full statement list (DISPLAY, ALTER, PERFORM, DISPLAY, STOP)', () => {
    const ast = parseCobol(src);
    const mainPara = ast.procedures.paragraphs.find((p) => p.name === 'MAIN-PARA');
    assert.equal(mainPara.statements.length, 5);
    assert.equal(mainPara.statements[1].type, 'UnknownStatement');
    assert.equal(mainPara.statements[1].keyword, 'ALTER');
  });

  test('TARGET-TWO keeps its own single real statement (not swallowed/duplicated)', () => {
    const ast = parseCobol(src);
    const targetTwos = ast.procedures.paragraphs.filter((p) => p.name === 'TARGET-TWO');
    assert.equal(targetTwos.length, 1, 'TARGET-TWO must appear exactly once');
    assert.equal(targetTwos[0].statements.length, 1);
    assert.equal(targetTwos[0].statements[0].type, 'DisplayStatement');
  });

  test('the generated Scala compiles cleanly (no duplicate method definition) and declines ALTER visibly', () => {
    const scala = scalaOf(src, { emitEntryPoint: false });
    const occurrences = scala.match(/def targetTwo\(\): Unit =/g) || [];
    assert.equal(occurrences.length, 1, 'targetTwo() must be generated exactly once, not duplicated');
    assert.match(scala, /\?\?\? TODO: unsupported statement type/);
  });
});

/**
 * The 5 findings below (ee01, ee02, ee04, ee06, ee07) are owned by the
 * PARALLEL COMP-1/COMP-2 (IEEE-754 float) fix workstream referenced in this
 * file's own header comment - nothing above this point is touched or
 * duplicated; these `describe` blocks are a pure addition.
 *
 *   4. (ee01/ee02) A group-level VALUE clause byte-sliced onto a COMP-1/
 *      COMP-2 child fell all the way through defaultElementaryValueWithInheritance's
 *      `isNonDisplay` check (which omitted COMP-1/COMP-2 entirely) to the
 *      final plain-digit-text branch, silently defaulting to 0.0/0.0f
 *      instead of decoding the sliced bytes as a real IEEE-754 float/double
 *      (round-28's floatDecode/doubleDecode) - the same byte-reinterpretation
 *      convention already correct for a COMP-3/BINARY child (round-9).
 *   5. (ee04) An elementary REDEFINES pairing a COMP-1 (float) item with a
 *      COMP int item sharing the same storage just aliased the redefining
 *      item directly to the target's own current value under the WRONG
 *      type, with zero byte reinterpretation - now routes through real
 *      byte encode/decode (classifyCodec/encodeFieldExpr/decodeFieldExpr),
 *      mirroring flattenRedefinesLeavesBytes/byteLeafOp's own byte-accurate
 *      group-REDEFINES model.
 *   6. (ee07) `CobolFmt.floatDisplay` takes a `Double` parameter, so a
 *      `Float` (COMP-1) implicitly widened before formatting, introducing
 *      spurious extra precision digits (`1E+30` became
 *      `1.0000000150474662E30`) - COMP-1 now gets its own genuine-Float
 *      `floatDisplaySingle` path; COMP-2 keeps `floatDisplay` (Double)
 *      unchanged, now ALSO capped at cobc's own real 16-significant-digit
 *      DISPLAY convention for a non-terminating quotient (ee06's own DIVIDE
 *      probe - compiler-verified against installed GnuCOBOL: 100.0/3.0 ->
 *      "33.33333333333333", not Scala's 17-digit "33.333333333333336").
 *   7. (ee06) MOST SERIOUS - RELATIVE-file storage was built on
 *      `scala.io.Source...getLines()`/`PrintWriter.println` (one text LINE
 *      per record, `\n`-delimited) - fundamentally unsafe for ANY binary-
 *      encoded field whose byte pattern happens to contain a raw 0x0A byte
 *      (an entirely ordinary occurrence, not an error condition). Fixed at
 *      the root for a RELATIVE-organization file with a determinable fixed
 *      record byte width: OPEN/CLOSE (file-io-gen.js) and WRITE/REWRITE/
 *      DELETE's auto-extend gap-fill (expression-gen.js) now read/write raw,
 *      undelimited fixed-width byte chunks instead - see
 *      relativeRecordLengthFor's own doc comment (both files) for the full
 *      architecture and tests/oracle/README.md's round-29 entry for the
 *      real-vs-narrower-fix tradeoff analysis.
 */

// ---------------------------------------------------------------------------
// Finding 4 (ee01/ee02): group-level VALUE clause byte-sliced onto a
// COMP-1/COMP-2 child now decodes real IEEE-754 bytes.
// ---------------------------------------------------------------------------

describe('round-29 finding 4 (ee01/ee02): group VALUE clause byte-sliced onto a COMP-1/COMP-2 child decodes real IEEE-754 bytes', () => {
  test('ee01: a COMP-1 (Float) child inheriting a group VALUE clause decodes the sliced bytes via floatDecode, not a 0.0f fallback', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE01T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP VALUE "AB1234CD".
           05  WS-PREFIX   PIC XX.
           05  WS-FLOAT    COMP-1.
           05  WS-SUFFIX   PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-FLOAT.
`;
    const scala = scalaOf(src);
    // floatDecode(bytes of "1234") = 1.6688933612840628e-7 - compiler-
    // verified against installed GnuCOBOL (ee01's own oracle: "1.6688934E-7").
    assert.match(scala, /var wsFloat: Float = 1\.6688933612840628e-7f/);
    assert.doesNotMatch(scala, /var wsFloat: Float = 0\.0f/);
  });

  test('ee02: a COMP-2 (Double) child inheriting a group VALUE clause decodes the sliced bytes via doubleDecode, not a 0.0 fallback', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE02T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP VALUE "AB12345678CD".
           05  WS-PREFIX   PIC XX.
           05  WS-DBL      COMP-2.
           05  WS-SUFFIX   PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-DBL.
`;
    const scala = scalaOf(src);
    // doubleDecode(bytes of "12345678") = 6.821320051701325e-38 - compiler-
    // verified against installed GnuCOBOL (ee02's own oracle:
    // "6.821320051701325E-38").
    assert.match(scala, /var wsDbl: Double = 6\.821320051701325e-38d/);
    assert.doesNotMatch(scala, /var wsDbl: Double = 0\.0d?\b/);
  });

  test('regression: a COMP-3 child inheriting a group VALUE clause still decodes via the pre-existing packed-decimal path (round-9), unaffected', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE01REG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP VALUE "AB1234CD".
           05  WS-PREFIX   PIC XX.
           05  WS-AMT      PIC 9(4) COMP-3.
           05  WS-SUFFIX   PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-AMT.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var wsAmt: (Int|Long|BigDecimal) = /);
  });
});

// ---------------------------------------------------------------------------
// Finding 5 (ee04): elementary REDEFINES between a COMP-1 and a COMP int
// routes through real byte encode/decode instead of a bare type alias.
// ---------------------------------------------------------------------------

describe('round-29 finding 5 (ee04): elementary REDEFINES between COMP-1 and a COMP int byte-reinterprets instead of aliasing', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE04T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-INT      PIC S9(9) COMP VALUE 1078530011.
       01  WS-FLOAT    REDEFINES WS-INT COMP-1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-FLOAT.
           MOVE 3.5 TO WS-FLOAT.
           DISPLAY WS-INT.
`;
  const scala = scalaOf(src);

  test('the getter decodes wsInt\'s own bytes as a real Float (CobolCodecs.floatDecode of its binary encoding), not a bare `= wsInt` alias', () => {
    assert.match(scala, /def wsFloat: Float = CobolCodecs\.floatDecode\(CobolCodecs\.binaryEncode\(wsInt\.toLong, 4, endianness = "BIG"\)\)/);
    assert.doesNotMatch(scala, /def wsFloat: Float = wsInt/);
  });

  test('the setter encodes the assigned Float back to bytes and decodes THOSE as wsInt\'s own binary-int type, not a bare `wsInt = v` alias', () => {
    assert.match(scala, /def wsFloat_=\(v: Float\): Unit = wsInt = CobolCodecs\.binaryDecode\(CobolCodecs\.floatEncode\(v\), endianness = "BIG"\)\.toInt/);
    assert.doesNotMatch(scala, /def wsFloat_=\(v: Float\): Unit = wsInt = v/);
  });

  test('regression: an elementary REDEFINES where NEITHER side is COMP-1/COMP-2 still uses the plain alias (unaffected)', () => {
    const plainSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE04REG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC S9(9) COMP VALUE 0.
       01  WS-B REDEFINES WS-A PIC S9(9) COMP.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-B.
`;
    const plainScala = scalaOf(plainSrc);
    assert.match(plainScala, /def wsB: Int = wsA/);
    assert.match(plainScala, /def wsB_=\(v: Int\): Unit = wsA = v/);
  });
});

// ---------------------------------------------------------------------------
// Finding 6 (ee07): COMP-1 gets its own genuine-Float floatDisplaySingle;
// COMP-2's floatDisplay also caps at 16 significant digits (ee06).
// ---------------------------------------------------------------------------

describe('round-29 finding 6 (ee07/ee06): CobolFmt.floatDisplaySingle for COMP-1, 16-sig-digit-capped floatDisplay for COMP-2', () => {
  test('ee07: a COMP-1 field DISPLAYs through CobolFmt.floatDisplaySingle, not CobolFmt.floatDisplay', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE07T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-F COMP-1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-F.
`;
    const scala = scalaOf(src);
    assert.match(scala, /CobolFmt\.floatDisplaySingle\(wsF\)/);
    assert.doesNotMatch(scala, /CobolFmt\.floatDisplay\(wsF\)/);
  });

  test('ee06: a COMP-2 field still DISPLAYs through CobolFmt.floatDisplay (unaffected dispatch), which itself now truncates to 16 significant digits', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE06T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-D COMP-2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-D.
`;
    const scala = scalaOf(src);
    assert.match(scala, /CobolFmt\.floatDisplay\(wsD\)/);
    assert.doesNotMatch(scala, /CobolFmt\.floatDisplaySingle\(wsD\)/);
    // The embedded runtime's floatDisplay itself must route through the new
    // 16-significant-digit truncation helper (round-DOWN MathContext, never
    // rounding UP - see truncateSignificantDigits's own doc comment) instead
    // of calling v.toString directly.
    assert.match(scala, /def floatDisplay\(v: Double\): String = formatFloatText\(truncateSignificantDigits\(v, 16\)\.toString\)/);
    assert.match(scala, /def floatDisplaySingle\(v: Float\): String = formatFloatText\(v\.toString\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 7 (ee06) - MOST SERIOUS: RELATIVE-file storage is fixed-length
// byte records, not newline-delimited text.
// ---------------------------------------------------------------------------

describe('round-29 finding 7 (ee06): RELATIVE-file storage reads/writes raw fixed-width byte chunks, not newline-delimited lines', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE06T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "EE06TFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID       PIC 9(3).
           05  REC-A        COMP-2.
       WORKING-STORAGE SECTION.
       01  WS-RKEY        PIC 9(3) VALUE 0.
       01  WS-STATUS      PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 3.25 TO REC-A.
           WRITE REL-REC.
           CLOSE REL-FILE.
           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY REC-A.
           CLOSE REL-FILE.
`;
  const scala = scalaOf(src);

  test('OPEN INPUT reads the whole file as raw bytes and chunks it by the FD record\'s own fixed byte width (11: 3-digit ID + 8-byte COMP-2), not getLines()', () => {
    assert.match(scala, /val _relFileRelBytes = java\.nio\.file\.Files\.readAllBytes\(relFileFile\.toPath\)/);
    assert.match(scala, /val _relFileRelText = new String\(_relFileRelBytes, java\.nio\.charset\.StandardCharsets\.ISO_8859_1\)/);
    assert.match(scala, /val _relFileRelCount = _relFileRelText\.length \/ 11/);
    assert.doesNotMatch(scala, /relFileReader\.getLines\(\)/);
  });

  test('a plain SEQUENTIAL-access WRITE to this file writes the exact fixed-width record via .print with NO trailing newline', () => {
    assert.match(scala, /relFileWriter\.print\(/);
    assert.doesNotMatch(scala, /relFileWriter\.println/);
    assert.doesNotMatch(scala, /relFileWriter\.print\(.*\); relFileWriter\.print\("\\\\n"\)/);
  });

  test('regression: a LINE-SEQUENTIAL/plain (non-RELATIVE) file keeps the pre-existing getLines()/println text-line model unchanged', () => {
    const lineSeqSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE06REG.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT TXT-FILE ASSIGN TO "EE06REGFILE.DAT".
       DATA DIVISION.
       FILE SECTION.
       FD  TXT-FILE.
       01  TXT-REC PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT TXT-FILE.
           MOVE "HELLO" TO TXT-REC.
           WRITE TXT-REC.
           CLOSE TXT-FILE.
           OPEN INPUT TXT-FILE.
           READ TXT-FILE.
           CLOSE TXT-FILE.
`;
    const lineSeqScala = scalaOf(lineSeqSrc);
    assert.match(lineSeqScala, /txtFileIterator = txtFileReader\.getLines\(\)/);
    assert.match(lineSeqScala, /txtFileWriter\.println/);
    assert.doesNotMatch(lineSeqScala, /readAllBytes/);
  });

  // round-29 finding 5 safety-guard regression test: caught (and fixed) DURING
  // this round's own testing - itemByteLength's own occursCount helper always
  // uses an OCCURS ... DEPENDING ON item's MAXIMUM count (so BYTE-LEVEL LAYOUT
  // offsets stay fixed), so a naive "does itemByteLength return > 0" check
  // would have wrongly treated an ODO record as having a determinable UNIFORM
  // fixed width - but a real ODO record's own WRITE (odoDisplayValueExpr,
  // round-10 finding 4) writes a VARIABLE-length concatenation driven by the
  // field's own LIVE counter, not always the maximum, which would silently
  // misalign the new fixed-width byte-chunking model (dd11/ee12's own shape -
  // both combine OCCURS DEPENDING ON with RELATIVE organization) the instant a
  // live count differs from the max. `hasOccursDependingOn` (scala-generator.js)
  // guards against this at any nesting depth.
  test('regression: a RELATIVE-organization file whose FD record contains an OCCURS ... DEPENDING ON child keeps the pre-existing getLines()/println text-line model (NOT the fixed-width one)', () => {
    const odoSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE06ODOGUARD.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT ODO-FILE ASSIGN TO "EE06ODOFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  ODO-FILE.
       01  ODO-REC.
           05  REC-CNT      PIC 9(2).
           05  REC-ITEM     PIC X(3) OCCURS 1 TO 5 TIMES DEPENDING ON REC-CNT.
       WORKING-STORAGE SECTION.
       01  WS-RKEY        PIC 9(3) VALUE 0.
       01  WS-STATUS      PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT ODO-FILE.
           READ ODO-FILE.
           CLOSE ODO-FILE.
`;
    const odoScala = scalaOf(odoSrc);
    assert.match(odoScala, /odoFileIterator = odoFileReader\.getLines\(\)/);
    assert.doesNotMatch(odoScala, /readAllBytes/);
  });
});
