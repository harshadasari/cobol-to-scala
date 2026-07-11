/**
 * tests/state-isolation.test.js
 *
 * Regression coverage for a cross-call state-leak bug found immediately after
 * round-13: several of this generator's registries (the name -> metadata maps
 * expression-gen.js/file-io-gen.js/method-gen.js consult while generating a
 * single program's Scala) are module-level `let`s, not per-call state. Every
 * one of them is *supposed* to be fully reinstalled (via its `set*` function)
 * at the top of every generateScala()/generateMultiProgramScala() call, so
 * that two unrelated convertToScala() calls in the same process never see
 * each other's data - this is exactly how the npm package is meant to be
 * used (convert many independent COBOL programs in one long-lived process).
 *
 * The round-13 DECLARATIVES two-pass fix (generateDeclarativeSupport in
 * generator/scala-generator.js) broke that invariant for one registry pair:
 * its no-DECLARATIVES early-return branch returned `{ fileHandlers: new
 * Map(), modeHandlers: new Map() }` to its *own* caller but never actually
 * called setDeclarativeHandlersExpr/FileIO with them - leaving whatever a
 * *previous* convertToScala() call had installed (DECL_FILE_HANDLERS/
 * DECL_MODE_HANDLERS) still active for the second program. A second,
 * unrelated bug of the identical shape was found in the same audit:
 * CALL_PROGRAM_REGISTRY (expression-gen.js) was only ever set/cleared by
 * generateMultiProgramScala around its own per-program loop - a plain
 * generateScala() call (the ordinary single-program path convertToScala uses
 * for any non-multi-PROGRAM-ID source) never touched it at all, so it could
 * leak a previous multi-program conversion's CALL wiring into a later,
 * unrelated single-program one (including if that prior call ever threw
 * partway through, skipping its own cleanup step).
 *
 * Both are now fixed:
 *   - generateDeclarativeSupport installs the (possibly empty)
 *     fileHandlers/modeHandlers registries on EVERY branch, no early return
 *     skips it.
 *   - CALL_PROGRAM_REGISTRY is threaded through generateScala's own options
 *     (`opts.callProgramRegistry`) and reinstalled unconditionally (defaulting
 *     to an empty Map) at the top of every generateScala() call, rather than
 *     left as ambient state only generateMultiProgramScala's loop manages.
 *   - method-gen.js's generateAllMethods had a smaller version of the same
 *     shape: its units.length===0 early return sat BEFORE
 *     setAmbiguousParagraphNamesForPerform, so an empty-PROCEDURE-DIVISION
 *     program wouldn't overwrite a previous program's ambiguous-paragraph-name
 *     set either. Fixed by moving the setter calls above that guard.
 *
 * Every other registry audited alongside these (FIELD_REGISTRY,
 * TABLE_REGISTRY, GROUP_REGISTRY, CONDITION_REGISTRY, QUALIFIED_REGISTRY,
 * SORT_FILE_REGISTRY, RECORD_FILE_REGISTRY/FILE_RECORD_REGISTRY,
 * ADVANCING_FILES, FILE_STATUS_REGISTRY, AMBIGUOUS_GROUP_CLASS_NAMES,
 * CALL_RET_SEQ, DECIMAL_POINT_IS_COMMA) was already installed unconditionally
 * at the top of generateScala on every call - this file adds a couple of
 * belt-and-suspenders checks for the two highest-traffic ones (FIELD_REGISTRY,
 * GROUP_REGISTRY/TABLE_REGISTRY) so a future regression there is caught too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, 'corpus', 'proc');

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function corpusSource(name) {
  return fs.readFileSync(path.join(CORPUS, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// DECL_FILE_HANDLERS/DECL_MODE_HANDLERS (expression-gen.js + file-io-gen.js)
// ---------------------------------------------------------------------------

const DECL_HANDLER_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. DECL1.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "NOSUCHFILE.DAT" ORGANIZATION IS LINE SEQUENTIAL FILE STATUS IS WS-STATUS.
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
           DISPLAY "ERR".
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN INPUT IN-FILE.
           STOP RUN.
`;

const NO_DECL_SOURCE = `       IDENTIFICATION DIVISION.
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

test('DECLARATIVES handler registry does not leak into a later, unrelated program with no DECLARATIVES at all', () => {
  const first = scalaOf(DECL_HANDLER_SOURCE);
  // Sanity: the handler-bearing program itself really does wire up the
  // declarative handler (otherwise this test would trivially "pass").
  assert.match(first, /errSection\(\)/, 'sanity: DECL1 itself must call its own declarative handler');

  const second = scalaOf(NO_DECL_SOURCE);
  assert.doesNotMatch(
    second,
    /errSection\(\)/,
    'BUG: program T (no DECLARATIVES at all) must never call errSection() - that method only exists in the previous, unrelated DECL1 program'
  );
});

test('DECLARATIVES handler registry leak is order-independent (also reset when the no-DECLARATIVES program runs first)', () => {
  // Run the pair the other way round too - a correct fix resets the registry
  // on every call, not just "whenever the previous call happened to have
  // DECLARATIVES" - so this ordering must also come out clean, and the
  // handler program run second must still see its own handler.
  const second = scalaOf(NO_DECL_SOURCE);
  assert.doesNotMatch(second, /errSection\(\)/);
  const first = scalaOf(DECL_HANDLER_SOURCE);
  assert.match(first, /errSection\(\)/, 'DECL1 must still wire up its own handler after an unrelated prior conversion');
});

// ---------------------------------------------------------------------------
// CALL_PROGRAM_REGISTRY (expression-gen.js)
// ---------------------------------------------------------------------------

const MULTI_PROGRAM_CALL_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. CALLER1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "ADDER" USING 1 2.
           STOP RUN.
       END PROGRAM CALLER1.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. ADDER.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-A PIC 9(4).
       01  LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A LK-B.
       SUB-MAIN.
           GOBACK.
       END PROGRAM ADDER.
`;

const UNRELATED_SINGLE_CALL_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. X.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "ADDER" USING 1 2.
           STOP RUN.
`;

test('CALL_PROGRAM_REGISTRY does not leak a previous multi-program conversion into a later, unrelated single-program CALL', () => {
  const multi = scalaOf(MULTI_PROGRAM_CALL_SOURCE);
  // Sanity: the multi-program source really does resolve the CALL to a real
  // entry() invocation (otherwise this test would trivially "pass").
  assert.match(multi, /Adder\.entry\(/, 'sanity: CALLER1 must resolve its sibling CALL to ADDER.entry(...)');

  const single = scalaOf(UNRELATED_SINGLE_CALL_SOURCE);
  assert.doesNotMatch(
    single,
    /Adder\.entry\(/,
    'BUG: program X (standalone, no ADDER defined anywhere in its own source) must never call Adder.entry(...) - that object is only defined in the previous, unrelated multi-program conversion'
  );
  assert.match(
    single,
    /TODO: CALL "ADDER"/,
    'program X must fall back to the honest "external subprogram not available" TODO for its own, unresolved CALL "ADDER"'
  );
});

// ---------------------------------------------------------------------------
// FIELD_REGISTRY (expression-gen.js) - belt-and-suspenders: two programs
// reusing the same COBOL field name with conflicting PICTURE/type must never
// bleed into each other.
// ---------------------------------------------------------------------------

const FIELD_A_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. FIELDA.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-VAL PIC 9(4) COMP.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 42 TO WS-VAL.
           DISPLAY WS-VAL.
           STOP RUN.
`;

const FIELD_B_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. FIELDB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-VAL PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "HELLO" TO WS-VAL.
           DISPLAY WS-VAL.
           STOP RUN.
`;

test('FIELD_REGISTRY does not leak a numeric field type into a later, unrelated program declaring the same name as alphanumeric', () => {
  const a = scalaOf(FIELD_A_SOURCE);
  assert.match(a, /var wsVal\s*:\s*Int/, 'sanity: FIELDA\'s WS-VAL must be typed Int (PIC 9(4) COMP)');

  const b = scalaOf(FIELD_B_SOURCE);
  assert.match(b, /var wsVal\s*:\s*String/, 'BUG: FIELDB\'s WS-VAL must be typed String (PIC X(10)) - not leaked as Int from FIELDA');
  assert.doesNotMatch(b, /var wsVal\s*:\s*Int/);
});

// ---------------------------------------------------------------------------
// GROUP_REGISTRY / TABLE_REGISTRY (expression-gen.js) - a table-shaped group
// in one program must not leak table/SEARCH metadata into a later, unrelated
// program that reuses the same top-level record name as a plain elementary
// field.
// ---------------------------------------------------------------------------

const TABLE_A_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. TABLEA.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-ITEM OCCURS 3 PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-ITEM(1).
           DISPLAY WS-ITEM(1).
           STOP RUN.
`;

const TABLE_B_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. TABLEB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "HI" TO WS-REC.
           DISPLAY WS-REC.
           STOP RUN.
`;

test('GROUP_REGISTRY/TABLE_REGISTRY do not leak a table-shaped record into a later, unrelated program reusing the same record name as a plain field', () => {
  const a = scalaOf(TABLE_A_SOURCE);
  assert.match(a, /Vector|Array/, 'sanity: TABLEA\'s WS-REC/WS-ITEM must generate as a table (Vector/Array-backed)');

  const b = scalaOf(TABLE_B_SOURCE);
  // BUG shape would be: wsRec generated as a table/Vector-backed accessor
  // instead of a plain String var, because GROUP_REGISTRY/TABLE_REGISTRY
  // still had TABLEA's WS-REC entry installed.
  assert.match(b, /var wsRec\s*:\s*String/, 'BUG: TABLEB\'s WS-REC must be a plain String var, not leaked table/group structure from TABLEA');
});

test('GROUP_REGISTRY/TABLE_REGISTRY: reverse order (plain program FIRST, table-bearing program SECOND) leaves the table-bearing program\'s own registrations fully intact', () => {
  // Mirrors round-14's own state-isolation scenario A1-reverse: a prior
  // plain-record conversion must never suppress or corrupt the NEXT,
  // unrelated program's own legitimate table registration.
  const b = scalaOf(TABLE_B_SOURCE);
  assert.match(b, /var wsRec\s*:\s*String/);
  const a = scalaOf(TABLE_A_SOURCE);
  assert.match(a, /Vector|Array/, 'BUG: TABLEA\'s own table registration must not be affected by a preceding unrelated plain-record conversion');
});

// ---------------------------------------------------------------------------
// AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM (method-gen.js/expression-gen.js) -
// round-14's own state-isolation scenario A6: an ambiguous-bare-paragraph-
// name program must not leave its ambiguity set installed for a later,
// unrelated program whose own (non-ambiguous) paragraph name happens to be
// textually similar.
// ---------------------------------------------------------------------------

test('AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM does not leak into a later, unrelated program - its own unambiguous paragraph stays unqualified', () => {
  // z12: two SECTIONS each declare a same-named bare paragraph (PARA-ONE) -
  // MAIN-PARA's qualified PERFORM resolves to SECTION-B's own copy.
  const z12 = scalaOf(corpusSource('z12-qualified-perform.cbl'));
  assert.match(z12, /sectionBParaOne/, 'sanity: z12 itself must qualify its own genuinely-ambiguous paragraph');

  // n02: SUB-PARA is declared exactly once - never ambiguous anywhere in
  // ITS OWN source - so it must generate/resolve as a bare, unqualified
  // method regardless of what z12's own ambiguity set contained.
  const n02 = scalaOf(corpusSource('n02-exitparagraph.cbl'));
  assert.match(n02, /def subPara\(\): Unit =/, 'BUG: n02\'s own unique SUB-PARA must generate as a bare, unqualified method');
  assert.doesNotMatch(n02, /\bsectionSubPara\b/, 'BUG: n02\'s SUB-PARA must not be leaked-qualified using a section name that only exists in the PREVIOUS, unrelated z12 program');
});

// ---------------------------------------------------------------------------
// ADVANCING_FILES (expression-gen.js/file-io-gen.js) - round-14's own
// state-isolation scenario A7: a file that used WRITE ... ADVANCING in one
// program must not leave CLOSE's deferred-newline-flush behavior wired up
// for a LATER, unrelated program's file of the identical name that never
// uses ADVANCING at all.
// ---------------------------------------------------------------------------

test('ADVANCING_FILES does not leak into a later, unrelated program\'s same-named file that never uses ADVANCING', () => {
  // t01 and s01 both SELECT a file literally named OUT-FILE (assigned to
  // different physical paths) - t01 uses WRITE ... AFTER ADVANCING on it,
  // s01 never uses ADVANCING at all. Converted in that order in one
  // process, s01's own CLOSE must not inherit t01's deferred-flush.
  const t01 = scalaOf(corpusSource('t01-write-advancing-lines.cbl'));
  assert.match(t01, /outFileWriter\.print\("\\n"\)/, 'sanity: t01 itself must defer-flush a final newline at CLOSE for its own ADVANCING-using OUT-FILE');

  const s01 = scalaOf(corpusSource('s01-fileio-roundtrip.cbl'));
  assert.doesNotMatch(
    s01,
    /outFileWriter\.print\("\\n"\)/,
    'BUG: s01\'s own OUT-FILE (no ADVANCING anywhere in ITS OWN source) must not inherit the deferred-newline-flush from the previous, unrelated t01 program'
  );
});

// ---------------------------------------------------------------------------
// CALL_RET_SEQ (expression-gen.js) - round-14's own state-isolation
// scenario A9: converting the SAME source repeatedly in one process must be
// byte-identical every time (the per-call `_callRetN` counter must reset to
// 0 at the top of every generateScala() call, not keep incrementing across
// unrelated - or even identical - conversions).
// ---------------------------------------------------------------------------

test('CALL_RET_SEQ resets every call - converting the same source 3x in one process is byte-identical each time', () => {
  const source = corpusSource('z09-call-goback-stoprun.cbl');
  const first = scalaOf(source);
  const second = scalaOf(source);
  const third = scalaOf(source);
  assert.equal(first, second, 'BUG: a second conversion of the identical source produced different Scala (a leaking counter/sequence)');
  assert.equal(second, third);
});
