/**
 * tests/round25-fixes.test.js
 *
 * Focused unit tests for the round-25 adversarial-refutation findings - see
 * tests/oracle/README.md's round-25 table for the full write-up and the
 * o01-o04/o13 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification (o14, root cause 4, is a documented
 * Known Gap - see that section of the README - and is intentionally NOT
 * covered here beyond a `t.todo`-shaped acknowledgement in the oracle suite
 * itself). This file targets the individual generator mechanisms each
 * finding traces to, in isolation (no cobc/scala-cli needed) - though every
 * production fix below was ALSO independently verified with a real
 * scala-cli compile/run against the actual o01/o02/o03/o04/o13 corpus
 * programs (see the round-25 README table for the exact captured output).
 *
 *   1. (o01/o02/o03) `OPEN I-O` never initialized the read iterator at all -
 *      any READ after it always reported FILE STATUS 10 (no record). Fixed
 *      by loading the file into an in-memory, position-tracked line buffer
 *      (the same "line per record" storage model READ/WRITE already use)
 *      and adapting `iteratorVar` over it. REWRITE/DELETE were bare COMMENT
 *      no-ops with no runtime effect and no visible marker - now genuinely
 *      mutate that same buffer (REWRITE overwrites the current record in
 *      place, DELETE removes it), and CLOSE flushes the buffer back to disk.
 *
 *   2. (o04) `SET WS-FLAG-OK(2) TO TRUE` (a level-88 condition-name whose
 *      parent field is itself an OCCURS table element) crashed at compile
 *      time - `generateSet`'s level-88 branch resolved the parent field's
 *      own flat var name correctly but silently dropped the SET target's
 *      own subscript, emitting a bare scalar assignment against what is
 *      actually a `Vector[...]`. Now threads the subscript through
 *      `renderCamelAssignment`, the same shared subscripted-write primitive
 *      every other write already uses.
 *
 *   3. (o13) `PERFORM x OF secA THRU y OF secA` inside a RECURSIVE program
 *      crashed at compile time, then (once that was fixed) produced wrong
 *      values. Two separate bugs: (a) `resolveParagraphMethodName` qualifies
 *      a colliding bare paragraph name by its OWN section, which collapses
 *      onto the SAME name when TWO different paragraphs share both the bare
 *      name AND the section (reproducible with no RECURSIVE/THRU involved at
 *      all) - fixed by falling back to the paragraph's own full name in that
 *      case. (b) a PERFORM ... THRU wrapper method is always generated as a
 *      single shared TOP-LEVEL method, but a RECURSIVE program's own
 *      paragraphs are nested `def`s inside `entry()` closing over that call's
 *      own LINKAGE getter/setter closures - the shared wrapper's own nested
 *      defs closed over nothing. Fixed by also generating a nested-local
 *      counterpart of the SAME wrapper method name inside `entry()`, so
 *      Scala's own lexical shadowing resolves the (unchanged) call site to
 *      the correct, activation-local version.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/o01/o02/o03/o04/o13
 * programs provide via the data-driven oracle suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1 (o01/o02/o03): OPEN I-O's iterator + real REWRITE/DELETE.
// ---------------------------------------------------------------------------

describe('round-25 finding 1 (o01/o02/o03): OPEN I-O initializes the read iterator; REWRITE/DELETE are real, not comment stubs', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T25IO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T25FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           MOVE "ZZZZZ" TO REC-VAL.
           REWRITE SOME-REC.
           DELETE SOME-FILE.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  // round-29 finding 5 update: SOME-REC (`05 REC-ID PIC 9(3). 05 REC-VAL PIC
  // X(5).` = 8 bytes) now has a determinable fixed record length, and
  // SOME-FILE declares ORGANIZATION IS RELATIVE - so OPEN I-O now loads the
  // buffer via the new fixed-WIDTH byte-chunking model (fixedWidthLoadLines,
  // file-io-gen.js) instead of `getLines()` (see tests/oracle/README.md's
  // round-29 entry, finding 5 - a 0x0A byte inside a binary-encoded field's
  // own value must never be treated as a record delimiter). `someFilePos`/
  // `someFileIterator`'s own shape is completely unchanged either way - only
  // how `someFileBuf` itself gets populated differs.
  test('OPEN I-O loads the file into a position-tracked in-memory buffer (fixed-width byte chunks) and adapts iteratorVar over it', () => {
    assert.match(scala, /val _someFileRelBytes = java\.nio\.file\.Files\.readAllBytes\(someFileFile\.toPath\)/);
    assert.match(scala, /someFileBuf = scala\.collection\.mutable\.ArrayBuffer\.tabulate\(_someFileRelCount\)/);
    assert.match(scala, /someFilePos = 0/);
    assert.match(scala, /someFileIterator = new Iterator\[String\]/);
    assert.match(scala, /def hasNext: Boolean = someFilePos < someFileBuf\.length/);
    assert.match(scala, /def next\(\): String = \{ val _v = someFileBuf\(someFilePos\); someFilePos \+= 1; _v \}/);
  });

  // round-26 root cause 1 update: the guard below is now `hasCurrentVar`
  // (not the bare `posVar > 0` this round-25 assertion originally checked)
  // and has a real `else` branch (FILE STATUS "43" + a DECLARATIVES handler
  // if registered) instead of silently no-op'ing - see tests/oracle/
  // README.md's round-26 entry and tests/round26-fixes.test.js for the full
  // write-up/coverage of that fix. Still verifies REWRITE/DELETE are real
  // buffer mutations, not bare comment stubs - round-25's own original
  // point here is unchanged, only the exact guard shape is.
  test('REWRITE overwrites the current (most-recently-READ) buffer slot in place - no bare comment stub', () => {
    assert.match(scala, /if someFileBuf != null && someFileHasCurrent then/);
    assert.match(scala, /someFileBuf\(someFilePos - 1\) = /);
    assert.doesNotMatch(scala, /\/\/ REWRITE .* update current record in file/);
  });

  test('DELETE removes the current buffer slot and rewinds the position counter - no bare comment stub', () => {
    assert.match(scala, /if someFileBuf != null && someFileHasCurrent then/);
    assert.match(scala, /someFileBuf\.remove\(someFilePos - 1\)/);
    assert.match(scala, /someFilePos -= 1/);
    assert.doesNotMatch(scala, /\/\/ DELETE record from/);
  });

  // round-29 finding 5 update: SOME-FILE has a determinable fixed record
  // length (see the previous test's own note), so CLOSE now flushes the
  // buffer back to disk as RAW, undelimited bytes (a plain
  // `java.io.FileOutputStream`/`.write(...)`) instead of a
  // `PrintWriter`/`.println` per record - the old model appended a `\n`
  // after every record, indistinguishable on the next OPEN from an embedded
  // 0x0A byte inside a binary-encoded field's own value (see this file's
  // ee06 counterpart in tests/oracle/README.md's round-29 entry).
  test('CLOSE flushes the I-O buffer back to disk (raw, undelimited fixed-width bytes) before closing the other (unused) handles', () => {
    // round-32 finding 2 (hh02): CLOSE also captures this file's own content
    // fingerprint (someFileSig) from the exact buffer content just flushed,
    // before nulling it - see tests/round32-fixes.test.js/tests/oracle/
    // README.md's round-32 entry.
    assert.match(scala, /if someFileBuf != null then \{ val _fos = new java\.io\.FileOutputStream\(someFileFile\); try someFileBuf\.foreach\(r => _fos\.write\(r\.getBytes\(java\.nio\.charset\.StandardCharsets\.ISO_8859_1\)\)\) finally _fos\.close\(\); someFileSig = someFileBuf\.mkString; someFileBuf = null \}/);
  });

  // round-29 finding 5 update: a plain OPEN INPUT of a RELATIVE-organization
  // file with a determinable record length ALSO now uses the fixed-width
  // byte-chunking model (not just I-O/RANDOM/DYNAMIC access) - `getLines()`
  // is exactly the newline-delimited-text bug this round fixes, so it is no
  // longer used for ANY access mode of such a file. `someFileIterator`
  // itself stays an opaque `Iterator[String]` either way - no downstream
  // READ codegen needed any change at all.
  test('regression guard: OPEN INPUT/OUTPUT are completely unaffected (no buffer/position codegen in their own branches)', () => {
    const inputOnlySrc = src.replace('OPEN I-O SOME-FILE.', 'OPEN INPUT SOME-FILE.').replace(/\n\s*MOVE "ZZZZZ".*\n\s*REWRITE SOME-REC\.\n\s*DELETE SOME-FILE\./, '');
    const inputScala = scalaOf(inputOnlySrc);
    assert.match(inputScala, /someFileChunks\.iterator/);
    assert.doesNotMatch(inputScala, /someFileReader\.getLines\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (o04): SET condition-name(idx) TO TRUE on an OCCURS table child.
// ---------------------------------------------------------------------------

describe('round-25 finding 2 (o04): SET cond-name(idx) TO TRUE on a subscripted OCCURS table element threads the subscript through', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T25SET88.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-FLAG PIC X OCCURS 3 TIMES.
               88 WS-FLAG-OK VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET WS-FLAG-OK(2) TO TRUE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the subscripted write goes through the shared Vector .updated(...) primitive, not a bare scalar assignment', () => {
    assert.match(scala, /wsFlag = wsFlag\.updated\(1, "Y"\)/);
    assert.doesNotMatch(scala, /\n\s*wsFlag = "Y"/);
  });

  test('regression guard: an UNSUBSCRIPTED condition-name (the ordinary, pre-existing shape) still emits a bare assignment', () => {
    const plainSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T25SET88B.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X VALUE "N".
           88 WS-FLAG-OK VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET WS-FLAG-OK TO TRUE.
           STOP RUN.
`;
    const plainScala = scalaOf(plainSrc);
    assert.match(plainScala, /\n\s*wsFlag = "Y"/);
    assert.doesNotMatch(plainScala, /wsFlag\.updated/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (o13): qualified PERFORM THRU inside a RECURSIVE program's own
// nested-paragraph convention.
// ---------------------------------------------------------------------------

describe('round-25 finding 3a: two paragraphs sharing a bare (numeric-prefix-stripped) name AND their enclosing section no longer collide', () => {
  // Reduced from o13's own shape - deliberately NOT recursive and NOT using
  // PERFORM ... THRU at all, to isolate finding 3a (the paragraph-naming
  // collision itself) from finding 3b (the separate RECURSIVE/THRU
  // interaction) - this collision is reproducible with neither ingredient.
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T25COLMAIN.
       PROCEDURE DIVISION.
       MAIN-SECTION SECTION.
       MAIN-ENTRY.
           PERFORM 1000-PARA.
           STOP RUN.
       SEC-A SECTION.
       1000-PARA.
           DISPLAY "A1".
       2000-PARA.
           DISPLAY "A2".
       SEC-B SECTION.
       1000-PARA.
           DISPLAY "B1".
`;
  const scala = scalaOf(src);

  test('the two same-section, same-bare-name paragraphs get distinct, collision-free method names', () => {
    assert.match(scala, /def secA1000Para\(\): Unit =/);
    assert.match(scala, /def secA2000Para\(\): Unit =/);
  });

  test('the old, colliding name is never generated', () => {
    assert.doesNotMatch(scala, /def secAPara\(\): Unit =/);
  });

  test('regression guard: a bare name colliding only ACROSS different sections (the ordinary, pre-existing case) still uses the simple section-qualified name', () => {
    assert.match(scala, /def secBPara\(\): Unit =/);
  });
});

describe('round-25 finding 3b: PERFORM ... THRU inside a RECURSIVE program gets its own nested-local wrapper, not just the shared top-level one', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T25PTMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T25PTSUB" USING WS-N.
           STOP RUN.
       END PROGRAM T25PTMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T25PTSUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           PERFORM PARA-A THRU PARA-B.
           GOBACK.
       PARA-A.
           DISPLAY "A " LS-N.
       PARA-B.
           DISPLAY "B " LS-N.
       END PROGRAM T25PTSUB.
`;
  const scala = scalaOf(src);
  const nestedStart = scala.indexOf('def entry(_get0');

  test('the RECURSIVE program has a nested getter/setter entry() (sanity check for the shape under test)', () => {
    assert.ok(nestedStart >= 0, 'expected a generateRecursiveEntryMethod entry() in the generated Scala');
  });

  test('the shared top-level wrapper method still exists (used by any non-recursive caller/dead-code copy)', () => {
    const beforeNested = scala.slice(0, nestedStart);
    assert.match(beforeNested, /\n  def paraAToParaB\(\): Unit =/);
  });

  test('a NESTED-local counterpart of the identical wrapper method name also exists inside entry() (shadows the top-level one via ordinary Scala lexical scoping)', () => {
    const nestedBody = scala.slice(nestedStart);
    assert.match(nestedBody, /\n\s+def paraAToParaB\(\): Unit =/);
    // The nested wrapper's own nested paragraphs must reference the LOCAL
    // getter (`lsN`), not escape back out to a module-level var - since this
    // program's LINKAGE parameter has no module-level var at all (round-21
    // finding 2), the mere presence of a working `lsN` reference inside this
    // region confirms it resolves through the local getter/setter pair.
    assert.match(nestedBody, /lsN/);
  });

  test('regression guard: an ORDINARY (non-recursive) program with the identical PERFORM ... THRU shape gets only the plain top-level wrapper, no nested entry() at all', () => {
    const ordinarySrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T25PTORD.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-A THRU PARA-B.
           STOP RUN.
       PARA-A.
           DISPLAY "A".
       PARA-B.
           DISPLAY "B".
`;
    const ordinaryScala = scalaOf(ordinarySrc);
    assert.doesNotMatch(ordinaryScala, /def entry\(_get0/);
    assert.match(ordinaryScala, /\n  def paraAToParaB\(\): Unit =/);
  });
});
