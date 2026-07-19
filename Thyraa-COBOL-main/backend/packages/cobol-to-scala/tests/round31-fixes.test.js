/**
 * tests/round31-fixes.test.js
 *
 * Focused unit tests for round-31 adversarial-refutation findings - see
 * tests/oracle/README.md's round-31 table for the full write-up and the
 * gg01/gg05/gg15 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs, matching cobc byte-for-byte).
 *
 *   1. (gg15) `parseReadStatement` (parser/procedure-parser.js) had TWO
 *      independent, unconditional `if (ctx.matchValue('NOT'))` checks in
 *      sequence (NOT AT END, then NOT INVALID KEY). A `READ ... NOT INVALID
 *      KEY ...` with neither a preceding AT END nor INVALID KEY clause had
 *      its NOT token greedily consumed by the FIRST (AT-END-oriented) check,
 *      which then mis-parsed the following INVALID/KEY tokens as the start
 *      of a (bogus) NOT-AT-END statement block - silently dropping the real
 *      NOT INVALID KEY clause and its imperative statements entirely, with
 *      no crash or marker of any kind.
 *   2. (gg01) round-30 finding 2's occVar-reuse fix ("trust the in-memory
 *      occVar once it's non-null, only rebuild from content on this file's
 *      true first open") assumed no OTHER actor could have changed this
 *      file's on-disk bytes between this logical file's own open/close
 *      cycles. That's false when two DIFFERENT logical files (two different
 *      SELECT/FD entries) share the same ASSIGN TO physical path - one can
 *      rewrite the shared file (different size/content) while the other is
 *      closed, leaving the other's own persisted occVar stale the moment it
 *      reopens. The freshly-reloaded bufVar's own record count is always
 *      trustworthy; comparing it against the persisted occVar's own length
 *      distinguishes "genuinely the same file" (lengths match, reuse) from
 *      "some other actor changed this file's shape" (lengths differ,
 *      rebuild from content exactly like a true first open).
 *   3. (gg05) round-30 finding 3's own `&& !containsTable` exclusion meant a
 *      record combining a signed DISPLAY field with an unrelated OCCURS
 *      table (even a plain, non-ODO, fixed-size table of ordinary DISPLAY
 *      elements) still fell through to the old marker-byte text convention,
 *      reproducing the exact `zonedDecode: non-digit data` crash round-30
 *      finding 3 was meant to close. case-class-gen.js's byte-level codec
 *      already fully supports a plain OCCURS table of (signed or unsigned)
 *      DISPLAY elements - round-30 finding 1's own `allowTables` parameter
 *      already threads a table's flat Vector var straight through as a
 *      constructor argument - so dropping the exclusion (checking
 *      containsSignedDisplay alone, exactly like containsNonDisplay) is
 *      what actually fixes this, gated by the same allowTables restriction
 *      (RELATIVE-organization file with a determinable maximum record byte
 *      width) finding 1 already established.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 3 in the briefing / finding 1 fixed first (gg15): a bare `NOT
// INVALID KEY` (no preceding AT END/INVALID KEY) is no longer silently
// dropped by parseReadStatement's own NOT-AT-END lookahead.
// ---------------------------------------------------------------------------

describe('round-31 finding 3 (gg15): bare READ ... NOT INVALID KEY (no preceding AT END/INVALID KEY) is no longer dropped', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31NIKBARE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T31NIK.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-VAL     PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               NOT INVALID KEY
                   DISPLAY "FOUND VAL=" REC-VAL
           END-READ.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the NOT INVALID KEY body (the DISPLAY) reaches the generated code, not silently vanishing', () => {
    assert.match(scala, /println\("FOUND VAL=" \+/);
  });
});

describe('round-31 finding 3 regression: NOT AT END (with no preceding AT END) still parses correctly', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31NOTATEND.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T31NAE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-VAL     PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT REL-FILE.
           READ REL-FILE
               NOT AT END
                   DISPLAY "GOT VAL=" REC-VAL
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the NOT AT END body still reaches the generated code', () => {
    assert.match(scala, /println\("GOT VAL=" \+/);
  });
});

describe('round-31 finding 3 regression: paired INVALID KEY ... NOT INVALID KEY (cc06\'s own idiom) still parses correctly', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31PAIRED.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T31PAIR.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-VAL     PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "BAD-KEY"
               NOT INVALID KEY
                   DISPLAY "FOUND VAL=" REC-VAL
           END-READ.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('both the INVALID KEY and NOT INVALID KEY bodies reach the generated code', () => {
    assert.match(scala, /println\("BAD-KEY"\)/);
    assert.match(scala, /println\("FOUND VAL=" \+/);
  });
});

// ---------------------------------------------------------------------------
// Finding 1 in the briefing (gg01): occVar is rebuilt from content whenever
// the freshly-reloaded bufVar's own length disagrees with the persisted
// occVar's own length (a different logical file rewrote the shared physical
// path), not just when occVar is null.
// ---------------------------------------------------------------------------

describe('round-31 finding 1 (gg01): occVar reload also rebuilds on a length mismatch, not just when null', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31STALEOCC.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "T31SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-A
               FILE STATUS IS WS-STATUS-A.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05  VAL-A       PIC 9(4).
       WORKING-STORAGE SECTION.
       01  WS-RKEY-A       PIC 9(3) VALUE 0.
       01  WS-STATUS-A     PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN I-O FILE-A.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the recLen (fixed-width RELATIVE) occVar reload check compares null-ness AND length (round-32 finding 2 additionally appends a content-fingerprint check to this same condition - see round32-fixes.test.js)', () => {
    assert.match(scala, /if fileAOcc == null \|\| fileAOcc\.length != fileABuf\.length \|\| fileASig != _fileAFreshSig then/);
  });

  test('round-30\'s own reuse (no rebuild when both null-check and length agree) is unchanged in shape - still a single conditional rebuild', () => {
    const rebuildCount = (scala.match(/fileAOcc = scala\.collection\.mutable\.ArrayBuffer\.from\(fileABuf\.map\(_ != "\\u0000" \* 4\)\)/g) || []).length;
    assert.equal(rebuildCount, 1);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 in the briefing (gg05): a signed DISPLAY field coexisting with a
// plain (non-ODO) OCCURS table in a RELATIVE-file record now also reaches
// the byte-accurate codec path instead of the broken marker-byte convention.
// ---------------------------------------------------------------------------

describe('round-31 finding 2 (gg05): signed DISPLAY + a plain OCCURS table in a RELATIVE record now uses the byte-accurate codec', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31OCCSGN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T31OCCSGN.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.34 TO REC-ITEM(1).
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('WRITE routes through the byte-accurate case-class codec (RelRec.format), not the marker-byte text convention', () => {
    assert.match(scala, /RelRec\.format\(RelRec\(recId, recItem\)\)/);
    assert.doesNotMatch(scala, /bytes-unsupported/);
  });

  test('the table child (recItem) is passed straight through as a flat Vector constructor argument, not declined', () => {
    assert.match(scala, /RelRec\(recId, recItem\)/);
  });

  test('the generated per-element zonedEncode call for the table carries signed = true', () => {
    assert.match(scala, /CobolCodecs\.zonedEncode\(elem, 5, scale = 2, signed = true/);
  });
});

describe('round-31 finding 2 regression: a LINE SEQUENTIAL file (no determinable RELATIVE record width) keeps the pre-existing text-mode decline for signed DISPLAY + table', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31OCCSGNLS.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T31OCCSGNLS.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.34 TO REC-ITEM(1).
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('no determinable RELATIVE record width means allowTables stays false - WRITE stays on the pre-existing text-mode path, unaffected by this round\'s change', () => {
    assert.doesNotMatch(scala, /RelRec\.format/);
  });
});

describe('round-31 finding 2 regression: an all-unsigned OCCURS table (dd11\'s own shape) still uses the pre-existing text-mode path, not byte mode', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31OCCUNSGN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T31OCCUNSGN.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ITEM    PIC 9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.34 TO REC-ITEM(1).
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('no signed DISPLAY field anywhere means the round-31 condition never triggers - unchanged from round-30, still text mode', () => {
    assert.doesNotMatch(scala, /RelRec\.format/);
  });
});

describe('round-31 finding 2 regression: a plain signed DISPLAY field with NO table (ff09/ff14\'s own shape) is unaffected - still byte mode', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T31SIGNNOTBL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T31NOTBL.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-VAL     PIC S9(3)V99.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.34 TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('still routes through the byte-accurate codec - this round only widens the containsTable-exclusion, no other behavior changed', () => {
    assert.match(scala, /RelRec\.format\(RelRec\(recId, recVal\)\)/);
  });
});
