/**
 * tests/round21-fixes.test.js
 *
 * Focused unit tests for the round-21 adversarial-refutation findings (3
 * reported) - see tests/oracle/README.md's round-21 table for the full
 * write-up and the j05/j10/j11 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification.
 *
 *   1. copybook-resolver.js's COPY_PATTERN regex matched a `COPY <name>.`
 *      lookalike sequence ANYWHERE in the source text during recursive
 *      expansion, including inside a quoted string literal's own VALUE text
 *      (e.g. `VALUE "... COPY DONE. ..."`) and inside an ordinary source
 *      comment - splicing an unrelated copybook's content into the middle of
 *      the literal/comment, silently corrupting the source with no visible
 *      marker. Fixed by making COPY-statement detection quote-AND-comment-
 *      aware: `findQuotedRanges` mirrors parser/lexer.js's own
 *      `Lexer#scanString` quote-tracking exactly (doubled-quote escaping,
 *      unterminated-at-end-of-line bail-out), and `findCommentRanges`
 *      mirrors lexer.js's own `detectFormat`/`preprocessFixedFormat`/
 *      `preprocessFreeFormat` comment recognition (fixed-format column-7
 *      indicator lines, free-format inline `*>`). `replaceOutsideQuotes`
 *      skips any COPY_PATTERN match whose start index falls inside either
 *      range set entirely, leaving the source completely unmodified there.
 *
 *   2. A RECURSIVE program's LINKAGE SECTION parameter(s) were modeled as a
 *      single, object-level (module-scoped) `var` - every activation, at
 *      every recursion depth, read/wrote the SAME variable. A deeper
 *      recursive CALL's own writeback silently clobbered the OUTERMOST
 *      frame's own value once the deepest call returned (verified against
 *      installed GnuCOBOL: the outermost frame's own parameter must stay
 *      untouched by anything a deeper activation does). Fixed by
 *      `generateRecursiveEntryMethod` (generator/scala-generator.js, gated
 *      on `isRecursiveProgram(ast)` and every LINKAGE parameter being a
 *      plain scalar): entry() now accepts a getter/setter CLOSURE pair per
 *      parameter instead of a plain value, and a local
 *      `def <camel>: T = _getN()` / `def <camel>_=(v: T): Unit = _setN(v)`
 *      pair (Scala's own getter/setter assignment sugar) lets every
 *      reference to the LINKAGE item read/write straight through to
 *      whichever variable THIS SPECIFIC call activation was actually called
 *      with - a live alias, exactly like cobc's own BY REFERENCE pointer,
 *      scoped per Scala call the same way any other recursive method's own
 *      parameters already are. generateCall (generator/expression-gen.js)
 *      builds a live getter/setter for a plain BY REFERENCE variable operand
 *      when calling a RECURSIVE target, and a value-snapshot getter with a
 *      no-op setter for every other operand shape (BY CONTENT/VALUE, a
 *      literal/computed expression, OMITTED). WORKING-STORAGE itself is left
 *      completely untouched (still a shared module var, matching cobc's own
 *      confirmed shared/static WORKING-STORAGE-for-RECURSIVE-programs
 *      quirk) - only the LINKAGE aliasing bug is fixed.
 *
 *   3. `GO TO para OF section` (disambiguating a paragraph name that
 *      collides across sections, exactly like `PERFORM para OF section`
 *      already does per rounds 12/14) was never parsed at all:
 *      parseGoToStatement's target-collecting loop naturally stopped at the
 *      OF/IN token (its own reserved-word token type, never IDENTIFIER), but
 *      nothing downstream consumed OF/IN or the section name after it -
 *      corrupting the rest of the PROCEDURE DIVISION parse, and (at codegen)
 *      generateGoTo emitted a bare, unqualified `return para()` even where a
 *      real qualifier was present in-source. Fixed by threading a new
 *      `targetSections` array (index-aligned with `targets`, since GO TO's
 *      DEPENDING ON form can list more than one target - parser/ast.js,
 *      parser/procedure-parser.js's parseGoToStatement) and passing it
 *      through to the SAME `paragraphMethodName(name, sectionName)`
 *      collision-aware resolver PERFORM's own qualified targets already use
 *      (generator/expression-gen.js's generateGoTo).
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/j05/j10/j11 programs
 * provide via the data-driven oracle suite. This file targets the individual
 * parser/generator mechanisms each finding traces to, in isolation (no cobc/
 * scala-cli needed).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { expandCopybooks } from '../parser/copybook-resolver.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: quote-and-comment-aware COPY statement detection.
// ---------------------------------------------------------------------------

describe('round-21 finding 1: copybook-resolver.js never treats a COPY-statement lookalike inside a quoted literal or a comment as a real COPY statement', () => {
  test('j05 shape: a COPY-lookalike inside a quoted VALUE literal is left completely untouched, while a real nested COPY in the same copybook body still expands', () => {
    const src = `      * legitimately has an UNRELATED top-level "COPY DONE." elsewhere
       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21J05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY OUTERCPY REPLACING ==:PFX:== BY ==REC1==.
       COPY DONE.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MSG=" REC1-MSG.
           DISPLAY "VAL=" SUB1-VAL.
           DISPLAY "DECOY=" DECOY-FIELD.
           STOP RUN.
`;
    const copybooks = {
      OUTERCPY:
        '       01 :PFX:-REC.\n' +
        '          05 :PFX:-MSG PIC X(20) VALUE "SEE COPY DONE.".\n' +
        '          COPY MIDCPY REPLACING ==:Q:== BY ==SUB1==.\n',
      MIDCPY: '          05 :Q:-VAL PIC 9(3) VALUE 5.\n',
      DONE: '       01 DECOY-REC.\n          05 DECOY-FIELD PIC X(4) VALUE "OOPS".\n',
    };
    const { source, expanded, missing } = expandCopybooks(src, copybooks);
    assert.deepEqual(missing, []);
    // Every copybook actually got expanded (nested COPY MIDCPY inside
    // OUTERCPY's own body, plus the unrelated top-level COPY DONE) - the
    // quoted lookalike must not have short-circuited any of them.
    assert.deepEqual(new Set(expanded), new Set(['OUTERCPY', 'MIDCPY', 'DONE']));
    // The quoted literal itself must survive completely intact, on one
    // unbroken line - not torn in half with DECOY-REC spliced into the
    // middle of it (the pre-fix bug).
    assert.match(source, /VALUE "SEE COPY DONE\."\.\s*\n/);
    assert.ok(!/VALUE "SEE[\s\S]*DECOY-REC[\s\S]*DONE\."/.test(source), 'the quoted literal must not have a copybook spliced into its middle');
    // The real nested COPY MIDCPY (inside OUTERCPY's own body) still expands.
    assert.match(source, /SUB1-VAL PIC 9\(3\) VALUE 5/);
    // The real, unrelated top-level COPY DONE still expands too.
    assert.match(source, /DECOY-FIELD PIC X\(4\) VALUE "OOPS"/);
  });

  test('a COPY-lookalike inside an ordinary source comment is also left untouched', () => {
    const src = `      * see COPY NOTREAL. for details (this is just a comment, not code)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21CMT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY REAL.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-REAL-FIELD.
           STOP RUN.
`;
    const { source, expanded, missing } = expandCopybooks(src, {
      REAL: '       01 WS-REAL-FIELD PIC X(5) VALUE "HI".\n',
    });
    assert.deepEqual(missing, []);
    assert.deepEqual(expanded, ['REAL']);
    // The comment's own lookalike text must be completely unchanged - no
    // attempt to look up a copybook named NOTREAL at all.
    assert.match(source, /\* see COPY NOTREAL\. for details/);
    assert.match(source, /WS-REAL-FIELD PIC X\(5\) VALUE "HI"/);
  });

  test('regression guard: an ordinary COPY REPLACING still expands normally (u09/i03/i04-style)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21RG1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY REC REPLACING ==:TAG:== BY ==CUST==.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY CUST-ID.
           STOP RUN.
`;
    const { source, expanded, missing } = expandCopybooks(src, {
      REC: '       01 :TAG:-REC.\n          05 :TAG:-ID PIC 9(4).\n',
    });
    assert.deepEqual(missing, []);
    assert.deepEqual(expanded, ['REC']);
    assert.match(source, /CUST-ID PIC 9\(4\)/);
  });

  test('regression guard: a nested COPY-inside-a-copybook (u10-style) still expands recursively', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21RG2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY OUTER.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY INNER-FIELD.
           STOP RUN.
`;
    const { source, expanded, missing } = expandCopybooks(src, {
      OUTER: '       01 OUTER-REC.\n          COPY INNER.\n',
      INNER: '          05 INNER-FIELD PIC X(3) VALUE "ABC".\n',
    });
    assert.deepEqual(missing, []);
    assert.deepEqual(new Set(expanded), new Set(['OUTER', 'INNER']));
    assert.match(source, /INNER-FIELD PIC X\(3\) VALUE "ABC"/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: RECURSIVE program LINKAGE SECTION parameters get a per-call-
// activation getter/setter binding instead of a shared module var.
// ---------------------------------------------------------------------------

describe('round-21 finding 2: a RECURSIVE program\'s own LINKAGE SECTION parameter is aliased per-CALL-activation, not shared as one module-level var', () => {
  const j10Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21RECMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-D PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T21RECSUB" USING WS-D.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21RECSUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 0.
       01 WS-NEXT PIC 9(2).
       LINKAGE SECTION.
       01 LS-DEPTH PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           ADD 1 TO WS-N.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " WS-N=" WS-N.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               CALL "T21RECSUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " WS-N=" WS-N.
           GOBACK.
       END PROGRAM T21RECSUB.
       END PROGRAM T21RECMAIN.
`;

  test('the RECURSIVE subprogram\'s entry() takes a getter/setter closure pair, not a plain value, for its own LINKAGE parameter', () => {
    const scala = scalaOf(j10Shape);
    assert.match(
      scala,
      /def entry\(_get0: \(\) => Int = \(\) => 0, _set0: Int => Unit = \(_: Int\) => \(\)\): Unit =/
    );
    // The LINKAGE item is a local getter/setter def pair, forwarding
    // straight through to the closures - not a module-level var assignment.
    assert.match(scala, /def lsDepth: Int = _get0\(\)/);
    assert.match(scala, /def lsDepth_=\(v: Int\): Unit = _set0\(v\)/);
  });

  test('the self-recursive CALL site builds a live getter/setter for its own plain BY REFERENCE variable argument', () => {
    const scala = scalaOf(j10Shape);
    assert.match(scala, /T21recsub\.entry\(\(\) => wsNext, \(v: Int\) => wsNext = v\)/);
  });

  test('the external (cross-program) CALL into the RECURSIVE subprogram also uses the closure convention, not the ordinary value-in/tuple-out one', () => {
    const scala = scalaOf(j10Shape);
    assert.match(scala, /T21recsub\.entry\(\(\) => wsD, \(v: Int\) => wsD = v\)/);
    // The old convention's tell-tale shape (`wsD = T21recsub.entry(wsD)`)
    // must not appear anywhere for this RECURSIVE target.
    assert.doesNotMatch(scala, /wsD = T21recsub\.entry\(wsD\)/);
  });

  test('every paragraph reachable from the RECURSIVE program\'s entry point is nested locally inside entry() itself (so it closes over that call\'s own getter/setter), not calling the shared top-level paragraph method', () => {
    const scala = scalaOf(j10Shape);
    const entryMatch = scala.match(/def entry\(_get0[\s\S]*?\nend T21recsub/);
    assert.ok(entryMatch, 'expected to find the RECURSIVE program\'s own entry() method body');
    // round-29 REGRESSION fix (dd05-goto-depending-recursive.cbl): every
    // nested paragraph def in this convention now takes a `_chain: Boolean =
    // false` parameter (method-gen.js's renderNestedFallthroughDefs - see its
    // own doc comment) instead of a bare `(): Unit =` signature.
    assert.match(entryMatch[0], /def mainPara\(_chain: Boolean = false\): Unit =/);
  });

  test('regression guard: an ORDINARY (non-recursive) multi-program CALL chain keeps the pre-existing value-in/tuple-out convention entirely (u01-style)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(3) VALUE 10.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T21ADDER" USING WS-A.
           DISPLAY WS-A.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21ADDER.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LS-VAL PIC 9(3).
       PROCEDURE DIVISION USING LS-VAL.
       MAIN-PARA.
           ADD 1 TO LS-VAL.
           GOBACK.
       END PROGRAM T21ADDER.
       END PROGRAM T21MAIN.
`;
    const scala = scalaOf(src);
    // The ordinary (non-recursive) callee keeps a plain value parameter and
    // a real return value - not a getter/setter closure pair.
    assert.match(scala, /def entry\(_arg0: Int = 0\): Int =/);
    assert.match(scala, /lsVal = _arg0/);
    assert.match(scala, /wsA = T21adder\.entry\(wsA\)/);
    assert.doesNotMatch(scala, /_get0/);
    assert.doesNotMatch(scala, /_set0/);
  });

  test('regression guard: a RECURSIVE program with NO LINKAGE parameters at all is unaffected (nothing to alias) - WORKING-STORAGE stays a shared module var, entry() takes no closures', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21NOARGMAIN.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T21NOARG".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21NOARG RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-COUNT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD 1 TO WS-COUNT.
           DISPLAY WS-COUNT.
           GOBACK.
       END PROGRAM T21NOARG.
       END PROGRAM T21NOARGMAIN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var wsCount: Int = 0/);
    assert.match(scala, /def entry\(\): Unit =/);
    assert.doesNotMatch(scala, /_get0/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: GO TO ... OF/IN section qualifier, mirroring PERFORM's own.
// ---------------------------------------------------------------------------

describe('round-21 finding 3: GO TO para OF section resolves the same section-qualified target PERFORM para OF section already does', () => {
  const j11Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21J11.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-START.
           DISPLAY "START".
           GO TO 1000-PARA OF 3000-THIRD.
       1000-PARA.
           DISPLAY "WRONG-1000-IN-MAIN-SECTION".
           STOP RUN.
       2000-SECOND SECTION.
       1000-PARA.
           DISPLAY "WRONG-1000-IN-SECOND-SECTION".
           STOP RUN.
       3000-THIRD SECTION.
       1000-PARA.
           DISPLAY "CORRECT-1000-IN-THIRD-SECTION".
           STOP RUN.
`;

  test('j11 shape: a plain qualified GO TO resolves to the section-qualified method name, not a bare (ambiguous) one', () => {
    const scala = scalaOf(j11Shape);
    assert.match(scala, /return thirdPara\(\) \/\/ GO TO/);
    // Must not emit a bare, unqualified reference to the colliding name.
    assert.doesNotMatch(scala, /return para\(\)/);
    // Every one of the three colliding paragraphs must still get its own,
    // distinctly-named method (section-qualified, since the bare name is
    // genuinely ambiguous across all three sections).
    assert.match(scala, /def mainPara\(\): Unit =\s*\n\s*println\("WRONG-1000-IN-MAIN-SECTION"\)/);
    assert.match(scala, /def secondPara\(\): Unit =\s*\n\s*println\("WRONG-1000-IN-SECOND-SECTION"\)/);
    assert.match(scala, /def thirdPara\(\): Unit =\s*\n\s*println\("CORRECT-1000-IN-THIRD-SECTION"\)/);
    // No duplicate-definition collision anywhere (each section wrapper
    // method - main()/second()/third() - defined exactly once).
    const thirdDefs = [...scala.matchAll(/\bdef third\(\): Unit =/g)];
    assert.equal(thirdDefs.length, 1, 'def third() must be defined exactly once - no duplicate collision from a corrupted parse');
  });

  test('a qualified GO TO ... DEPENDING ON resolves each target independently, honoring a per-target qualifier', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21DEP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SEL PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       SEC-A SECTION.
       START-A.
           GO TO 1000-PARA OF SEC-A 1000-PARA OF SEC-B DEPENDING ON WS-SEL.
       1000-PARA.
           DISPLAY "IN-A".
           STOP RUN.
       SEC-B SECTION.
       1000-PARA.
           DISPLAY "IN-B".
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /case 1 => return secAPara\(\)/);
    assert.match(scala, /case 2 => return secBPara\(\)/);
  });

  test('regression guard: an UNQUALIFIED GO TO to a non-ambiguous paragraph name is completely unaffected', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21PLAIN.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "HI".
           GO TO DONE-PARA.
       DONE-PARA.
           DISPLAY "DONE".
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /return donePara\(\) \/\/ GO TO/);
  });

  test('regression guard: PERFORM\'s own OF/IN qualifier (rounds 12/14) is unaffected by this fix - still resolves via the same shared paragraphMethodName helper', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T21PERF.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM 1000-PARA OF SEC-TWO.
           STOP RUN.
       SEC-ONE SECTION.
       1000-PARA.
           DISPLAY "WRONG".
       SEC-TWO SECTION.
       1000-PARA.
           DISPLAY "RIGHT".
`;
    const scala = scalaOf(src);
    assert.match(scala, /secTwoPara\(\)/);
  });
});
