/**
 * tests/round20-fixes.test.js
 *
 * Focused unit tests for the round-20 adversarial-refutation findings (2
 * reported) - see tests/oracle/README.md's round-20 table for the full
 * write-up and the i05/i06 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification.
 *
 *   1. A paragraph literally named EXIT (or CONTINUE) - a COBOL reserved
 *      word that is ALSO a legal user-defined paragraph name, but only in
 *      the one truly unambiguous position: the very first paragraph/section
 *      of a PROCEDURE DIVISION, before anything else has been established
 *      there - was misparsed as the bare EXIT/CONTINUE *statement* instead,
 *      because `isParagraphName` (parser/procedure-parser.js) required a
 *      plain IDENTIFIER token, and the lexer tokenizes EXIT/CONTINUE as
 *      their own reserved-word token types, never IDENTIFIER. Fixed by
 *      giving `isParagraphName` an opt-in `allowReservedWord` flag,
 *      threaded only from the two genuine "paragraph name expected"
 *      call sites (parseProcedureDivision's main loop, parseDeclaratives'
 *      own loop) and ONLY while nothing has been established there yet
 *      (`!currentParagraph && !currentSection && division.paragraphs.length
 *      === 0 && division.sections.length === 0`) - the position i05's own
 *      repro program (a whole PROCEDURE DIVISION consisting of exactly one,
 *      implicitly-entered paragraph named EXIT) sits in, confirmed against
 *      installed GnuCOBOL. This guard is deliberately narrow: it does NOT
 *      turn every reserved-word-then-period into a name - the far more
 *      common `SOME-EXIT. EXIT.` idiom (a bare EXIT/CONTINUE used as an
 *      ordinary no-op statement, usually marking a PERFORM-THRU range's own
 *      end - see aa01/i08/p14/x12 in this corpus) has the exact same
 *      "reserved word then period" shape but occurs once a real paragraph is
 *      already open, so it is completely unaffected.
 *
 *   2. `generateMergeUsingFileLines` (generator/expression-gen.js) reused
 *      `generateOpen`'s own DECLARATIVES-invoking OPEN codegen verbatim for
 *      opening one of MERGE's own internal USING files - wrongly invoking a
 *      registered `USE AFTER STANDARD ERROR PROCEDURE ON <file>` handler on
 *      a missing/unreadable USING file, something real cobc never does for
 *      MERGE's own internal file access (confirmed against installed
 *      GnuCOBOL, i06: a missing USING file silently contributes zero
 *      records, no error, no handler call, and the other USING file(s)
 *      still merge normally). Fixed with a new, MERGE-specific
 *      `generateMergeUsingFileOpenLines` - opens the file into the same
 *      reader/iterator variables generateOpen's INPUT case would, but on any
 *      `java.io.IOException` just leaves the iterator empty (zero records)
 *      with NO FILE STATUS update and NO handler dispatch - instead of
 *      reusing generateOpen at all.
 *
 *      Investigating this finding's own repro (i06) surfaced a SEPARATE,
 *      previously-uncatalogued instance of round-19 finding 2's own already-
 *      accepted "GO TO escaping an implicit PERFORM-like range is a
 *      PERMANENT transfer in real COBOL, but this generator's method-call-
 *      based model can only ever resume normally" limitation: i06's OUTPUT
 *      PROCEDURE IS EMIT-PARA (no THRU - an implicit SINGLE-paragraph range)
 *      has an AT-END arm that does `GO TO EMIT-DONE`, a DIFFERENT, later
 *      paragraph never part of that one-paragraph range. Confirmed directly
 *      against installed GnuCOBOL (both via the harness and a hand-compiled
 *      `cobc -x` run): control never returns to the statement after MERGE
 *      once this fires - cobc's own i06 oracle stops at `MERGED=020 BBB`,
 *      never printing `MAIN-END`. This is NOT part of finding 2's own scope
 *      (it reproduces even with finding 2 fully fixed, and is unrelated to
 *      the DECLARATIVES/FILE-STATUS codegen finding 2 actually describes),
 *      and - per round-19's own established, deliberate precedent of
 *      declining the large, invasive "thrown control-flow signal + top-level
 *      trampoline" refactor a genuine fix would need - is handled the exact
 *      same HONEST-DECLINE way: `method-gen.js`'s existing
 *      `annotateGoToThruEscapes` collection pass now also treats a SORT/
 *      MERGE INPUT/OUTPUT PROCEDURE clause as an implicit range even with NO
 *      THRU at all (`{procedure: X, through: X}` reuses the exact same
 *      single-paragraph-range machinery an explicit `PERFORM X THRU X`
 *      would), so a GO TO escaping it gets the identical visible,
 *      compiling `TODO(round-19 finding 2)` marker `generateGoTo` already
 *      renders for an explicit PERFORM ... THRU escape - runtime behavior is
 *      UNCHANGED (i06 does not achieve a hard oracleCompare() pass, exactly
 *      like round-19's own h11), only its visibility improves.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/i05/i06 programs
 * provide via the data-driven oracle suite. This file targets the
 * individual parser/generator mechanisms each finding traces to, in
 * isolation (no cobc/scala-cli needed).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: a paragraph literally named EXIT/CONTINUE, in the one genuinely
// unambiguous position (nothing established yet in the PROCEDURE DIVISION).
// ---------------------------------------------------------------------------

describe('round-20 finding 1: a reserved word (EXIT/CONTINUE) in genuine paragraph-name position is parsed as a paragraph name, not dispatched to its own statement', () => {
  test('i05 shape: a whole PROCEDURE DIVISION consisting of exactly one implicit paragraph named EXIT runs its full body, not just an early return', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T20EXIT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       EXIT.
           DISPLAY "IN-EXIT-PARA".
           ADD 5 TO WS-X.
           DISPLAY "X=" WS-X.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // EXIT must become the paragraph's own method name, not a bare
    // "return // EXIT PARAGRAPH" - every statement in its body must survive.
    assert.match(scala, /def exit\(\): Unit =\s*\n\s*println\("IN-EXIT-PARA"\)/);
    assert.match(scala, /wsX = /);
    assert.match(scala, /println\("X="/);
    assert.match(scala, /sys\.exit\(0\)/);
    // Must NOT contain the old dishonest "immediately return, body unreachable"
    // shape - no bare `return` as the exit()/continue() method's own first line.
    assert.doesNotMatch(scala, /def exit\(\): Unit =\s*\n\s*return/);
  });

  test('a whole PROCEDURE DIVISION consisting of exactly one implicit paragraph named CONTINUE runs its full body too (same fix, the other affected reserved word)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T20CONT.
       PROCEDURE DIVISION.
       CONTINUE.
           DISPLAY "IN-CONTINUE-PARA".
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /def continue\(\): Unit =\s*\n\s*println\("IN-CONTINUE-PARA"\)/);
    assert.match(scala, /sys\.exit\(0\)/);
  });

  test('regression guard: the common "SOME-EXIT. EXIT." idiom (a bare EXIT statement marking a PERFORM-THRU range end) is completely unaffected - EXIT stays the no-op statement, not a second paragraph', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "HELLO".
           PERFORM SOME-PARA THRU SOME-EXIT.
           STOP RUN.
       SOME-PARA.
           DISPLAY "IN-SOME".
       SOME-EXIT.
           EXIT.
`;
    const scala = scalaOf(src);
    // SOME-EXIT is still its own real paragraph (not swallowed/split), whose
    // sole statement is still an ordinary EXIT-PARAGRAPH return.
    assert.match(scala, /def someExit\(\): Unit =\s*\n\s*return \/\/ EXIT PARAGRAPH/);
  });

  test('regression guard: CONTINUE used as an ordinary mid-paragraph no-op statement (not in paragraph-name position) is unaffected', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-X = 1
               CONTINUE
           ELSE
               DISPLAY "NO"
           END-IF.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // CONTINUE is a no-op statement, not a paragraph - no "def continue"
    // method should ever be synthesized for this shape.
    assert.doesNotMatch(scala, /def continue\(\)/);
  });

  test('regression guard: an ordinary (non-reserved-word) paragraph name at the very start of PROCEDURE DIVISION is unaffected', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "HI".
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /def mainPara\(\): Unit =/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: MERGE ... USING's own internal file open must not invoke a
// DECLARATIVES handler.
// ---------------------------------------------------------------------------

describe('round-20 finding 2: MERGE ... USING never invokes a DECLARATIVES handler for its own internal per-USING-file open, even when one is registered for that file name', () => {
  const i06Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T20MERGE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "T20IN1"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT IN-FILE-2 ASSIGN TO "T20NOSUCHFILE"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "T20SORTWK".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1 PIC X(6).
       FD  IN-FILE-2.
       01  IN-REC-2 PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05 M-KEY PIC 9(3).
           05 M-TAG PIC X(3).
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE2-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON IN-FILE-2.
       FILE2-ERR-PARA.
           DISPLAY "HANDLER: IN-FILE-2 ERROR".
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1 IN-FILE-2
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           DISPLAY "DONE".
`;

  test('i06 shape: the generated MERGE USING open for a file WITH a registered DECLARATIVES handler never calls that handler', () => {
    const scala = scalaOf(i06Shape);
    // The handler section's own wrapper method (what declarativeHandlerFor
    // resolves to, and what an ordinary OPEN's own catch block would call -
    // see the next test) is still generated (DECLARATIVES are unconditional
    // regardless of whether any USE target's file ever actually opens)...
    assert.match(scala, /def file2Err\(\): Unit =/);
    // ...but "file2Err()" as a CALL must never appear anywhere in the whole
    // program - its only occurrence is its own `def file2Err(): Unit =`
    // header. (Its own body separately, internally calls file2ErrPara() -
    // the section's own single paragraph - exactly like every other
    // DECLARATIVES section wrapper; that internal wiring is unrelated to
    // this fix and is not what's being asserted here.)
    const callSites = [...scala.matchAll(/\bfile2Err\(\)/g)];
    assert.equal(callSites.length, 1, 'file2Err() must only appear once, as its own def header, never as a call from the MERGE USING open codegen');
  });

  test('the MERGE USING open catches IOException and leaves the iterator empty - no FILE STATUS write, no handler dispatch of any kind', () => {
    const scala = scalaOf(i06Shape);
    assert.match(scala, /case _: java\.io\.IOException =>\s*\n\s*inFile2Iterator = Iterator\.empty/);
  });

  test('regression guard: an ordinary explicit OPEN statement (not MERGE) still invokes a registered DECLARATIVES handler on failure - untouched by this fix', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "NOPE"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE.
       01  IN-REC PIC X(6).
       PROCEDURE DIVISION.
       DECLARATIVES.
       IN-FILE-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON IN-FILE.
       IN-FILE-ERR-PARA.
           DISPLAY "HANDLER".
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-START.
           OPEN INPUT IN-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /case _: java\.io\.FileNotFoundException =>\s*\n\s*inFileErr\(\)/);
  });

  test('regression guard: a MERGE ... USING file with no DECLARATIVES handler registered at all still merges normally (pre-existing behavior, unaffected)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "IN1" ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "WORK".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1 PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05 M-KEY PIC 9(3).
           05 M-TAG PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           DISPLAY "DONE".
`;
    const scala = scalaOf(src);
    assert.match(scala, /inFile1Iterator = Iterator\.empty \/\/ MERGE USING IN-FILE-1: missing\/unreadable file/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 addendum (discovered, not part of finding 2's own described
// scope): a GO TO escaping a SORT/MERGE INPUT/OUTPUT PROCEDURE range - with
// or without an explicit THRU - now gets round-19 finding 2's own honest-
// decline marker too.
// ---------------------------------------------------------------------------

describe('round-20 finding-2 addendum: a GO TO escaping a SORT/MERGE PROCEDURE clause (even with no THRU at all) gets round-19\'s existing honest-decline marker', () => {
  test('i06 shape: OUTPUT PROCEDURE IS EMIT-PARA (no THRU) is its own implicit single-paragraph range - GO TO EMIT-DONE from inside it is marked', () => {
    const scala = scalaOf(`       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "IN1" ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "WORK".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1 PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05 M-KEY PIC 9(3).
           05 M-TAG PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1
               OUTPUT PROCEDURE IS EMIT-PARA.
           DISPLAY "MAIN-END".
           STOP RUN.
       EMIT-PARA.
           RETURN MERGE-FILE AT END GO TO EMIT-DONE.
           DISPLAY "MERGED=" M-KEY.
           GO TO EMIT-PARA.
       EMIT-DONE.
           EXIT.
`);
    assert.match(scala, /return emitDone\(\) \/\/ GO TO \/\/ TODO\(round-19 finding 2\): "EMIT-DONE" lies outside the enclosing PERFORM EMIT-PARA THRU EMIT-PARA range/);
  });

  test('regression guard: a MERGE/SORT OUTPUT PROCEDURE whose body has no GO TO at all (the pre-existing g12/h09 PERFORM UNTIL shape) is completely unaffected - no marker anywhere', () => {
    const scala = scalaOf(`       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE-1 ASSIGN TO "IN1" ORGANIZATION IS LINE SEQUENTIAL.
           SELECT MERGE-FILE ASSIGN TO "WORK".
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE-1.
       01  IN-REC-1 PIC X(6).
       SD  MERGE-FILE.
       01  MERGE-REC.
           05 M-KEY PIC 9(3).
           05 M-TAG PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-EOF PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MERGE MERGE-FILE ASCENDING KEY M-KEY
               USING IN-FILE-1
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       EMIT-PARA.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN MERGE-FILE AT END MOVE "Y" TO WS-EOF
               NOT AT END DISPLAY "MERGED=" M-KEY
           END-PERFORM.
`);
    assert.doesNotMatch(scala, /TODO\(round-19 finding 2\)/);
  });
});
