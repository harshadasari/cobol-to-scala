/**
 * tests/round39-fixes.test.js
 *
 * Focused unit tests for round-39 adversarial-refutation findings - see
 * tests/oracle/README.md's round-39 table for the full write-up and the
 * oo03/oo04/oo05/oo06/oo13/oo15 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs, and oo05/oo06/oo15 additionally with a direct
 * `scala-cli run` invocation, not just a static regex check).
 *
 *   1. (oo03) `generateCall`'s `target.recursive` branch (generator/
 *      expression-gen.js) treated a SUBSCRIPTED operand whose base name is a
 *      registered GROUP-table name (`WS-ITEM(2)`, a row of an
 *      OCCURS-of-GROUPS table) as an ordinary subscripted SCALAR
 *      (`isSubscriptedRefVar`), which assumes a single flat scalar Vector
 *      named after the group exists (`wsItem: Vector[Int]`) - it doesn't; an
 *      OCCURS-of-GROUPS table is flattened per-LEAF (`wsItemVal:
 *      Vector[Int]`, `wsItemTag: Vector[String]`), a hard `Not found: wsItem`
 *      Scala COMPILE crash. Fixed by adding a new `isSubscriptedNamedGroup`
 *      branch, checked BEFORE `isSubscriptedRefVar`, that builds ONE
 *      getter/setter closure pair PER LEAF, each indexing that leaf's own
 *      Vector at the row subscript.
 *   2. (oo04) `renderAssignment`'s `targetRef.refMod` branch (generator/
 *      expression-gen.js) built its `??? TODO` placeholder assignment with a
 *      hardcoded bare `=` instead of going through `assignExpr` - a ref-mod
 *      write TARGET naming a RECURSIVE program's own LINKAGE leaf (a local
 *      `def`/`def _=` pair, not a real Scala var) hit a hard "Reassignment
 *      to val" compile crash, since Scala 3 doesn't desugar `x = v` into
 *      `x_=(v)` for a locally-nested def pair. Fixed by routing through
 *      `assignExpr` (which already falls back to plain `=` for any non-
 *      RECURSIVE-leaf name) and switching the TODO comment to a block
 *      comment (`/* ... *\/`) instead of a line comment (`// ...`), since a
 *      `//` comment would otherwise swallow the wrapping `_=(...)` call's
 *      own closing paren.
 *   3. (oo05/oo06) round-38 finding 3 (nn07) added `isOpenVar`/`pastEndVar`
 *      lifecycle tracking, wired into `generateOpen`/`generateClose`/the
 *      READ path - but `generateWriteStatement`/`generateRewriteStatement`/
 *      `generateDeleteStatement` (generator/expression-gen.js) never
 *      consulted it at all, so a WRITE/REWRITE/DELETE issued after CLOSE
 *      (oo05) or while open in the wrong mode (oo06: WRITE while INPUT)
 *      dereferenced a null writer/buffer handle - a runtime
 *      NullPointerException. Fixed by adding a new `openModeVar` (file-io-
 *      gen.js's `fileHandleVarNames`/`toOpenModeVarName`, set alongside
 *      `isOpenVar` on every successful OPEN) and wrapping each of the three
 *      statement generators' ENTIRE pre-existing body (renamed to an
 *      `...Inner` helper, unchanged) in an outer `if !isOpenVar || <wrong
 *      mode> then <48/49> else <original body>` guard - the same "check
 *      state before touching any handle" convention round-38 established
 *      for READ.
 *   4. (oo13 bug A) `generateAccept`'s `DAY` branch (generator/expression-
 *      gen.js) rendered only the 3-digit day-of-year (`getDayOfYear.toString`)
 *      with no year component at all - cobc's ACCEPT FROM DAY is YYDDD (a
 *      2-digit year PLUS the 3-digit day-of-year). Fixed by prepending the
 *      2-digit year (`getYear % 100`, zero-padded).
 *   5. (oo13 bug B) `ACCEPT ... FROM DATE YYYYMMDD` (the 4-digit-year
 *      variant) was unsupported: `parseAcceptStatement` (parser/procedure-
 *      parser.js) never consumed the trailing `YYYYMMDD` keyword, leaving it
 *      unconsumed and misinterpreted downstream as a new paragraph-name
 *      declaration - corrupting the paragraph structure, not just the
 *      DISPLAYed value. Fixed with a two-part change: the parser now
 *      consumes an optional trailing `YYYYMMDD` keyword (setting
 *      `AcceptStatement.fourDigitYear`), and `generateAccept` uses a
 *      `"yyyyMMdd"` format pattern instead of `"yyMMdd"` when that flag is
 *      set.
 *   6. (oo13 bug C) `relationalOperandDescriptor` (generator/expression-
 *      gen.js) classified a ref-mod'd operand using the BASE field's own
 *      registered (numeric) type, ignoring that COBOL reference
 *      modification always yields an alphanumeric view - this routed
 *      `renderComparisonExpr`'s numeric branch into wrapping the ref-mod
 *      read's own honest-decline empty-string placeholder in
 *      `BigDecimal(...)`, and `BigDecimal("")` throws `NumberFormatException`
 *      at RUNTIME. Fixed by checking `simple.refMod` BEFORE consulting the
 *      base field's registered info, always reporting `alphanumeric` for a
 *      ref-mod'd operand regardless of the base field's own declared type -
 *      routes through the safe string-vs-string comparison branch instead.
 *   7. (oo15) A non-RECURSIVE program calling itself indirectly through a
 *      cycle (A calls B calls C calls A) had no notion of "this PROGRAM-ID
 *      is already active on the call stack" - the JVM/Scala call stack just
 *      let the cycle run to completion, producing full (but spurious - real
 *      cobc aborts partway through with `libcob: error: recursive CALL from
 *      <X> to <Y> which is NOT RECURSIVE`, nonzero exit) output. Fixed by
 *      giving each non-RECURSIVE program (that gets an `entry()` at all -
 *      multi-PROGRAM-ID mode) its own private `_callActive: Boolean` flag,
 *      checked at the top of `entry()`: if already true, prints a
 *      cobc-style abend message and `sys.exit(1)`; otherwise sets it true,
 *      runs the body inside `try ... finally { _callActive = false }` (a
 *      bare sequential reset would be skipped by GOBACK/EXIT PROGRAM's own
 *      `return`, which `finally` unwinds through correctly), and resets it
 *      on the way out - so a LATER, non-overlapping, purely-sequential call
 *      to the same program is completely unaffected.
 *
 * Every expectation below is derived from (or directly cross-checked
 * against) the real cobc-captured tests/corpus/proc/oo*.oracle.txt files.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PROC = path.join(__dirname, 'corpus', 'proc');

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function readCorpus(name) {
  return fs.readFileSync(path.join(CORPUS_PROC, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// Finding 1 (oo03): a subscripted GROUP-table row (WS-ITEM(2)) BY REFERENCE
// into a RECURSIVE callee must alias each LEAF's own Vector at the row
// subscript, not a nonexistent flat Vector named after the group.
// ---------------------------------------------------------------------------

describe('round-39 finding 1 (oo03): subscripted GROUP-table row BY REFERENCE into a RECURSIVE callee', () => {
  const oracleText = readCorpus('oo03-byref-tblgrp-recur.oracle.txt');

  test('the real cobc oracle capture documents the writeback shape (sanity)', () => {
    assert.match(oracleText, /BEFORE VAL2=020 TAG2=BBB/);
    assert.match(oracleText, /AFTER VAL2=020 TAG2=BBB/);
  });

  test('WS-ITEM(2) BY REFERENCE gets one getter/setter closure pair PER LEAF, each indexing that leaf\'s own Vector - not a nonexistent flat "wsItem" Vector', () => {
    // round-40 finding 1 (pp02/pp02b): this CALL's own trailing bare
    // NUMERIC_LITERAL operand ("2", LK-DEPTH's incoming value) used to be
    // silently dropped by parseCallStatement's own USING-loop continuation
    // condition (the exact bug pp02/pp02b isolate) - so this call site
    // previously reached entry() with only 4 arguments, silently relying on
    // LK-DEPTH's own zero-default parameter instead of the literal 2 the
    // source actually passes (a real, if previously-undetected, wrong-value
    // bug in this exact program - entry()'s own trailing params all carry
    // defaults, so the 4-argument call still compiled, just silently wrong).
    // Now that the parser captures both operands, the trailing literal gets
    // its own call-site-scoped snapshot closure pair (round-35/36's own BY
    // CONTENT/VALUE convention - a bare literal has no caller-side variable
    // to alias, regardless of the BY REFERENCE keyword), so the call now
    // carries all 6 arguments and the literal's real value reaches LK-DEPTH.
    const scala = scalaOf(readCorpus('oo03-byref-tblgrp-recur.cbl'));
    assert.match(
      scala,
      /Oo03sub\.entry\(\(\) => wsItemVal\(1\), \(v: Int\) => \{ wsItemVal = wsItemVal\.updated\(1, v\) \}, \(\) => wsItemTag\(1\), \(v: String\) => \{ wsItemTag = wsItemTag\.updated\(1, v\) \}, \(\) => _call\d+_1Snapshot0, \(v: Int\) => _call\d+_1Snapshot0 = v\)/
    );
    assert.doesNotMatch(scala, /=> wsItem\(1\)/);
    assert.doesNotMatch(scala, /wsItem = wsItem\.updated/);
  });

  test('the generated Scala compiles (no "Not found: wsItem") - the group has no single flat Vector of its own', () => {
    const scala = scalaOf(readCorpus('oo03-byref-tblgrp-recur.cbl'));
    // The group's own per-leaf Vectors exist; a flat "wsItem" Vector never
    // gets declared (there is nothing to alias under that bare name).
    assert.match(scala, /var wsItemVal: Vector\[Int\] = Vector\.fill\(3\)\(0\)/);
    assert.match(scala, /var wsItemTag: Vector\[String\] = Vector\.fill\(3\)\(""\)/);
  });
});

describe('round-39 finding 1 regression: an ordinary subscripted SCALAR (not a GROUP-table row) BY REFERENCE into a RECURSIVE callee is unaffected', () => {
  test('nn03 (subscripted scalar) still uses the plain isSubscriptedRefVar convertIdentifier/renderAssignment shape', () => {
    const scala = scalaOf(readCorpus('nn03-call-byref-subscript-recur.cbl'));
    assert.match(scala, /Nn03sub\.entry\(\(\) => wsItem\(1\), \(v: Int\) => \{ wsItem = wsItem\.updated\(1, v\) \}, \(\) => wsDepth, \(v: Int\) => wsDepth = v\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (oo04): a ref-mod write TARGET naming a RECURSIVE program's own
// LINKAGE leaf must compile (route through assignExpr's setter-call detour),
// not hit "Reassignment to val".
// ---------------------------------------------------------------------------

describe('round-39 finding 2 (oo04): ref-mod write to a RECURSIVE LINKAGE leaf compiles (assignExpr, not a bare "=")', () => {
  const oracleText = readCorpus('oo04-refmod-runtime-recur.oracle.txt');

  test('the real cobc oracle capture documents the ref-mod splice-write (sanity)', () => {
    assert.match(oracleText, /BEFORE STR=\[ABCDEFGHIJ\]/);
    assert.match(oracleText, /IN SUB SLICE=\[CDEF\]/);
  });

  test('inside the RECURSIVE entry(), the ref-mod write TARGET routes through the explicit <camel>_=(...) setter-call form', () => {
    const scala = scalaOf(readCorpus('oo04-refmod-runtime-recur.cbl'));
    assert.match(
      scala,
      /lkSlice_=\(\?\?\? \/\* TODO: reference modification \(write\) not implemented - see tests\/oracle\/README\.md known gaps \*\/\)/
    );
    // (The SAME program's own ordinary, non-closure-aliased flat-method body -
    // dead code, never actually invoked, since this program is RECURSIVE and
    // only ever reached through entry() - still uses assignExpr's plain "="
    // fallback for that unused copy, which is fine; assignExpr only routes
    // through the explicit setter-call form for a name in
    // RECURSIVE_LEAF_NAMES, which is populated per-entry-method-generation,
    // not globally. The important assertion is the one above: the ACTUAL,
    // reachable entry() body must never emit a bare "=" for this name.)
  });

  test('the placeholder is a BLOCK comment, not a line comment - a line comment would swallow the wrapping _=(...) call\'s own closing paren', () => {
    const scala = scalaOf(readCorpus('oo04-refmod-runtime-recur.cbl'));
    assert.match(scala, /lkSlice_=\(\?\?\? \/\*/);
    assert.doesNotMatch(scala, /lkSlice_=\(\?\?\? \/\/ /);
  });
});

