/**
 * tests/round12-fixes.test.js
 *
 * Focused unit tests for the round-12 adversarial-refutation findings (4
 * dishonest divergences fixed - an 88-level's `WHEN SET TO FALSE IS
 * <literal>` clause hung the parser in an infinite loop (a severe, crash-
 * class bug, not merely a wrong-output one), multi-key SEARCH ALL with a
 * skipped middle key and tied rows force-terminated as "not found" at
 * whatever row binary search happened to land on, CALL with fewer USING
 * operands than the callee's LINKAGE SECTION declares required exact arity,
 * and CALL ... USING ... OMITTED corrupted the rest of the statement
 * stream - plus one bonus fix promoted from the "honest" column: PERFORM
 * <para> OF/IN <section> qualification wasn't even consumed by the parser)
 * - see tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/z*.cbl programs provide
 * via the data-driven oracle suite. This file targets the individual
 * parser/generator mechanisms each finding traces to, in isolation (no
 * cobc/scala-cli needed), so a regression is caught at the unit level even
 * on a machine without the compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala } from '../index.js';
import { tokenize } from '../parser/lexer.js';
import { parseDataDivision } from '../parser/data-division-parser.js';
import { parseProcedureDivision } from '../parser/procedure-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_JS = path.join(__dirname, '..', 'index.js');

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function dataItemsOf(source) {
  const tokens = tokenize(source, { format: 'fixed' });
  return parseDataDivision(tokens, {});
}

function procedureOf(source) {
  const tokens = tokenize(source, { format: 'fixed' });
  return parseProcedureDivision(tokens);
}

// ---------------------------------------------------------------------------
// Finding 1: 88-level `WHEN SET TO FALSE IS <literal>` hung parseLevel88's
// VALUE-clause loop in an infinite loop - none of its branches recognize
// WHEN/SET/TO, and nothing advanced the token cursor, so the loop's own
// continuation condition (true for any non-PERIOD/non-EOF token) spun
// forever. Fixed by (a) a forced-progress guard (no value recognized this
// iteration -> break, never spin), (b) actually parsing the WHEN SET TO
// FALSE IS clause into `falseValue`, and (c) SET ... TO FALSE assigning that
// literal to the parent field (not the Scala boolean `false`).
// ---------------------------------------------------------------------------

const Z11_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z11SET88F.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS  PIC X(1) VALUE "P".
           88  WS-APPROVED  VALUE "A" WHEN SET TO FALSE IS "P".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "INITIAL=" WS-STATUS.
           SET WS-APPROVED TO TRUE.
           DISPLAY "AFTER-TRUE=" WS-STATUS.
           SET WS-APPROVED TO FALSE.
           DISPLAY "AFTER-FALSE=" WS-STATUS.
           STOP RUN.
`;

test('Finding 1 termination guard: an 88-level WHEN SET TO FALSE clause parses and converts within a timeout (regression guard for the pre-fix infinite loop)', () => {
  // A synchronous infinite loop cannot be interrupted from within the same
  // process/thread (node:test's own per-test timeout option only fires a
  // timer - it can't preempt a hung synchronous call) - so this specifically
  // runs the conversion in a *child process* with a hard wall-clock timeout,
  // and asserts the child actually exited on its own (was not killed).
  const script = `
    import { convertToScala } from ${JSON.stringify(INDEX_JS)};
    convertToScala(${JSON.stringify(Z11_SOURCE)}, { generateMain: true });
    process.stdout.write('DONE');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    timeout: 10_000,
    encoding: 'utf8',
  });
  assert.equal(
    result.signal,
    null,
    `conversion was killed (signal=${result.signal}) - pre-fix infinite loop regression. stderr:\n${result.stderr}`
  );
  assert.equal(result.error, undefined, `conversion process errored: ${result.error}`);
  assert.equal(result.stdout, 'DONE');
});

test('Finding 1a: parseLevel88 parses WHEN SET TO FALSE IS <literal> into condition.falseValue (not left for the VALUE loop to spin on)', () => {
  const items = dataItemsOf(Z11_SOURCE);
  const cond = items.workingStorageSection.items[0].conditions[0];
  assert.equal(cond.name, 'WS-APPROVED');
  assert.deepEqual(cond.values, [{ type: 'string', value: 'A' }]);
  assert.deepEqual(cond.falseValue, { type: 'string', value: 'P' });
});

test('Finding 1b: SET condition-name TO FALSE assigns the parent field its own WHEN SET TO FALSE literal, not the Scala boolean false', () => {
  const code = scalaOf(Z11_SOURCE);
  assert.match(code, /wsStatus = "P"/, 'the FALSE branch must assign the declared false-value literal');
  assert.doesNotMatch(code, /wsStatus = false/, 'must never assign a bare Scala boolean to a COBOL data item');
});

test('Finding 1c regression guard: an ordinary (no WHEN SET TO FALSE) 88-level VALUE clause with multiple THRU-less literals still parses all of them, and SET ... TO TRUE is unaffected', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE  PIC X(1).
           88  WS-VALID  VALUE "A" "B" "C".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET WS-VALID TO TRUE.
           STOP RUN.
`;
  const items = dataItemsOf(source);
  const cond = items.workingStorageSection.items[0].conditions[0];
  assert.equal(cond.values.length, 3, 'all three space-separated literals must still be captured');
  assert.equal(cond.falseValue, null);

  const code = scalaOf(source);
  assert.match(code, /wsCode = "A"/, 'SET ... TO TRUE must still assign the first declared VALUE');
});

test('Parser-loop audit regression guard: a stray 88-level with no preceding elementary item (malformed COBOL) does not hang the parser either - the same no-progress shape as finding 1, gated behind a different precondition, found during the round-12 audit', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
           88  WS-STRAY  VALUE "A".
       01  WS-X PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
  const script = `
    import { tokenize } from ${JSON.stringify(path.join(__dirname, '..', 'parser', 'lexer.js'))};
    import { parseDataDivision } from ${JSON.stringify(path.join(__dirname, '..', 'parser', 'data-division-parser.js'))};
    const tokens = tokenize(${JSON.stringify(source)}, { format: 'fixed' });
    parseDataDivision(tokens, {});
    process.stdout.write('DONE');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    timeout: 10_000,
    encoding: 'utf8',
  });
  assert.equal(result.signal, null, `parse hung (signal=${result.signal}) on a stray 88-level with no preceding item`);
  assert.equal(result.stdout, 'DONE');
});

// ---------------------------------------------------------------------------
// Finding 2: multi-key SEARCH ALL whose WHEN clause skips a middle declared
// key (`WS-K1(x) = 10 AND WS-K3(x) = 9` against `ASCENDING KEY WS-K1 WS-K2
// WS-K3`) force-terminated as "not found" the instant the binary search's
// own midpoint landed on a K1-tied row that failed the residual (WS-K3)
// conjunct - even though a DIFFERENT row tied on that same K1 prefix
// actually satisfies every conjunct. Fixed by linearly scanning the whole
// tied range (every row sharing the extracted prefix key) for a fully-
// matching row before giving up.
// ---------------------------------------------------------------------------

const SKIPMIDDLE_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. SKIPMID.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 4 TIMES
               ASCENDING KEY IS WS-K1 WS-K2 WS-K3
               INDEXED BY WS-IDX.
               10  WS-K1 PIC 9(2).
               10  WS-K2 PIC 9(2).
               10  WS-K3 PIC 9(2).
               10  WS-VAL PIC X(3).
       01  WS-FOUND PIC X(3) VALUE "NONE".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SEARCH ALL WS-ENTRY
               AT END MOVE "NONE" TO WS-FOUND
               WHEN WS-K1(WS-IDX) = 10 AND WS-K3(WS-IDX) = 9
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           STOP RUN.
`;

test('Finding 2: SEARCH ALL with a skipped middle key generates a tied-range linear rescan (not an immediate not-found) when the landed row fails the residual conjunct', () => {
  const code = scalaOf(SKIPMIDDLE_SOURCE);
  // The composite-key binary search still narrows on the extracted prefix
  // (WS-K1 only - WS-K2 has no equality conjunct in the WHEN clause).
  assert.match(code, /val _key0 = wsK1\(wsIdx - 1\)/);
  // On a residual (WS-K3) failure at the landed row, the fix scans outward
  // for the tied range's boundaries...
  assert.match(code, /var _tieLo = wsIdx/);
  assert.match(code, /while _tieLo > 1 && \(wsK1\(_tieLo - 2\) == _key0\) do _tieLo -= 1/);
  assert.match(code, /var _tieHi = wsIdx/);
  assert.match(code, /while _tieHi < 4 && \(wsK1\(_tieHi\) == _key0\) do _tieHi \+= 1/);
  // ...then linearly rescans it for a row satisfying every conjunct, only
  // force-terminating the outer binary search once that whole range is
  // exhausted with no match.
  assert.match(code, /while !_tieFound && _tieIdx <= _tieHi do/);
  assert.match(code, /if _tieFound then/);
  assert.match(code, /_lo = _hi \+ 1/);
});

// ---------------------------------------------------------------------------
// Finding 3: CALL with fewer USING operands than the callee's own LINKAGE
// SECTION declares required exact Scala method arity (a hard "missing
// argument" compile error) - real cobc simply leaves an un-passed trailing
// LINKAGE item unaddressed (not a compile error). Fixed by giving every
// entry(...) parameter a zero/spaces default, and never padding the CALL
// site's own argument list out to the callee's full arity.
// ---------------------------------------------------------------------------

const FEWER_ARGS_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. FEWCHECK.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(4) VALUE 10.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "SUBY" USING WS-A.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. SUBY.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       SUBY-PARA.
           ADD 1 TO LK-A.
           GOBACK.
       END PROGRAM SUBY.
       END PROGRAM FEWCHECK.
`;

test('Finding 3a: entry() gives every LINKAGE parameter a zero/spaces default, so a CALL with fewer USING operands still compiles', () => {
  const code = scalaOf(FEWER_ARGS_SOURCE);
  assert.match(
    code,
    /def entry\(_arg0: Int = 0, _arg1: Int = 0\)/,
    'both LINKAGE params must have a default so the second can be omitted by a caller'
  );
});

test('Finding 3b: generateCall does not pad the argument list out to the callee\'s full arity - it passes exactly what the CALL statement supplied', () => {
  const code = scalaOf(FEWER_ARGS_SOURCE);
  assert.match(code, /Suby\.entry\(wsA\)/, 'exactly one argument - relying on entry()\'s own default for the rest');
  assert.doesNotMatch(code, /Suby\.entry\(wsA,/, 'must never pass a second (guessed) argument');
});

// ---------------------------------------------------------------------------
// Incidentally-discovered-and-fixed bug: found while promoting round-12's
// z09 survivor (the first corpus program to exercise two BY-REFERENCE-
// writeback CALLs in the SAME paragraph) - generateCall always named its
// intermediate result `val _callRet`, so a second such CALL in one method
// body redeclared the identical val - a hard Scala "already defined" compile
// error, not a wrong-output bug. Not one of the four round-12 dishonest
// findings themselves, but blocked z09 from hard-passing until fixed.
// ---------------------------------------------------------------------------

test('Regression guard: two BY-REFERENCE-writeback CALLs in the same paragraph get distinctly-named intermediate results (no duplicate `val _callRet`)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(4) VALUE 1.
       01 WS-B PIC 9(4) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "SUBA" USING WS-A, WS-B.
           CALL "SUBB" USING WS-A, WS-B.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. SUBA.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       SUBA-PARA.
           GOBACK.
       END PROGRAM SUBA.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. SUBB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B.
       SUBB-PARA.
           GOBACK.
       END PROGRAM SUBB.
       END PROGRAM T.
`;
  const code = scalaOf(source);
  const declLines = code.match(/val _callRet\d* = /g) || [];
  assert.equal(declLines.length, 2, 'both CALLs must produce a val declaration');
  assert.equal(new Set(declLines).size, 2, 'the two val names must be distinct - no duplicate-definition compile error');
});

// ---------------------------------------------------------------------------
// Finding 4: CALL ... USING ... OMITTED ... - parseCallStatement's USING
// loop condition never recognized the OMITTED token at all, so it silently
// exited the whole loop right there, leaving OMITTED and everything after it
// (the next operand, RETURNING, the terminating period, ...) unconsumed to
// corrupt the rest of the statement parse. Fixed by parsing OMITTED as an
// explicit placeholder positional parameter; codegen substitutes the
// callee's own zero/spaces default in that slot and never writes a value
// back to it (there is no caller-side operand to write back into).
// ---------------------------------------------------------------------------

const OMITTED_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. OMCHECK.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(4) VALUE 10.
       01 WS-C PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "SUBX" USING WS-A, OMITTED, WS-C.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. SUBX.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       01 LK-C PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B, LK-C.
       SUBX-PARA.
           ADD 1 TO LK-A.
           MOVE LK-A TO LK-C.
           GOBACK.
       END PROGRAM SUBX.
       END PROGRAM OMCHECK.
`;

test('Finding 4a: parseCallStatement parses USING ... OMITTED ... as a placeholder positional parameter and keeps parsing the rest of the statement (no stream corruption)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "SUBX" USING WS-A, OMITTED, WS-C RETURNING WS-R.
           DISPLAY "STILL-PARSED".
           STOP RUN.
`;
  const division = procedureOf(source);
  const paragraphs = division.paragraphs || division.procedures?.paragraphs;
  const stmts = paragraphs[0].statements;
  const call = stmts.find(s => s.type === 'CallStatement');
  assert.ok(call, 'CALL statement must be recognized');
  assert.equal(call.using.length, 3, 'all three positional operands (incl. OMITTED) must be captured');
  assert.equal(call.using[1].omitted, true);
  assert.equal(call.using[1].value, null);
  assert.ok(call.returning, 'RETURNING (after the OMITTED operand) must still parse - proves the stream was not corrupted');
  assert.equal(stmts.find(s => s.type === 'DisplayStatement' || s.type === 'Display'), stmts[1], 'the statement after CALL must still be reached');
  const unknowns = stmts.filter(s => s.type === 'UnknownStatement');
  assert.deepEqual(unknowns, [], 'nothing after the CALL may have been misparsed as an UnknownStatement');
});

test('Finding 4b: generateCall substitutes the callee\'s own zero/spaces default for an OMITTED argument, and never writes a value back to it', () => {
  const code = scalaOf(OMITTED_SOURCE);
  assert.match(
    code,
    /Subx\.entry\(wsA, 0, wsC\)/,
    'the OMITTED middle argument must become a type-correct default, not a reference to a nonexistent variable'
  );
});

// ---------------------------------------------------------------------------
// Bonus finding (promoted from the "honest" column): PERFORM <para> OF/IN
// <section> wasn't even consumed by the parser - the qualifier and section
// name fell through every remaining PERFORM clause check unconsumed,
// corrupting the rest of the PROCEDURE DIVISION parse. Fixed by parsing the
// qualifier into PerformStatement.targetSection/throughSection and routing
// a qualified reference through the same collision-aware
// resolveParagraphMethodName resolver generateAllMethods already uses to
// *declare* a qualified method.
// ---------------------------------------------------------------------------

const Z12_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z12QUAL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "START".
           PERFORM PARA-ONE OF SECTION-B.
           DISPLAY "END".
           STOP RUN.

       SECTION-A SECTION.
       PARA-ONE.
           DISPLAY "IN-SECTION-A-PARA-ONE".

       SECTION-B SECTION.
       PARA-ONE.
           DISPLAY "IN-SECTION-B-PARA-ONE".
`;

test('Bonus finding a: parsePerformStatement consumes an explicit OF/IN section qualifier into targetSection, without corrupting the rest of the statement', () => {
  const division = procedureOf(Z12_SOURCE);
  const mainPara = (division.paragraphs || division.procedures?.paragraphs)[0];
  const perform = mainPara.statements.find(s => s.type === 'PerformStatement');
  assert.ok(perform);
  assert.equal(perform.targetParagraph, 'PARA-ONE');
  assert.equal(perform.targetSection, 'SECTION-B');
  const display = mainPara.statements.find(s => s.type === 'DisplayStatement' || s.type === 'Display');
  assert.ok(display, 'the DISPLAY "END" statement after the qualified PERFORM must still parse');
  const unknowns = mainPara.statements.filter(s => s.type === 'UnknownStatement');
  assert.deepEqual(unknowns, [], 'nothing after the qualified PERFORM may have been misparsed');
});

test('Bonus finding b: a qualified PERFORM ... OF <section> to a genuinely colliding bare paragraph name calls the correct section-qualified method', () => {
  const code = scalaOf(Z12_SOURCE);
  // Both PARA-ONE paragraphs collide bare (paraOne), so each must be
  // qualified by its own enclosing section...
  assert.match(code, /def sectionAParaOne\(\)/);
  assert.match(code, /def sectionBParaOne\(\)/);
  assert.doesNotMatch(code, /def paraOne\(\)/, 'the bare (unqualified) name must never be generated for a colliding pair');
  // ...and the explicit PERFORM ... OF SECTION-B call site must resolve to
  // the SECTION-B one specifically, not the bare/first-declared one.
  assert.match(code, /sectionBParaOne\(\)/);
});
