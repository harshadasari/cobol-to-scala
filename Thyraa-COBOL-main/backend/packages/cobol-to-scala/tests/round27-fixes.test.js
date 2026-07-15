/**
 * tests/round27-fixes.test.js
 *
 * Focused unit tests for the round-27 adversarial-refutation findings - see
 * tests/oracle/README.md's round-27 table for the full write-up and the
 * cc01/cc02/cc03/cc05/cc06/cc10/cc11 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification. Every production fix below
 * was ALSO independently verified with a real scala-cli compile/run against
 * the actual cc01-cc06/cc10/cc11 corpus programs (see the round-27 README
 * table for the exact captured output), matching cobc byte-for-byte in every
 * case except finding 8 (cc04), which has NO cobc oracle available in this
 * sandbox at all (see its own writeup) and is verified only as a non-crashing
 * decline.
 *
 *   1. (cc05) DELETE in RANDOM/DYNAMIC access mode never addressed the
 *      RELATIVE KEY directly (unlike READ/REWRITE/WRITE/START, round 26) -
 *      always required a prior READ, reporting "43" and doing nothing.
 *   2. (cc06) `parseDeleteStatement` never parsed `NOT INVALID KEY` at all -
 *      its trailing tokens were left unconsumed and misparsed as the start of
 *      the NEXT statement, corrupting/erasing that statement's own output.
 *      Also (companion gap found while fixing this): a plain (non-keyed) READ
 *      never even looked at its own INVALID KEY/NOT INVALID KEY clauses.
 *   3. (cc02) WRITE to an ALREADY-occupied RELATIVE KEY silently overwrote
 *      the existing record instead of reporting "22" (duplicate key) and
 *      leaving it untouched.
 *   4. (cc01) A "gap" slot the buffer auto-extended with a blank placeholder
 *      (WRITE/REWRITE's own "positive key always succeeds" rule) crashed with
 *      an IllegalArgumentException when READ - the placeholder was decoded as
 *      if it were real zoned-numeric field data.
 *   5. (cc10) A RECURSIVE program's own nested-def paragraph-fallthrough
 *      chaining erroneously ran a SORT's OUTPUT PROCEDURE immediately after
 *      its INPUT PROCEDURE (natural paragraph adjacency), on top of its own
 *      later, correct invocation - a double execution the ordinary
 *      (non-recursive) convention never has.
 *   6. (cc11) A field partially filled by STRING crashed on a numeric MOVE -
 *      `BigDecimal(rawExpr)` chokes on any embedded/trailing whitespace that
 *      a plain (non-edited) alphanumeric source can legitimately contain.
 *   7. (cc03) A failed START leaves a RELATIVE file's sequential position
 *      "undefined" - a subsequent READ NEXT fires NEITHER its AT END nor NOT
 *      AT END clause (though FILE STATUS still updates, to "46"), until a
 *      later SUCCESSFUL START repositions it.
 *   8. (cc04) `RECORD KEY IS <field>` (INDEXED files) was never parsed at
 *      all, and RANDOM/DYNAMIC access to an INDEXED file crashed with a
 *      NullPointerException (OPEN built a keyed-only handle, WRITE assumed a
 *      plain writer). No cobc oracle is available for INDEXED files in this
 *      sandbox, so this is fixed as a crash-to-honest-decline conversion
 *      only, not real RECORD-KEY semantics.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

const RELATIVE_FILE_HEADER = (access) => `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T27.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T27FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS ${access}
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(4) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
`;

// ---------------------------------------------------------------------------
// Finding 1 (cc05): DELETE in RANDOM/DYNAMIC mode addresses by RELATIVE KEY,
// no prior READ required.
// ---------------------------------------------------------------------------

describe('round-27 finding 1 (cc05): RANDOM-access DELETE addresses the record directly by RELATIVE KEY, no prior READ needed', () => {
  const src = `${RELATIVE_FILE_HEADER('RANDOM')}
           OPEN I-O SOME-FILE.
           MOVE 2 TO WS-RKEY.
           DELETE SOME-FILE RECORD
               INVALID KEY DISPLAY "BAD"
               NOT INVALID KEY DISPLAY "OK"
           END-DELETE.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  // round-29 finding 5 update: SOME-REC (shared RELATIVE_FILE_HEADER fixture)
  // has a determinable fixed record width (8 bytes), so the auto-extend
  // gap-fill placeholder is now a full-width all-NUL string, not the bare
  // `""` the pre-fix, newline-delimited model used - see tests/oracle/
  // README.md's round-29 entry (finding 5).
  test('DELETE resolves via generateKeyedDeleteStatement (a positive-key guard), not the old hasCurrentVar-gated guard', () => {
    assert.match(scala, /if \(wsRkey\)\.toInt >= 1 then/);
    assert.match(scala, /while someFileBuf\.length < \(wsRkey\)\.toInt do \{ someFileBuf\.append\(\("\\u0000" \* 8\)\); someFileOcc\.append\(false\) \}/);
  });

  test('the target slot is marked as a gap (blanked - a full-width all-NUL placeholder, occVar false), not removed/shifted', () => {
    assert.match(scala, /someFileBuf\(\(wsRkey\)\.toInt - 1\) = \("\\u0000" \* 8\)/);
    assert.match(scala, /someFileOcc\(\(wsRkey\)\.toInt - 1\) = false/);
    assert.doesNotMatch(scala, /someFileBuf\.remove\(\(wsRkey\)\.toInt - 1\)/);
  });

  test('a positive key always succeeds ("00"); a non-positive key reports "24" (matching WRITE/REWRITE, not "23")', () => {
    assert.match(scala, /"OK"/);
    assert.match(scala, /"BAD"/);
    assert.match(scala, /wsStatus = "24"/);
  });

  test('regression guard: SEQUENTIAL-access DELETE still uses the old hasCurrentVar-gated codegen, unaffected', () => {
    const seqScala = scalaOf(src.replace('ACCESS MODE IS RANDOM', 'ACCESS MODE IS SEQUENTIAL'));
    assert.match(seqScala, /if someFileBuf != null && someFileHasCurrent then/);
    assert.match(seqScala, /someFileBuf\.remove\(someFilePos - 1\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (cc06): DELETE's NOT INVALID KEY parsing, and plain READ's own
// INVALID KEY/NOT INVALID KEY handling.
// ---------------------------------------------------------------------------

describe('round-27 finding 2 (cc06): parseDeleteStatement now parses NOT INVALID KEY', () => {
  const src = `${RELATIVE_FILE_HEADER('SEQUENTIAL')}
           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           DELETE SOME-FILE RECORD
               INVALID KEY DISPLAY "DEL-BAD"
               NOT INVALID KEY DISPLAY "DEL-OK"
           END-DELETE.
           DISPLAY "AFTER STATUS=" WS-STATUS.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('NOT INVALID KEY statements are actually emitted (not dropped) on a valid DELETE', () => {
    assert.match(scala, /"DEL-OK"/);
  });

  test('the trailing DISPLAY after DELETE is NOT swallowed/corrupted by leftover unconsumed tokens', () => {
    assert.match(scala, /"AFTER STATUS="/);
  });
});

describe('round-27 finding 2 companion (cc06): a plain (non-keyed) READ now honors its own INVALID KEY / NOT INVALID KEY clauses', () => {
  const src = `${RELATIVE_FILE_HEADER('SEQUENTIAL')}
           OPEN INPUT SOME-FILE.
           READ SOME-FILE
               INVALID KEY DISPLAY "R-BAD"
               NOT INVALID KEY DISPLAY "R-OK"
           END-READ.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('NOT INVALID KEY is wired to the hasNext (record found) branch', () => {
    assert.match(scala, /if someFileIterator\.hasNext then/);
    assert.match(scala, /"R-OK"/);
  });

  test('the genuine end-of-file ("10") branch never runs INVALID KEY (matches round-26\'s own "status 10 is the AT-END family" rule)', () => {
    // "R-BAD" must never appear anywhere near the status-10 assignment - the
    // else branch only ever sets status/hasCurrentVar, nothing else.
    const elseBranch = scala.slice(scala.indexOf('someFileIterator.hasNext'));
    const tenIdx = elseBranch.indexOf('"10"');
    assert.ok(tenIdx > -1);
    assert.doesNotMatch(elseBranch.slice(tenIdx, tenIdx + 80), /R-BAD/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (cc02): WRITE to an occupied RELATIVE KEY reports "22", leaves
// the buffer untouched.
// ---------------------------------------------------------------------------

describe('round-27 finding 3 (cc02): a duplicate-key WRITE reports "22" and never overwrites', () => {
  const src = `${RELATIVE_FILE_HEADER('RANDOM')}
           OPEN I-O SOME-FILE.
           MOVE 1 TO WS-RKEY. MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL.
           WRITE SOME-REC
               INVALID KEY DISPLAY "DUP"
               NOT INVALID KEY DISPLAY "OK"
           END-WRITE.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('WRITE checks occVar for the target slot before writing', () => {
    assert.match(scala, /if someFileOcc\(\(wsRkey\)\.toInt - 1\) then/);
  });

  test('an occupied slot reports "22" and runs INVALID KEY; only the else (unoccupied) branch actually writes', () => {
    assert.match(scala, /wsStatus = "22"/);
    assert.match(scala, /"DUP"/);
    // the actual write (bufVar assignment + occVar = true) must be in the
    // ELSE of the occupied-check, not unconditional.
    const dupIdx = scala.indexOf('someFileOcc((wsRkey).toInt - 1) then');
    const afterDup = scala.slice(dupIdx);
    const elseMatch = afterDup.match(/\n\s*else\s*\n/);
    assert.ok(elseMatch, 'expected an else branch right after the occupied-check');
    const elseIdx = elseMatch.index;
    assert.match(afterDup.slice(elseIdx), /someFileBuf\(\(wsRkey\)\.toInt - 1\) = /);
    assert.match(afterDup.slice(elseIdx), /someFileOcc\(\(wsRkey\)\.toInt - 1\) = true/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (cc01): a never-written gap slot reads back as invalid (status
// "23"), not a decode crash.
// ---------------------------------------------------------------------------

describe('round-27 finding 4 (cc01): a gap slot (auto-extended, never written) reports "23" on READ instead of crashing', () => {
  const src = `${RELATIVE_FILE_HEADER('RANDOM')}
           OPEN INPUT SOME-FILE.
           MOVE 2 TO WS-RKEY.
           READ SOME-FILE
               INVALID KEY DISPLAY "GAP"
               NOT INVALID KEY DISPLAY "REAL ID=" REC-ID
           END-READ.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the success condition additionally requires occVar(key - 1), not just in-range', () => {
    assert.match(scala, /else if \(wsRkey\)\.toInt >= 1 && \(wsRkey\)\.toInt <= someFileBuf\.length && someFileOcc\(\(wsRkey\)\.toInt - 1\) then/);
  });

  test('a gap slot falls into the SAME invalid-key branch an out-of-range key already used (no separate crash path)', () => {
    assert.match(scala, /"GAP"/);
  });

  // round-29 finding 5 update: SOME-REC's determinable fixed record width
  // (8 bytes) routes this buffer load through the fixed-width byte-chunking
  // model, whose own occVar-reload heuristic tests each chunk against a
  // full-width all-NUL placeholder (every real chunk is always exactly 8
  // characters, so the bare `""`/`_.nonEmpty` check the pre-fix, newline-
  // delimited model used can no longer occur at all) - see tests/oracle/
  // README.md's round-29 entry (finding 5).
  test('OPEN builds occVar alongside bufVar (a slot reloaded from disk is occupied unless its own chunk is the full-width all-NUL placeholder)', () => {
    assert.match(scala, /someFileOcc = scala\.collection\.mutable\.ArrayBuffer\.from\(someFileBuf\.map\(_ != "\\u0000" \* 8\)\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 5 (cc10): SORT's own INPUT/OUTPUT PROCEDURE paragraphs must not
// auto-fallthrough into the next paragraph inside a RECURSIVE program.
// ---------------------------------------------------------------------------

describe('round-27 finding 5 (cc10): a RECURSIVE program\'s nested-def paragraphs never auto-chain out of a SORT INPUT/OUTPUT PROCEDURE paragraph', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T27MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T27SUB" USING WS-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T27SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "T27SORTWK".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY    PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           SORT SORT-FILE ASCENDING KEY SORT-KEY
               INPUT PROCEDURE FILL-SORT
               OUTPUT PROCEDURE SHOW-SORT.
           GOBACK.
       FILL-SORT.
           MOVE LS-DEPTH TO SORT-KEY.
           RELEASE SORT-REC.
       SHOW-SORT.
           RETURN SORT-FILE AT END DISPLAY "EMPTY".
           DISPLAY "SORTED KEY=" SORT-KEY.
       END PROGRAM T27SUB.
       END PROGRAM T27MAIN.
`;
  const scala = scalaOf(src);

  test('the RECURSIVE entry body\'s own fillSort() nested def does NOT auto-chain into showSort()', () => {
    // The RECURSIVE program's own entry() method (method-gen.js's
    // generateProgramFlowLinesNested) renders every paragraph as a nested def
    // via closures (_get0/_set0), not a plain LINKAGE parameter name - find
    // ITS OWN copy of fillSort/showSort (not the top-level, non-recursive
    // flat methods generateAllMethods ALSO always emits) by anchoring on the
    // `def entry(` this convention always uses.
    const entryIdx = scala.indexOf('def entry(_get0');
    assert.ok(entryIdx > -1, 'expected a RECURSIVE program entry() method with LINKAGE getter/setter closures');
    const entryBody = scala.slice(entryIdx);
    // round-29 REGRESSION fix: every nested def in this RECURSIVE entry body
    // now takes a `_chain: Boolean = false` parameter (method-gen.js's
    // renderNestedFallthroughDefs - see its own doc comment) gating the
    // auto-chain tail call instead of a bare `(): Unit =` signature.
    const fillSortMatch = entryBody.match(/def fillSort\(_chain: Boolean = false\): Unit =\s*\n([\s\S]*?)\n(\s*)def showSort/);
    assert.ok(fillSortMatch, 'expected a nested def fillSort followed eventually by def showSort inside the RECURSIVE entry body');
    assert.doesNotMatch(fillSortMatch[1], /showSort\(_chain = true\)\s*\/\/ implicit fall-through/);
  });

  test('SORT\'s own machinery still calls showSort() for real, after the sort itself', () => {
    assert.match(scala, /showSort\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 6 (cc11): a plain alphanumeric MOVE source into a numeric target
// tolerates embedded/trailing whitespace via CobolFmt.numval.
// ---------------------------------------------------------------------------

describe('round-27 finding 6 (cc11): MOVE of a plain (non-edited) alphanumeric field into a numeric target routes through CobolFmt.numval', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T27NUM.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-KEYSTR     PIC X(4).
       01  WS-RKEY       PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING "042" DELIMITED BY SIZE INTO WS-KEYSTR.
           MOVE WS-KEYSTR TO WS-RKEY.
           DISPLAY WS-RKEY.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the numeric MOVE uses CobolFmt.numval(...), not a bare BigDecimal(...) that chokes on whitespace', () => {
    assert.match(scala, /CobolFmt\.truncNumeric\(CobolFmt\.numval\(wsKeystr\), 4, 0\)/);
    assert.doesNotMatch(scala, /CobolFmt\.truncNumeric\(BigDecimal\(wsKeystr\), 4, 0\)/);
  });

  test('regression guard: a genuine numeric-to-numeric MOVE still uses plain BigDecimal (no string parsing at all)', () => {
    const src2 = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T27NUM2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC 9(4).
       01  WS-B  PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 42 TO WS-A.
           MOVE WS-A TO WS-B.
           STOP RUN.
`;
    const scala2 = scalaOf(src2);
    assert.match(scala2, /CobolFmt\.truncNumeric\(BigDecimal\(wsA\), 4, 0\)/);
  });

  test('regression guard: a numeric-edited source still uses CobolFmt.numval exactly as round-5 finding 6 established', () => {
    const src3 = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T27NUM3.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-EDITED PIC ZZ9.
       01  WS-NUM    PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-EDITED TO WS-NUM.
           STOP RUN.
`;
    const scala3 = scalaOf(src3);
    assert.match(scala3, /CobolFmt\.numval\(wsEdited\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 7 (cc03): a failed START leaves the file's sequential position
// undefined - a subsequent READ NEXT fires neither AT END nor NOT AT END.
// ---------------------------------------------------------------------------

describe('round-27 finding 7 (cc03): a failed START sets a per-file flag a subsequent plain READ consults', () => {
  const src = `${RELATIVE_FILE_HEADER('DYNAMIC')}
           OPEN I-O SOME-FILE.
           MOVE 99 TO WS-RKEY.
           START SOME-FILE KEY IS GREATER THAN WS-RKEY
               INVALID KEY DISPLAY "START-FAILED"
           END-START.
           READ SOME-FILE NEXT RECORD
               AT END DISPLAY "AT-END"
               NOT AT END DISPLAY "GOT-RECORD"
           END-READ.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('a failed START sets someFileStartInvalid = true', () => {
    assert.match(scala, /someFileStartInvalid = true/);
  });

  test('a successful START clears it (someFileStartInvalid = false)', () => {
    assert.match(scala, /someFileStartInvalid = false/);
  });

  test('the subsequent plain READ NEXT is wrapped in a someFileStartInvalid guard that runs NEITHER clause and sets FILE STATUS "46"', () => {
    const readIdx = scala.indexOf('READNEXT') > -1 ? scala.indexOf('READNEXT') : scala.lastIndexOf('someFileIterator.hasNext');
    assert.match(scala, /if someFileStartInvalid then/);
    const guardIdx = scala.indexOf('if someFileStartInvalid then');
    const guardBlock = scala.slice(guardIdx, guardIdx + 200);
    assert.match(guardBlock, /wsStatus = "46"/);
    assert.doesNotMatch(guardBlock, /AT-END|GOT-RECORD/);
  });

  test('declaring var defaults to false (a program that never uses START is completely unaffected)', () => {
    assert.match(scala, /var someFileStartInvalid: Boolean = false/);
  });
});

// ---------------------------------------------------------------------------
// Finding 8 (cc04): RECORD KEY parsing + INDEXED/RANDOM crash-to-decline.
// ---------------------------------------------------------------------------

describe('round-27 finding 8 (cc04): ORGANIZATION IS INDEXED + RANDOM/DYNAMIC access declines honestly instead of crashing', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T27IDX.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IDX-FILE ASSIGN TO "T27IDXFILE.DAT"
               ORGANIZATION IS INDEXED
               ACCESS MODE IS RANDOM
               RECORD KEY IS REC-ID
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  IDX-FILE.
       01  IDX-REC.
           05  REC-ID    PIC 9(3).
           05  REC-VAL   PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-STATUS     PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT IDX-FILE.
           MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL.
           WRITE IDX-REC.
           CLOSE IDX-FILE.
           OPEN I-O IDX-FILE.
           MOVE 1 TO REC-ID.
           READ IDX-FILE
               INVALID KEY DISPLAY "BAD"
               NOT INVALID KEY DISPLAY "OK"
           END-READ.
           CLOSE IDX-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('OPEN/WRITE/READ all degrade to a visible, compiling TODO decline - no writer/bufVar mismatch', () => {
    assert.match(scala, /TODO: OPEN OUTPUT IDX-FILE: ORGANIZATION IS INDEXED with RANDOM\/DYNAMIC access/);
    assert.match(scala, /TODO: WRITE IDX-REC: ORGANIZATION IS INDEXED with RANDOM\/DYNAMIC access/);
    assert.match(scala, /TODO: OPEN I-O IDX-FILE: ORGANIZATION IS INDEXED with RANDOM\/DYNAMIC access/);
    assert.match(scala, /TODO: READ IDX-FILE: ORGANIZATION IS INDEXED with RANDOM\/DYNAMIC access/);
  });

  test('the generated code never references idxFileWriter at all for this file (the exact pre-fix NullPointerException site)', () => {
    assert.doesNotMatch(scala, /idxFileWriter\.println/);
  });

  test('regression guard: a SEQUENTIAL-access INDEXED file (the ordinary, already-working case) is completely unaffected', () => {
    const seqSrc = src.replace('ACCESS MODE IS RANDOM', 'ACCESS MODE IS SEQUENTIAL');
    const seqScala = scalaOf(seqSrc);
    assert.doesNotMatch(seqScala, /TODO: OPEN OUTPUT IDX-FILE: ORGANIZATION IS INDEXED/);
    assert.match(seqScala, /idxFileWriter/);
  });

  test('regression guard: a plain RELATIVE file with RANDOM access (this generator\'s real, implemented case) is completely unaffected', () => {
    const relSrc = `${RELATIVE_FILE_HEADER('RANDOM')}
           OPEN OUTPUT SOME-FILE.
           STOP RUN.
`;
    const relScala = scalaOf(relSrc);
    assert.doesNotMatch(relScala, /TODO: OPEN OUTPUT SOME-FILE: ORGANIZATION IS INDEXED/);
  });
});
