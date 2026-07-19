/**
 * tests/round35-fixes.test.js
 *
 * Focused unit tests for round-35 adversarial-refutation findings - see
 * tests/oracle/README.md's round-35 table for the full write-up and the
 * kk04/kk07/kk08/kk09/kk12 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs).
 *
 *   1. (kk04) `LINAGE IS <n> LINES WITH FOOTING AT 0` was silently coerced
 *      to "no FOOTING clause at all" (footingLines <= 0 treated as null)
 *      BEFORE round-34's own footingLines > pageSize invalid-combination
 *      check ever ran - so this equally-invalid FOOTING value never
 *      aborted at OPEN time like real cobc does. Fixed in scala-generator.js's
 *      FD-registry-building loop: the invalid check now inspects the RAW
 *      `f.linageFootingLines` (an integer <= 0 is invalid, same bucket as
 *      footingLines > pageSize).
 *   2. (kk07) BY CONTENT parameters to a RECURSIVE program's entry() got a
 *      caller-side no-op setter (correct - the caller's own copy must never
 *      be mutated by the callee) but that ALSO discarded a write made
 *      WITHIN the callee's own activation, so a later read in the SAME call
 *      never saw the mutation - `SUBTRACT 1 FROM LK-DEPTH` had no visible
 *      effect at all, causing genuine unbounded recursion
 *      (StackOverflowError).
 *      FIRST ATTEMPT (reverted - caused a real regression): changed
 *      generateRecursiveEntryMethod (scala-generator.js) to give every
 *      LINKAGE leaf - BY CONTENT AND BY REFERENCE alike - a local var cached
 *      ONCE from `_get()` at entry(). This broke BY REFERENCE: this
 *      codebase's WORKING-STORAGE model for RECURSIVE programs treats
 *      WORKING-STORAGE as SHARED, non-reentrant storage across the whole
 *      call chain, so a BY-REFERENCE-aliased LINKAGE parameter's correct
 *      (cobc-verified) behavior requires every read to be LIVE - caching it
 *      once at entry made an OUTER activation's later read stop reflecting a
 *      DEEPER call's mutation of the same shared storage, producing an
 *      "off by one RECURSIVE depth" regression in j10/dd02/k01 (rounds
 *      21/22/23/28's own regression-guard tests caught this).
 *      CORRECTED FIX: generateRecursiveEntryMethod is reverted to its exact
 *      pre-round-35 form (plain `_get`/`_set` closure aliasing, mode-
 *      agnostic, for every leaf). The actual fix is at the CALL SITE
 *      instead - generateCall (expression-gen.js)'s `target.recursive`
 *      branch: a BY CONTENT/VALUE argument (in both the plain-ref-var and
 *      named-group branches, plus the zero-default fallback) now gets its
 *      own isolated, call-site-scoped local snapshot var (`_call<i>Snapshot<j>`),
 *      seeded once from the caller's current value, with the getter/setter
 *      closures operating on THAT local var instead of a no-op setter over
 *      the caller's own storage - giving BY CONTENT/VALUE a real, working,
 *      per-call-site-local mutable copy (writes visible to later reads
 *      within the SAME callee activation) without ever writing back to the
 *      caller. A BY REFERENCE plain-var/named-group operand is completely
 *      unaffected - still a live getter/setter pair aliasing the caller's
 *      own variable directly.
 *   3. (kk08) An OCCURS table REDEFINED by a DIFFERENTLY-SHAPED OCCURS
 *      table (different element count/width, same total byte width) was
 *      treated as a plain SCALAR alias (`def wsTableB: String = wsTableA`)
 *      by redefinesAccessorLines's elementary-alias branch, while the
 *      separate table-subscript codegen path still emitted Vector-indexed
 *      `wsTableB(0)` syntax against it - a hard type mismatch at Scala
 *      compile time. Fixed with a new
 *      occursElementaryOverOccursElementaryRedefinesLines helper
 *      (scala-generator.js) that builds a real synthetic flat-character
 *      view over the target's own Vector, resliced into the redefining
 *      item's own element boundaries.
 *   4. (kk09) SEARCH ALL over an OCCURS-bearing GROUP child nested under a
 *      REDEFINES crashed at Scala COMPILE time with `Not found: wsIdx` (the
 *      INDEXED BY var was never declared anywhere) - not the honest,
 *      compiling `???` decline every other REDEFINES-of-unsupported-shape
 *      branch in this file already uses. Fixed in
 *      characterSlicedGroupRedefinesLines (scala-generator.js): this exact
 *      declined shape now declares the table's own INDEXED BY name(s) as
 *      real `Int` vars and emits a visible, compiling `???`/no-op stub for
 *      the table itself, instead of silently falling through to a
 *      zero-width, mis-registered leaf with an undeclared index.
 *   5. (kk12) MOVE CORRESPONDING + a qualified REDEFINES field name
 *      collision (`A-VIEW-SUB OF GROUP-A`, where GROUP-A's REDEFINES-nested
 *      A-VIEW-SUB collides with GROUP-B's own plain A-VIEW-SUB) crashed at
 *      Scala COMPILE time with `Not found: aViewSub` - the REDEFINES
 *      target-lookup path never anticipated an AMBIGUOUS elementary target
 *      (whose bare registry entry is deliberately skipped), and the
 *      REDEFINES-nested child's own registration never participated in the
 *      ambiguous-name disambiguation pass at all. Fixed in
 *      redefinesAccessorLines/characterSlicedGroupRedefinesLines
 *      (scala-generator.js): the target lookup now also tries the
 *      qualified registry (`NAME::ANCESTOR`) when the bare lookup misses,
 *      and every leaf these functions declare now goes through the same
 *      ambiguous-name-aware registration (bare name only when unambiguous,
 *      always a qualified entry) ordinary (non-REDEFINES) leaves already
 *      use. A companion gap (a GROUP redefining a NUMERIC target whose own
 *      child is alphanumeric, not a numeric digit-slice) is also fixed via
 *      a synthetic flat-character view over the target's own DISPLAY digit
 *      text (CobolFmt.digitsOf/numval) - needed for kk12's own A-VIEW-SUB
 *      (PIC X(3)) viewing A-FIELD1 (PIC 9(3))'s raw digit bytes as
 *      characters, matching real cobc's storage-sharing semantics exactly.
 *
 * Every expectation below is derived from (or directly cross-checked
 * against) the real cobc-captured tests/corpus/proc/kk*.oracle.txt files.
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
// Finding 1 (kk04): LINAGE IS 5 LINES WITH FOOTING AT 0 - footing <= 0 is
// just as invalid as footing > pageSize, and must abort at OPEN time with
// zero output, matching real cobc.
// ---------------------------------------------------------------------------

describe('round-35 finding 1 (kk04): WITH FOOTING AT 0 is invalid, same bucket as FOOTING exceeding LINES', () => {
  const oracleText = readCorpus('kk04-linage-footing-zero.oracle.txt');

  test('the real cobc oracle capture documents a hard abort with zero stdout output (sanity)', () => {
    assert.match(oracleText, /LINAGE values invalid \(status = 57\)/);
    assert.match(oracleText, /stdout: \(empty/);
  });

  test('the generated Scala emits a runtime abort (stderr message + sys.exit) for the OPEN of this file', () => {
    const scala = scalaOf(readCorpus('kk04-linage-footing-zero.cbl.txt'));
    assert.match(scala, /LINAGE values invalid \(status = 57\)/);
    assert.match(scala, /sys\.exit\(1\)/);
  });

  test('the abort is the ENTIRE body of OPEN for this file - no writer/file handle is ever constructed', () => {
    const scala = scalaOf(readCorpus('kk04-linage-footing-zero.cbl.txt'));
    assert.doesNotMatch(scala, /printFileWriter = new java\.io\.PrintWriter/);
  });
});

describe('round-35 finding 1 regression: jj01/jj02/hh01\'s own valid-FOOTING shapes still have no abort code at all', () => {
  test('jj01 (footingLines=4 <= pageSize=5) has no abort code', () => {
    const scala = scalaOf(readCorpus('jj01-linage-footing-formula.cbl'));
    assert.doesNotMatch(scala, /LINAGE values invalid/);
  });

  test('jj02 (footingLines=5 == pageSize=5) has no abort code - equal is valid', () => {
    const scala = scalaOf(readCorpus('jj02-linage-footing-equals-page.cbl'));
    assert.doesNotMatch(scala, /LINAGE values invalid/);
  });

  test('jj03 (footingLines exceeds pageSize) still aborts - round-34\'s own check is untouched', () => {
    const scala = scalaOf(readCorpus('jj03-linage-exceeds.cbl.txt'));
    assert.match(scala, /LINAGE values invalid/);
  });

  test('a bare LINAGE (no FOOTING at all) has no abort code', () => {
    const scala = scalaOf(readCorpus('hh01-write-eop-notclause.cbl'));
    assert.doesNotMatch(scala, /LINAGE values invalid/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (kk07): BY CONTENT writes must be visible within the SAME
// callee activation, but never propagate back to the caller, in a
// RECURSIVE program.
// ---------------------------------------------------------------------------

describe('round-35 finding 2 (kk07): BY CONTENT writes are visible within the same RECURSIVE activation but never propagate to the caller', () => {
  const oracleText = readCorpus('kk07-call-content-ref-recursive.oracle.txt');

  test('the real cobc oracle capture documents LK-DEPTH genuinely decrementing (3, 2, 1) and terminating (sanity)', () => {
    assert.match(oracleText, /DEPTH=3/);
    assert.match(oracleText, /DEPTH=2/);
    assert.match(oracleText, /DEPTH=1/);
    assert.match(oracleText, /AFTER {2}CONTENT=100 REF=130/);
  });

  test('generateRecursiveEntryMethod stays mode-agnostic at entry() itself - every LINKAGE leaf is still a plain live get/set closure alias (reverted to pre-round-35 shape; see round-35 finding 2 CORRECTED write-up)', () => {
    const scala = scalaOf(readCorpus('kk07-call-content-ref-recursive.cbl'));
    assert.match(scala, /def lkContent: Int = _get0\(\)/);
    assert.match(scala, /def lkContent_=\(v: Int\): Unit = _set0\(v\)/);
    // no per-activation local-var caching at entry() itself - that was the
    // first (broken) attempt at this fix; it caused an "off by one" RECURSIVE
    // depth regression for BY REFERENCE leaves (j10/dd02/k01), since this
    // codebase's WORKING-STORAGE model requires every BY REFERENCE read to be
    // LIVE, not cached once at entry.
    assert.doesNotMatch(scala, /_local:/);
  });

  test('BY CONTENT (LK-DEPTH, the 3rd LINKAGE leaf) gets its own isolated call-site-local snapshot var instead - a real getter/setter pair over that local, not a no-op setter', () => {
    const scala = scalaOf(readCorpus('kk07-call-content-ref-recursive.cbl'));
    // the top-level MAIN-PARA call site's own snapshot vars (WS-CONTENT-ARG
    // is USING-position 0, WS-DEPTH is USING-position 2 - BY REFERENCE
    // WS-REF-ARG at position 1 needs no snapshot, it's a live alias)
    assert.match(scala, /var _call0Snapshot0: Int = wsContentArg/);
    assert.match(scala, /var _call2Snapshot0: Int = wsDepth/);
    assert.match(
      scala,
      /Kk07sub\.entry\(\(\) => _call0Snapshot0, \(v: Int\) => _call0Snapshot0 = v, \(\) => wsRefArg, \(v: Int\) => wsRefArg = v, \(\) => _call2Snapshot0, \(v: Int\) => _call2Snapshot0 = v\)/
    );
    // the RECURSIVE self-call inside KK07SUB's own body gets the identical
    // treatment - LK-CONTENT/LK-DEPTH (BY CONTENT) each get a fresh local
    // snapshot var seeded from THIS activation's own current value; LK-REF
    // (BY REFERENCE) stays a live alias, routed through its own `_=` setter
    // call (round-23's own detour) since lkRef is itself a recursive-LINKAGE
    // leaf.
    assert.match(scala, /var _call0Snapshot0: Int = lkContent/);
    assert.match(scala, /var _call2Snapshot0: Int = lkDepth/);
    assert.match(
      scala,
      /Kk07sub\.entry\(\(\) => _call0Snapshot0, \(v: Int\) => _call0Snapshot0 = v, \(\) => lkRef, \(v: Int\) => lkRef_=\(v\), \(\) => _call2Snapshot0, \(v: Int\) => _call2Snapshot0 = v\)/
    );
  });
});

describe('round-35 finding 2 regression (kk13): a non-recursive callee is untouched - it never reaches generateRecursiveEntryMethod at all', () => {
  test('kk13 generates no per-activation local-var closures (uses the ordinary shared-module-var convention, not generateRecursiveEntryMethod)', () => {
    const scala = scalaOf(readCorpus('kk13-callcontent-nonrecur.cbl'));
    assert.doesNotMatch(scala, /_local: /);
    assert.doesNotMatch(scala, /_get0: \(\) =>/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (kk08): REDEFINES of an OCCURS table by a differently-shaped
// OCCURS table.
// ---------------------------------------------------------------------------

describe('round-35 finding 3 (kk08): OCCURS table REDEFINES a differently-shaped OCCURS table via a real character-reslicing view', () => {
  const oracleText = readCorpus('kk08-redefines-occurs-diffshape.oracle.txt');

  test('the real cobc oracle capture reslices across element boundaries (sanity)', () => {
    assert.match(oracleText, /B1=\[AABB\]/);
    assert.match(oracleText, /A1=\[WX\]/);
  });

  test('the generated Scala does NOT emit the wrong flat scalar alias for the redefining table', () => {
    const scala = scalaOf(readCorpus('kk08-redefines-occurs-diffshape.cbl'));
    assert.doesNotMatch(scala, /def wsTableB: String = wsTableA/);
  });

  test('the generated Scala builds a real Vector[String] reslicing view for the redefining table', () => {
    const scala = scalaOf(readCorpus('kk08-redefines-occurs-diffshape.cbl'));
    assert.match(scala, /def wsTableB: Vector\[String\] =/);
    assert.match(scala, /wsTableA\.mkString\.substring/);
    assert.match(scala, /def wsTableB_=\(v: Vector\[String\]\): Unit =/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (kk09): SEARCH ALL over an OCCURS-bearing GROUP child nested
// under a REDEFINES must compile (an honest decline), not crash.
// ---------------------------------------------------------------------------

describe('round-35 finding 4 (kk09): SEARCH ALL over a REDEFINES-nested table-of-groups compiles (honest decline), not a bare undeclared identifier', () => {
  test('the INDEXED BY var (wsIdx) is declared as a real Int var', () => {
    const scala = scalaOf(readCorpus('kk09-searchall-redef-tblgrp.cbl'));
    assert.match(scala, /var wsIdx: Int = 1/);
  });

  test('the table itself gets a visible, compiling decline marker, not a silently mis-registered leaf', () => {
    const scala = scalaOf(readCorpus('kk09-searchall-redef-tblgrp.cbl'));
    assert.match(scala, /TODO REDEFINES: unsupported table-of-groups-under-REDEFINES shape/);
  });

  test('SEARCH ALL itself degrades to the pre-existing honest "no OCCURS/INDEXED BY metadata found" comment', () => {
    const scala = scalaOf(readCorpus('kk09-searchall-redef-tblgrp.cbl'));
    assert.match(scala, /no OCCURS\/INDEXED BY metadata found/);
  });
});

// ---------------------------------------------------------------------------
// Finding 5 (kk12): MOVE CORRESPONDING + a qualified REDEFINES field name
// collision must resolve correctly, not crash.
// ---------------------------------------------------------------------------

describe('round-35 finding 5 (kk12): a REDEFINES-nested field colliding with a same-named plain field resolves via qualification, not a dangling reference', () => {
  const oracleText = readCorpus('kk12-movecorr-redef-qualified.oracle.txt');

  test('the real cobc oracle capture documents A-VIEW-SUB OF GROUP-A reading "123" (A-FIELD1\'s own digit bytes) and MOVE CORRESPONDING leaving GROUP-B\'s own A-VIEW-SUB untouched (sanity)', () => {
    assert.match(oracleText, /A-VIEW-SUB=\[123\]/);
    assert.match(oracleText, /B-VIEWSUB=\[ {3}\]/);
  });

  test('the generated Scala declares a real, ambiguous-aware-prefixed accessor for GROUP-A\'s own REDEFINES-nested A-VIEW-SUB (not left undeclared, not a bare colliding name)', () => {
    const scala = scalaOf(readCorpus('kk12-movecorr-redef-qualified.cbl'));
    assert.match(scala, /def groupAAViewSub: String =/);
    // the qualified reference now resolves directly to the prefixed name via
    // qualifiedRegistry, not merely by accidental bare-name fallback
    assert.match(scala, /println\("A-VIEW-SUB=\[" \+ \(groupAAViewSub\)/);
  });

  test('the generated Scala does NOT emit the "target not found" decline comment for A-VIEW REDEFINES A-FIELD1', () => {
    const scala = scalaOf(readCorpus('kk12-movecorr-redef-qualified.cbl'));
    assert.doesNotMatch(scala, /REDEFINES A-FIELD1: target not found/);
  });

  test('GROUP-B\'s own ambiguous plain fields keep their pre-existing prefixed names', () => {
    const scala = scalaOf(readCorpus('kk12-movecorr-redef-qualified.cbl'));
    assert.match(scala, /var groupBAField1: Int = 0/);
    assert.match(scala, /var groupBAViewSub: String = "   "/);
  });
});
