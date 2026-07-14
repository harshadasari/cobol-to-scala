/**
 * tests/round26-fixes.test.js
 *
 * Focused unit tests for the round-26 adversarial-refutation findings - see
 * tests/oracle/README.md's round-26 table for the full write-up and the
 * bb02/bb03/bb04/bb07 (root cause 1), bb10/bb13 (root cause 2 - RELATIVE
 * KEY addressing), bb09 (root cause 3 - START), bb11 (root cause 4 -
 * REDEFINES-over-OCCURS) promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification. Every production fix below was ALSO
 * independently verified with a real scala-cli compile/run against the
 * actual bb02/bb03/bb04/bb07/bb09/bb10/bb11/bb13 corpus programs (see the
 * round-26 README table for the exact captured output), matching cobc
 * byte-for-byte in every case.
 *
 *   1. (bb02/bb03/bb04/bb07) Round-25's `posVar > 0` REWRITE/DELETE guard
 *      had no `else` branch - an invalid REWRITE/DELETE (no prior READ, or a
 *      second one with no intervening READ) silently no-op'd instead of
 *      setting FILE STATUS "43" and invoking a registered DECLARATIVES
 *      handler. Fixed with a new `hasCurrentVar` flag per file (true only
 *      immediately after a successful READ, consumed by the REWRITE/DELETE
 *      that follows it) plus a real `else` branch.
 *
 *   2. (bb10/bb13) RANDOM/DYNAMIC access mode ignored the RELATIVE KEY
 *      entirely for READ/REWRITE/WRITE - ALL addressed the record by
 *      "whatever the sequential position currently is" instead of the
 *      file's current RELATIVE KEY value. Fixed by indexing directly into
 *      the same in-memory `bufVar` round-25 built, keyed by
 *      `isKeyedAccess`'s own access-mode/NEXT-PREVIOUS logic.
 *
 *   3. (bb09) `START` was a complete no-op (bare comment, no FILE STATUS).
 *      Implemented for real, reusing the same buffer/position machinery -
 *      plus a parser fix for `KEY IS GREATER THAN OR EQUAL` (previously
 *      mis-parsed) and a new bare `LESS THAN` operator branch.
 *
 *   4. (bb11) `writeRecordPlan` (and every GROUP_REGISTRY child-list
 *      consumer upstream of it) enumerated a REDEFINES target as an
 *      ADDITIONAL child instead of an alternate view over the same storage,
 *      producing a hard Vector[String]-vs-String compile error for
 *      WRITE/REWRITE of a record containing a REDEFINES-over-OCCURS item
 *      (and silently breaking a plain READ of the same record).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1 (bb02/bb03/bb04/bb07): REWRITE/DELETE's missing else-branch.
// ---------------------------------------------------------------------------

describe('round-26 finding 1 (bb02/bb04): REWRITE with no valid prior READ sets FILE STATUS "43" and does not mutate the buffer', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26RW.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26RWFILE.DAT"
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
           REWRITE SOME-REC.
           READ SOME-FILE.
           REWRITE SOME-REC.
           REWRITE SOME-REC.
           DELETE SOME-FILE.
           DELETE SOME-FILE.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('REWRITE/DELETE now guard on the new hasCurrentVar flag, not the old bare posVar > 0', () => {
    assert.match(scala, /var someFileHasCurrent: Boolean = false/);
    assert.match(scala, /if someFileBuf != null && someFileHasCurrent then/);
    assert.doesNotMatch(scala, /someFilePos > 0/);
  });

  test('an invalid REWRITE/DELETE\'s own else branch sets FILE STATUS "43" (not silently no-op)', () => {
    const matches = [...scala.matchAll(/wsStatus = "43"/g)];
    assert.ok(matches.length >= 2, 'expected at least 2 "43" assignments (REWRITE\'s and DELETE\'s own else branches)');
  });

  test('a successful READ sets hasCurrentVar true; REWRITE/DELETE consume it (set false) on success', () => {
    assert.match(scala, /someFileHasCurrent = true/);
    assert.match(scala, /someFileHasCurrent = false/);
  });

  test('regression guard: OPEN I-O still loads the buffer exactly as round-25 built it', () => {
    assert.match(scala, /someFileBuf = scala\.collection\.mutable\.ArrayBuffer\.from\(/);
  });
});

describe('round-26 finding 1 (bb07): an invalid REWRITE invokes a registered DECLARATIVES handler', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26DECL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26DECLFILE.DAT"
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
       DECLARATIVES.
       FILE-ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       FILE-ERR-PARA.
           DISPLAY "HANDLER-FIRED".
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN I-O SOME-FILE.
           REWRITE SOME-REC.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the REWRITE else branch calls the registered handler method', () => {
    assert.match(scala, /wsStatus = "43"\s*\n\s*fileErrSection\(\)/);
    assert.match(scala, /def fileErrSection\(\): Unit =[\s\S]*"HANDLER-FIRED"/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (bb10/bb13): RANDOM/DYNAMIC access RELATIVE KEY addressing.
// ---------------------------------------------------------------------------

describe('round-26 finding 2 (bb10): RANDOM-access READ indexes bufVar directly by the RELATIVE KEY value', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26RAND.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26RANDFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
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
           OPEN INPUT SOME-FILE.
           READ SOME-FILE
               INVALID KEY DISPLAY "BAD"
               NOT INVALID KEY DISPLAY "OK"
           END-READ.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('OPEN INPUT of a RANDOM-access file builds the SAME indexable buffer I-O uses (not a plain forward-only iterator)', () => {
    assert.match(scala, /someFileBuf = scala\.collection\.mutable\.ArrayBuffer\.from\(/);
  });

  test('READ addresses bufVar directly by (wsRkey).toInt, not the sequential iterator', () => {
    assert.match(scala, /if someFileBuf == null \|\| someFileBuf\.isEmpty then/);
    assert.match(scala, /else if \(wsRkey\)\.toInt >= 1 && \(wsRkey\)\.toInt <= someFileBuf\.length then/);
    assert.match(scala, /val _record = someFileBuf\(\(wsRkey\)\.toInt - 1\)/);
  });

  test('an empty buffer reports FILE STATUS "10"; an out-of-range key reports "23"', () => {
    assert.match(scala, /wsStatus = "10"/);
    assert.match(scala, /wsStatus = "23"/);
  });

  test('the INVALID KEY / NOT INVALID KEY clauses are wired to the resolved branches', () => {
    assert.match(scala, /"OK"/);
    assert.match(scala, /"BAD"/);
  });
});

describe('round-26 finding 2 (bb13): RANDOM-access REWRITE/WRITE auto-extend the buffer for a valid (positive) key, and reject a non-positive one', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26RWKEY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26RWKEYFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
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
           OPEN OUTPUT SOME-FILE.
           MOVE 99 TO REC-ID. MOVE "NOPE!" TO REC-VAL.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           REWRITE SOME-REC
               INVALID KEY DISPLAY "REWRITE-INVALID-KEY"
               NOT INVALID KEY DISPLAY "REWRITE-SUCCEEDED"
           END-REWRITE.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('OPEN OUTPUT of a RANDOM-access file starts a fresh EMPTY buffer instead of a plain PrintWriter', () => {
    assert.match(scala, /someFileBuf = new scala\.collection\.mutable\.ArrayBuffer\[String\]\(\)/);
  });

  test('WRITE (OUTPUT mode, RANDOM access) auto-extends the buffer for a positive key, rejects a non-positive one', () => {
    assert.match(scala, /if \(wsRkey\)\.toInt >= 1 then/);
    assert.match(scala, /while someFileBuf\.length < \(wsRkey\)\.toInt do someFileBuf\.append\(""\)/);
    assert.match(scala, /wsStatus = "24"/);
  });

  test('REWRITE (I-O mode, RANDOM access) uses the SAME auto-extend/keyed-index logic as WRITE, wired to its own INVALID KEY/NOT INVALID KEY clauses', () => {
    assert.match(scala, /"REWRITE-SUCCEEDED"/);
    assert.match(scala, /"REWRITE-INVALID-KEY"/);
  });

  test('regression guard: a SEQUENTIAL-access file\'s WRITE is completely unaffected (plain println, no keyed branch)', () => {
    const seqSrc = src.replace('ACCESS MODE IS RANDOM', 'ACCESS MODE IS SEQUENTIAL');
    const seqScala = scalaOf(seqSrc);
    assert.match(seqScala, /someFileWriter\.println/);
    assert.doesNotMatch(seqScala, /while someFileBuf\.length < /);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (bb09): START implemented for real.
// ---------------------------------------------------------------------------

describe('round-26 finding 3 (bb09): START positions posVar via the RELATIVE KEY comparison instead of a no-op comment', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26START.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26STARTFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
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
           OPEN INPUT SOME-FILE.
           MOVE 3 TO WS-RKEY.
           START SOME-FILE KEY IS GREATER THAN OR EQUAL WS-RKEY
               INVALID KEY DISPLAY "START-FAILED"
           END-START.
           READ SOME-FILE NEXT RECORD.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('START is no longer a bare comment - it computes a real candidate position and branches on it', () => {
    assert.doesNotMatch(scala, /\/\/ START .* - position file for reading/);
    assert.match(scala, /val _startCandidate = /);
    assert.match(scala, /if someFileBuf != null && _startCandidate >= 1 && _startCandidate <= someFileBuf\.length then/);
  });

  test('"GREATER THAN OR EQUAL" resolves to the >= candidate formula (max(key, 1)), not a mis-parsed field reference', () => {
    assert.match(scala, /\(wsRkey\)\.toInt\)\.max\(1\)/);
  });

  test('a resolved START sets FILE STATUS "00" and posVar for a subsequent sequential READ NEXT; an unresolved one sets "23" and runs the INVALID KEY statement', () => {
    assert.match(scala, /wsStatus = "00"/);
    assert.match(scala, /wsStatus = "23"/);
    assert.match(scala, /"START-FAILED"/);
  });

  test('DYNAMIC access + an explicit READ NEXT still uses the ordinary sequential iterator, not the keyed-READ branch', () => {
    assert.match(scala, /someFileIterator\.hasNext/);
  });
});

describe('round-26 finding 3 (parser): START KEY operator parsing', () => {
  function keyOperatorOf(clause) {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26STARTOP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26STARTOPFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT SOME-FILE.
           START SOME-FILE KEY IS ${clause} WS-RKEY.
           CLOSE SOME-FILE.
           STOP RUN.
`;
    return scalaOf(src);
  }

  test('"LESS THAN" (a bare operator with no branch of its own before this round) resolves to the < candidate formula', () => {
    const scala = keyOperatorOf('LESS THAN');
    assert.match(scala, /if \(wsRkey\)\.toInt > 1 then 1 else 0/);
  });

  test('"NOT LESS THAN" (the pre-existing >= idiom) still resolves to max(key, 1), unaffected by this round\'s GREATER-THAN-OR-EQUAL fix', () => {
    const scala = keyOperatorOf('NOT LESS THAN');
    assert.match(scala, /\(wsRkey\)\.toInt\)\.max\(1\)/);
  });

  test('plain "EQUAL TO" still resolves to the key itself', () => {
    const scala = keyOperatorOf('EQUAL TO');
    assert.match(scala, /val _startCandidate = \(wsRkey\)\.toInt\n/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (bb11): REDEFINES-over-OCCURS no longer double-counted in
// writeRecordPlan (and every other GROUP_REGISTRY child-list consumer).
// ---------------------------------------------------------------------------

describe('round-26 finding 4 (bb11): a REDEFINES-over-OCCURS target is skipped when building the base record\'s own WRITE/READ plan', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26REDEF.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26REDEFFILE.DAT"
               ORGANIZATION IS SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-FLAT   PIC X(10).
           05 REC-TABLE REDEFINES REC-FLAT.
              10 REC-ELEM PIC X(2) OCCURS 5 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE "XYXYXYXYXY" TO REC-FLAT.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           CLOSE SOME-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('WRITE renders only the base field (REC-FLAT), not a second REC-ELEM contribution', () => {
    assert.match(scala, /recFlat/);
    // The old bug's own exact shape: a SEPARATE fitLeft(recElem, 2) term
    // concatenated alongside recFlat's own - must never appear.
    assert.doesNotMatch(scala, /CobolFmt\.fitLeft\(recElem, 2\)/);
  });

  test('a bare READ still decodes the base field correctly (not degraded to an unsupported no-op by the REDEFINES sibling)', () => {
    assert.match(scala, /_parsed\.recFlat/);
    assert.doesNotMatch(scala, /READ into group record "someRec".*not supported/);
  });

  test('regression guard: an ordinary group with NO REDEFINES child is completely unaffected', () => {
    const plainSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T26PLAINGRP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "T26PLAINGRPFILE.DAT"
               ORGANIZATION IS SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-A PIC X(3).
           05 REC-B PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           WRITE SOME-REC.
           CLOSE SOME-FILE.
           STOP RUN.
`;
    const plainScala = scalaOf(plainSrc);
    assert.match(plainScala, /recA/);
    assert.match(plainScala, /recB/);
  });
});
