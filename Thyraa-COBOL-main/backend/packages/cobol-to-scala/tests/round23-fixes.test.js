/**
 * tests/round23-fixes.test.js
 *
 * Focused unit tests for the round-23 adversarial-refutation findings (4
 * reported, all fixed at root cause) - see tests/oracle/README.md's round-23
 * table for the full write-up and the l01-l13 promoted oracle corpus
 * programs for the end-to-end cobc-vs-generated-Scala verification. This
 * file targets the individual generator mechanisms each finding traces to,
 * in isolation (no cobc/scala-cli needed) - though every finding below was
 * ALSO independently verified with a real scala-cli compile/run against the
 * actual l04/l10/l11/l12 corpus programs (see the round-23 README table for
 * the exact captured output).
 *
 *   1. (l12/l04) `generateRecursiveEntryMethod`'s own doc comment claimed
 *      Scala's assignment-operator desugaring (`x = y` -> `x_=(y)`) would
 *      let ordinary generated code read/write a RECURSIVE program's
 *      LINKAGE-aliased local `def`/`def ..._=` pair transparently - never
 *      true: that desugaring only fires for a getter/setter pair that are
 *      MEMBERS of an enclosing template (class/object/trait), never for a
 *      pair of LOCAL defs declared directly inside a method body (exactly
 *      what generateRecursiveEntryMethod emits) - confirmed with minimal
 *      standalone scala-cli snippets. Fixed by routing every "write a plain
 *      camelCase identifier" call site (renderAssignment, plus generateCall's
 *      own CALL-boundary closure/writeback construction) through a new
 *      shared `assignExpr` helper that emits the explicit `<camel>_=(value)`
 *      method-call form - which DOES compile for a local def pair - whenever
 *      the target name is in the new `RECURSIVE_LEAF_NAMES` set (installed
 *      per-program, mirroring the same identifier list
 *      generateRecursiveEntryMethod already builds its closures from).
 *
 *   2. (l10) A RECURSIVE program's GROUP LINKAGE parameter containing an
 *      OCCURS-bearing child falls back to the ordinary (non-recursive-safe)
 *      convention - but that fallback's own group-parameter SCATTER was a
 *      silent no-op whenever `scatterGroupFromString` itself also bails,
 *      leaving the program's own recursion loop-guard field (living in the
 *      SAME group) frozen at its default forever: genuine infinite
 *      recursion (a real StackOverflowError). Fixed: `generateEntryMethod`'s
 *      scatter fallback now throws a `NotImplementedError` instead of
 *      silently no-op'ing, but ONLY for a RECURSIVE program - an ordinary
 *      (non-recursive) callee keeps the exact pre-existing silent no-op
 *      (never loops, so there is nothing to fix there).
 *
 *   3. (l11) A RECURSIVE program's GROUP LINKAGE parameter containing a
 *      FILLER child ALSO falls back to the ordinary convention (per
 *      round-22 finding 1's own documented `flattenGroupLeaves` bail-out) -
 *      but unlike the OCCURS case, `scatterGroupFromString` does NOT bail on
 *      a FILLER child (it already reads/writes the FILLER's own hidden
 *      `_fillerN` var like any other leaf), so the scatter itself succeeds
 *      per call - just into a SHARED module-level var, reproducing the
 *      exact pre-round-21/22 clobbering bug for a FILLER-bearing group
 *      specifically. Fixed: `flattenGroupLeaves` no longer bails on a FILLER
 *      child - it flattens it into its own leaf using its existing hidden
 *      `_fillerN` camel/info, giving it the SAME per-call-activation
 *      getter/setter closure every other leaf gets.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/l04/l10/l11/l12
 * programs provide via the data-driven oracle suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: a RECURSIVE program's own LINKAGE-aliased identifier is written
// via an explicit setter CALL, not bare assignment-sugar (which does not
// desugar for a local def pair).
// ---------------------------------------------------------------------------

describe('round-23 finding 1: a RECURSIVE program\'s own LINKAGE-aliased local getter/setter def pair is written via an explicit <camel>_=(value) call', () => {
  const l12Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23SELFMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T23SELFSUB" USING WS-N.
           DISPLAY "MAIN N AFTER=" WS-N.
           STOP RUN.
       END PROGRAM T23SELFMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23SELFSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           IF LS-N > 0
               SUBTRACT 1 FROM LS-N
               CALL "T23SELFSUB" USING LS-N
           END-IF.
           DISPLAY "EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM T23SELFSUB.
`;

  // T23selfsub's own generated Scala contains TWO copies of MAIN-PARA's
  // body: an ordinary, non-nested, top-level `mainPara()` (generated by the
  // pre-existing, always-emitted non-recursive convention - a legitimate,
  // separate code path this round does not touch, using the SHARED module
  // `var lsN`, where bare `lsN = ...` assignment is completely correct) AND
  // the nested copy inside `def entry(_get0...)` (generateRecursiveEntryMethod
  // - the ACTUAL callable entry point, closing over local getter/setter
  // defs, where bare assignment is the bug this finding fixes). Assertions
  // below are scoped to the nested `entry(_get0...)` method specifically, so
  // they can't be satisfied by the (unrelated, still-bare-by-design) other
  // copy.
  function nestedEntryBody(scala) {
    const start = scala.indexOf('def entry(_get0');
    assert.ok(start >= 0, 'expected a generateRecursiveEntryMethod entry() in the generated Scala');
    return scala.slice(start);
  }

  test('a direct write to the LINKAGE parameter itself (SUBTRACT ... FROM) emits an explicit setter call, never bare assignment, inside the nested recursive entry() body', () => {
    const body = nestedEntryBody(scalaOf(l12Shape));
    // The bug: a bare `lsN = <expr>` inside entry() is a hard "Reassignment
    // to val lsN" compile error, since lsN/lsN_= are LOCAL defs there, not
    // template members - Scala's assignment-sugar desugaring does not apply.
    assert.doesNotMatch(body, /\n\s*lsN = \(CobolFmt\.truncNumeric/);
    assert.match(body, /lsN_=\(\(CobolFmt\.truncNumeric/);
  });

  test('the self-recursive CALL\'s own writeback closure setter also uses the explicit form, not bare assignment, inside the nested recursive entry() body', () => {
    const body = nestedEntryBody(scalaOf(l12Shape));
    assert.match(body, /T23selfsub\.entry\(\(\) => lsN, \(v: Int\) => lsN_=\(v\)\)/);
    assert.doesNotMatch(body, /\(v: Int\) => lsN = v/);
  });

  test('regression guard: the ordinary, non-nested, non-recursive-entry copy of the SAME paragraph keeps plain bare assignment - RECURSIVE_LEAF_NAMES is scoped only to the nested entry() body, not this program\'s whole generated output', () => {
    const scala = scalaOf(l12Shape);
    const nestedStart = scala.indexOf('def entry(_get0');
    const beforeNested = scala.slice(0, nestedStart);
    assert.match(beforeNested, /\n\s*lsN = \(CobolFmt\.truncNumeric/);
  });

  test('regression guard: an ordinary (non-LINKAGE-aliased) identifier keeps plain bare assignment, never the explicit setter-call form', () => {
    const scala = scalaOf(l12Shape);
    // WS-N (the caller's own WORKING-STORAGE var, an ordinary module `var`,
    // never a local getter/setter def pair) must still use bare assignment.
    assert.doesNotMatch(scala, /wsN_=/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: a RECURSIVE program's own OCCURS-bearing GROUP LINKAGE
// parameter must decline honestly (throw), not silently infinite-recurse.
// ---------------------------------------------------------------------------

describe('round-23 finding 2: a RECURSIVE program\'s own unresolvable (OCCURS-bearing) GROUP LINKAGE parameter declines honestly instead of silently freezing its own loop-guard field forever', () => {
  const l10Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23OCCMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DEPTH-GRP.
           05 WS-DEPTH PIC 9(2) VALUE 1.
           05 WS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-ITEMS(1).
           MOVE 20 TO WS-ITEMS(2).
           CALL "T23OCCSUB" USING WS-DEPTH-GRP.
           STOP RUN.
       END PROGRAM T23OCCMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23OCCSUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT-GRP.
           05 WS-NEXT PIC 9(2).
           05 WS-NEXT-ITEMS PIC 9(2) OCCURS 2 TIMES.
       LINKAGE SECTION.
       01 LS-DEPTH-GRP.
           05 LS-DEPTH PIC 9(2).
           05 LS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION USING LS-DEPTH-GRP.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               CALL "T23OCCSUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM T23OCCSUB.
`;

  test('a RECURSIVE program\'s own entry() throws a NotImplementedError from the unresolvable group-scatter fallback, instead of a silent no-op', () => {
    const scala = scalaOf(l10Shape);
    assert.match(scala, /throw new NotImplementedError\(.*group parameter scatter not supported.*on a RECURSIVE program/);
    assert.doesNotMatch(scala, /\(\) \/\/ TODO: CALL \.\.\. USING LS-DEPTH-GRP: group parameter scatter/);
  });

  test('regression guard: the identical unresolvable-shape group scatter for an ORDINARY (non-recursive) callee keeps the pre-existing silent no-op - never loops, so nothing to fix', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23OCCPLAINMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-GRP.
           05 WS-N PIC 9(2) VALUE 1.
           05 WS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T23OCCPLAINSUB" USING WS-GRP.
           STOP RUN.
       END PROGRAM T23OCCPLAINMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23OCCPLAINSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-GRP.
           05 LS-N PIC 9(2).
           05 LS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION USING LS-GRP.
       MAIN-PARA.
           DISPLAY LS-N.
           GOBACK.
       END PROGRAM T23OCCPLAINSUB.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /throw new NotImplementedError/);
    assert.match(scala, /\(\) \/\/ TODO: CALL \.\.\. USING LS-GRP: group parameter scatter not supported/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: a RECURSIVE program's own FILLER-bearing GROUP LINKAGE
// parameter gets true per-activation leaf aliasing, not the clobbering
// shared-var fallback.
// ---------------------------------------------------------------------------

describe('round-23 finding 3: a RECURSIVE program\'s own FILLER-bearing GROUP LINKAGE parameter is aliased per-CALL-activation, including the FILLER child\'s own synthetic leaf', () => {
  const l11Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23FILLMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DEPTH-GRP.
           05 WS-DEPTH PIC 9(2) VALUE 1.
           05 FILLER   PIC X(3) VALUE "XXX".
           05 WS-TAG   PIC X(3) VALUE "TOP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T23FILLSUB" USING WS-DEPTH-GRP.
           STOP RUN.
       END PROGRAM T23FILLMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23FILLSUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT-GRP.
           05 WS-NEXT     PIC 9(2).
           05 FILLER      PIC X(3).
           05 WS-NEXT-TAG PIC X(3).
       LINKAGE SECTION.
       01 LS-DEPTH-GRP.
           05 LS-DEPTH PIC 9(2).
           05 FILLER   PIC X(3).
           05 LS-TAG   PIC X(3).
       PROCEDURE DIVISION USING LS-DEPTH-GRP.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " TAG=" LS-TAG.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               MOVE "SUB" TO WS-NEXT-TAG
               CALL "T23FILLSUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " TAG=" LS-TAG.
           GOBACK.
       END PROGRAM T23FILLSUB.
`;

  test('entry() takes THREE getter/setter closure pairs (LS-DEPTH, the FILLER, LS-TAG), not the two-leaf shape a FILLER-blind flattening would produce', () => {
    const scala = scalaOf(l11Shape);
    assert.match(
      scala,
      /def entry\(_get0: \(\) => Int = \(\) => 0, _set0: Int => Unit = \(_: Int\) => \(\), _get1: \(\) => String = \(\) => "", _set1: String => Unit = \(_: String\) => \(\), _get2: \(\) => String = \(\) => "", _set2: String => Unit = \(_: String\) => \(\)\): Unit =/
    );
  });

  test('the FILLER child gets its own local getter/setter def pair over its existing hidden _fillerN var, not a bail-out to the ordinary shared-var convention', () => {
    const scala = scalaOf(l11Shape);
    assert.match(scala, /def _filler\d+: String = _get1\(\)/);
    assert.match(scala, /def _filler\d+_=\(v: String\): Unit = _set1\(v\)/);
  });

  test('regression guard: an OCCURS-bearing child (l10\'s own shape) still bails to the ordinary convention - only a FILLER child was extended', () => {
    const occSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23OCCLEAFMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-GRP.
           05 WS-N PIC 9(2) VALUE 1.
           05 WS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T23OCCLEAFSUB" USING WS-GRP.
           STOP RUN.
       END PROGRAM T23OCCLEAFMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T23OCCLEAFSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-GRP.
           05 LS-N PIC 9(2).
           05 LS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION USING LS-GRP.
       MAIN-PARA.
           DISPLAY LS-N.
           GOBACK.
       END PROGRAM T23OCCLEAFSUB.
`;
    const scala = scalaOf(occSrc);
    assert.doesNotMatch(scala, /def entry\(_get0/);
    assert.match(scala, /throw new NotImplementedError\(/);
  });
});