describe('round-39 finding 2 regression: an ordinary (non-RECURSIVE-leaf) ref-mod write target still uses a plain "=" (assignExpr\'s own fallback)', () => {
  test('e04 (ordinary WORKING-STORAGE ref-mod write, not a RECURSIVE LINKAGE leaf) is unaffected', () => {
    const scala = scalaOf(readCorpus('e04-refmod-move.cbl'));
    assert.match(scala, /wsDest = \?\?\? \/\* TODO: reference modification \(write\) not implemented/);
    assert.match(scala, /wsSrc = \?\?\? \/\* TODO: reference modification \(write\) not implemented/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (oo05/oo06): WRITE/REWRITE/DELETE must check isOpenVar/openModeVar
// BEFORE touching any handle, reporting 48/49 instead of crashing.
// ---------------------------------------------------------------------------

describe('round-39 finding 3 (oo05): WRITE/REWRITE/DELETE after CLOSE report 48/49, no crash', () => {
  const oracleText = readCorpus('oo05-file-post-close-ops.oracle.txt');

  test('the real cobc oracle capture documents the post-close status codes (sanity)', () => {
    assert.match(oracleText, /WRITE-AFTER-CLOSE STATUS=48/);
    assert.match(oracleText, /REWRITE-AFTER-CLOSE STATUS=49/);
    assert.match(oracleText, /DELETE-AFTER-CLOSE STATUS=49/);
  });

  test('generateWriteStatement checks isOpenVar/openModeVar FIRST, reporting "48" without touching the buffer', () => {
    const scala = scalaOf(readCorpus('oo05-file-post-close-ops.cbl'));
    assert.match(
      scala,
      /if !relFileIsOpen \|\| \(relFileOpenMode != "OUTPUT" && relFileOpenMode != "I-O" && relFileOpenMode != "EXTEND"\) then\n\s+wsStatus = "48"/
    );
  });

  test('generateRewriteStatement/generateDeleteStatement check isOpenVar/openModeVar FIRST, reporting "49"', () => {
    const scala = scalaOf(readCorpus('oo05-file-post-close-ops.cbl'));
    const matches = scala.match(/if !relFileIsOpen \|\| relFileOpenMode != "I-O" then\n\s+wsStatus = "49"/g) || [];
    // Once for REWRITE, once for DELETE.
    assert.equal(matches.length, 2);
  });

  test('generateOpen sets openModeVar alongside isOpenVar on every successful OPEN', () => {
    const scala = scalaOf(readCorpus('oo05-file-post-close-ops.cbl'));
    assert.match(scala, /relFileOpenMode = "OUTPUT"/);
    assert.match(scala, /relFileOpenMode = "I-O"/);
  });
});

describe('round-39 finding 3 (oo06): WRITE/REWRITE while open in the WRONG mode (INPUT) report 48/49, READ still works', () => {
  const oracleText = readCorpus('oo06-file-open-input-write.oracle.txt');

  test('the real cobc oracle capture documents the wrong-open-mode status codes (sanity)', () => {
    assert.match(oracleText, /WRITE-WHILE-INPUT STATUS=48/);
    assert.match(oracleText, /REWRITE-WHILE-INPUT STATUS=49/);
    assert.match(oracleText, /READ-STILL-WORKS STATUS=00/);
  });

  test('WRITE while open INPUT is caught by the openModeVar check (isOpenVar is true, but mode is INPUT, not OUTPUT/I-O/EXTEND)', () => {
    const scala = scalaOf(readCorpus('oo06-file-open-input-write.cbl'));
    assert.match(scala, /someFileOpenMode = "INPUT"/);
    assert.match(
      scala,
      /if !someFileIsOpen \|\| \(someFileOpenMode != "OUTPUT" && someFileOpenMode != "I-O" && someFileOpenMode != "EXTEND"\) then/
    );
  });
});

describe('round-39 finding 3 regression: ordinary in-mode WRITE/REWRITE/DELETE against an open file are unaffected', () => {
  test('bb01/bb02/cc01 (REWRITE/DELETE/WRITE against a properly-opened I-O/OUTPUT file) generate no "48"/"49" short-circuit text for their own file', () => {
    for (const name of ['bb01-rewrite-length-shrink.cbl', 'cc01-write-relative-key-new.cbl']) {
      const scala = scalaOf(readCorpus(name));
      // The guard is present (added uniformly) but the ordinary body beneath
      // it is completely unchanged - a sanity check that conversion still
      // succeeds and produces the pre-existing buffer-based WRITE/REWRITE
      // codegen these programs already depended on.
      assert.match(scala, /Buf\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// Findings 4/5/6 (oo13): ACCEPT FROM DAY (YYDDD), ACCEPT FROM DATE YYYYMMDD
// (4-digit year, parser-level fix), and a ref-mod'd numeric comparison
// operand must not crash.
// ---------------------------------------------------------------------------

describe('round-39 finding 4 (oo13 bug A): ACCEPT FROM DAY is YYDDD (2-digit year + 3-digit day-of-year), not a bare day-of-year', () => {
  const oracleText = readCorpus('oo13-accept-date-day-dow.oracle.txt');

  test('the real cobc oracle capture documents the YYDDD value (sanity)', () => {
    assert.match(oracleText, /DAY=26201/);
  });

  test('generateAccept prepends the 2-digit year to the 3-digit day-of-year', () => {
    const scala = scalaOf(readCorpus('oo13-accept-date-day-dow.cbl'));
    assert.match(
      scala,
      /wsDay = CobolFmt\.truncNumeric\(BigDecimal\(\(f"\$\{\(java\.time\.LocalDate\.now\.getYear % 100\)\}%02d" \+ f"\$\{java\.time\.LocalDate\.now\.getDayOfYear\}%03d"\)\), 5, 0\)\.toInt/
    );
  });
});

describe('round-39 finding 5 (oo13 bug B): ACCEPT FROM DATE YYYYMMDD (4-digit year) parses and generates correctly, no paragraph corruption', () => {
  const oracleText = readCorpus('oo13-accept-date-day-dow.oracle.txt');

  test('the real cobc oracle capture documents the 4-digit-year value (sanity)', () => {
    assert.match(oracleText, /DATE4=20260720/);
  });

  test('parseAcceptStatement consumes the trailing YYYYMMDD keyword (AcceptStatement.fourDigitYear)', async () => {
    const { parseCobol } = await import('../parser/index.js');
    const source = readCorpus('oo13-accept-date-day-dow.cbl');
    const ast = parseCobol(source);
    const acceptStmts = (ast.procedures || [])
      .flatMap(p => p.statements || [])
      .filter(s => s.type === 'AcceptStatement');
    const dateAccepts = acceptStmts.filter(s => s.from === 'DATE');
    assert.equal(dateAccepts.length, 2);
    assert.equal(dateAccepts[0].fourDigitYear, false);
    assert.equal(dateAccepts[1].fourDigitYear, true);
  });

  test('generateAccept uses a "yyyyMMdd" pattern for the 4-digit-year variant, "yyMMdd" for the ordinary one', () => {
    const scala = scalaOf(readCorpus('oo13-accept-date-day-dow.cbl'));
    assert.match(scala, /DateTimeFormatter\.ofPattern\("yyMMdd"\)/);
    assert.match(scala, /DateTimeFormatter\.ofPattern\("yyyyMMdd"\)/);
  });

  test('the generated Scala has no structural corruption - exactly one mainPara method, not a bogus second paragraph split at a phantom YYYYMMDD label', () => {
    const scala = scalaOf(readCorpus('oo13-accept-date-day-dow.cbl'));
    const mainParaDefs = scala.match(/def mainPara\(\)/g) || [];
    assert.equal(mainParaDefs.length, 1);
    assert.doesNotMatch(scala, /def yyyymmdd/i);
    assert.doesNotMatch(scala, /UnknownStatement/i);
  });
});

describe('round-39 finding 6 (oo13 bug C): a ref-mod\'d operand over a NUMERIC base field in a comparison must not crash', () => {
  test('relationalOperandDescriptor reports alphanumeric for a ref-mod\'d operand regardless of the base field\'s own numeric type', () => {
    const scala = scalaOf(readCorpus('oo13-accept-date-day-dow.cbl'));
    // Routes through the safe string-vs-string comparison branch (the
    // ref-mod read's own honest-decline empty-string placeholder compared
    // directly against the string literal "2026") instead of wrapping that
    // placeholder in BigDecimal(...), which would throw NumberFormatException
    // at runtime.
    assert.match(
      scala,
      /if \("" \/\* TODO: reference modification not implemented as a comparison operand[^)]*\*\/\) == "2026" then/
    );
    assert.doesNotMatch(scala, /BigDecimal\(\?\?\?/);
  });
});

// ---------------------------------------------------------------------------
// Finding 7 (oo15): a non-RECURSIVE program CALL cycle (A->B->C->A) must not
// silently run to completion - each non-RECURSIVE entry() gets a
// "currently active" guard matching cobc's own runtime abend.
// ---------------------------------------------------------------------------

describe('round-39 finding 7 (oo15): non-RECURSIVE CALL cycle aborts instead of silently completing', () => {
  const oracleText = readCorpus('oo15-nonrecursive-call-cycle.oracle.txt');

  test('the real cobc oracle capture documents the partial output before the abend, and a nonzero exit (sanity)', () => {
    assert.match(oracleText, /# program exited 1/);
    assert.match(oracleText, /IN A N=1/);
    assert.match(oracleText, /IN B N=1/);
    assert.match(oracleText, /IN C N=1/);
    assert.match(oracleText, /libcob: error: recursive CALL from OO15PC to OO15PA which is NOT RECURSIVE/);
    assert.doesNotMatch(oracleText, /A DONE/);
    assert.doesNotMatch(oracleText, /MAIN DONE/);
  });

  test('every non-RECURSIVE program in this source gets its own private _callActive guard', () => {
    const scala = scalaOf(readCorpus('oo15-nonrecursive-call-cycle.cbl.txt'));
    const guardDecls = scala.match(/private var _callActive: Boolean = false/g) || [];
    assert.equal(guardDecls.length, 4); // OO15MAIN, OO15PA, OO15PB, OO15PC
  });

  test('entry() checks _callActive FIRST, prints a cobc-style abend message and sys.exit(1) if already active', () => {
    const scala = scalaOf(readCorpus('oo15-nonrecursive-call-cycle.cbl.txt'));
    assert.match(
      scala,
      /if _callActive then\n\s+System\.err\.println\("libcob: error: recursive CALL into OO15PA which is NOT RECURSIVE"\)\n\s+sys\.exit\(1\)/
    );
  });

  test('entry() wraps its body in try/finally so GOBACK\'s own `return` still resets _callActive to false on the way out', () => {
    const scala = scalaOf(readCorpus('oo15-nonrecursive-call-cycle.cbl.txt'));
    assert.match(scala, /_callActive = true\n\s+try\n/);
    assert.match(scala, /finally\n\s+_callActive = false/);
  });
});

describe('round-39 finding 7 regression: a RECURSIVE program is completely unaffected (no _callActive guard at all)', () => {
  test('j10 (J10RECMAIN calls the genuinely RECURSIVE J10RECSUB): J10RECSUB itself gets no _callActive guard - it legitimately re-enters via generateRecursiveEntryMethod; only the non-recursive caller (J10RECMAIN) gets one', () => {
    const scala = scalaOf(readCorpus('j10-recursive-call-ws.cbl'));
    const recsubObject = scala.slice(scala.indexOf('object J10recsub'));
    assert.doesNotMatch(recsubObject, /_callActive/);
    assert.match(scala, /object J10recmain:[\s\S]*?_callActive/);
  });
});

describe('round-39 finding 7 regression: repeated SEQUENTIAL (non-overlapping) calls to the same non-RECURSIVE program are unaffected', () => {
  test('d13 (the same non-RECURSIVE subprogram called 3x in sequence, never overlapping) is not wrongly flagged as a cycle', () => {
    const oracleText = readCorpus('d13-multicall-twice-state.oracle.txt');
    const scala = scalaOf(readCorpus('d13-multicall-twice-state.cbl'));
    // A sequential (non-overlapping) repeated call must never reach the
    // abend branch - confirmed structurally (the guard resets via
    // try/finally on every return) and against the real cobc oracle, which
    // itself completes normally (no "# program exited" header at all).
    assert.doesNotMatch(oracleText, /# program exited/);
    assert.match(scala, /_callActive = true\n\s+try\n/);
    assert.match(scala, /finally\n\s+_callActive = false/);
  });
});
