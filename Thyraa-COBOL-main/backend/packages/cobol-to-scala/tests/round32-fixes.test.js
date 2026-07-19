/**
 * tests/round32-fixes.test.js
 *
 * Focused unit tests for round-32 adversarial-refutation findings - see
 * tests/oracle/README.md's round-32 table for the full write-up and the
 * hh01/hh02/hh03/hh04/hh12 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs, matching cobc byte-for-byte).
 *
 *   1. (hh04/hh12) A nested (non-repeating) GROUP containing an OCCURS
 *      table of (signed or SIGN IS LEADING SEPARATE) elements, in a
 *      RELATIVE-file record: the WRITE side already round-tripped fine
 *      (writeRecordPlan/groupChildConstructorExpr), but READ's own
 *      `readDestination` required EVERY direct child of the record to be a
 *      bare elementary field - the instant one was itself a nested group,
 *      the WHOLE record's READ silently degraded to an "unsupported"
 *      no-op, leaving every flat var frozen at its last-written value (the
 *      SECOND record's data, since that was the last WRITE before the
 *      READs) - LOOKING LIKE an off-by-one-record misalignment, but not
 *      actually a byte-width/offset bug at all (case-class-gen.js's own
 *      recordLength/offset computation was already correct - confirmed by
 *      reading the actual generated Scala before assuming the byte-layout
 *      hypothesis was the real root cause). Fixed by making
 *      `collectGroupReadLeaves` recurse through a nested (non-repeating)
 *      group instead of requiring every child to be a bare leaf.
 *   2. (hh03) An OCCURS table of GROUPS (each occurrence its own group with
 *      a signed field and a plain field), in a RELATIVE-file record:
 *      `groupChildConstructorExpr`'s `allowTables` path (round-30 finding 1)
 *      only ever handled a table of plain elementary fields or a single
 *      (non-repeating) nested group - never a child that was BOTH at once -
 *      so it built ONE `NestedClass(<whole-table flat vars>)` call (a
 *      `Vector[Int]` where a scalar `Int` constructor parameter was
 *      declared) where the record's own field actually needed
 *      `Vector[NestedClass]` - a Scala compile-time type error, not a
 *      runtime bug. Fixed by teaching it (and READ's own
 *      `collectGroupReadLeaves`) to build/read a `Vector.tabulate`/mapped
 *      per-occurrence expression for this specific shape.
 *   3. (hh02) Round-31 finding 1 (gg01) compared a RELATIVE file's
 *      persisted occupied-slot tracker (`occVar`) against the freshly-
 *      reloaded record buffer's own LENGTH to detect a different logical
 *      file rewriting a shared physical path - but two different logical
 *      files can rewrite the SAME path with a DIFFERENT occupied-slot
 *      pattern that happens to leave the SAME record count, which the
 *      length check alone can't see. Fixed by adding a content fingerprint
 *      (`.mkString` of the buffer's own content) captured at CLOSE time and
 *      compared against a freshly-computed fingerprint of the file's
 *      current on-disk content at the next OPEN - a REAL, content-based
 *      signal (not just record count) that catches this exact coincidence,
 *      added to (not replacing) round-31's own length check.
 *   4. (hh01) `WRITE ... AT END-OF-PAGE ... NOT AT END-OF-PAGE ...` was
 *      parsed into the AST (parseWriteStatement) but `generateWriteStatement`
 *      never consulted either clause at all - both branches were silently
 *      dropped with no marker. Investigated cobc's actual LINAGE/page-size
 *      triggering condition via a direct probe (hh01's own `LINAGE IS 2
 *      LINES`, 4 successive WRITEs: NOTEOP/EOP/NOTEOP/EOP) and found it
 *      tractable as a REAL fix: a plain per-file line counter, incremented
 *      by one on every WRITE, compared against the FD's own declared
 *      LINAGE page size, resetting to 0 on reaching it - not disproportionate
 *      new infrastructure, so implemented for real rather than degraded to
 *      a `???`/TODO marker. `LINAGE IS <n> LINES` itself was not parsed
 *      anywhere in this engine before this round (silently skipped token by
 *      token by the FD clause loop's catch-all).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding (hh04): a nested (non-repeating) group containing an OCCURS table
// of signed elements now decodes correctly on READ, instead of silently
// declining and leaving every flat var at its last-written value.
// ---------------------------------------------------------------------------

describe('round-32 finding (hh04): READ into a record with a nested group containing an OCCURS table decodes through the nested case class', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32NESTTBL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T32NEST.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-DETAIL.
               10  DET-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT REL-FILE.
           READ REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('READ decodes through RelRec.parse and reaches into the nested RecDetail case class for detItem', () => {
    assert.match(scala, /val _parsed = RelRec\.parse\(/);
    assert.match(scala, /detItem = _parsed\.recDetail\.detItem/);
    assert.doesNotMatch(scala, /not supported \(see tests\/oracle\/README\.md known gaps\)/);
  });

  test('the top-level scalar sibling (recId) still assigns directly, unaffected by the nested-group recursion', () => {
    assert.match(scala, /recId = _parsed\.recId/);
  });
});

describe('round-32 finding regression: a plain (non-nested) group READ still works exactly as before this round', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32PLAINGRP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T32PLAIN.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-VAL     PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT REL-FILE.
           READ REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('both direct leaf children still assign via the flat top-level path', () => {
    assert.match(scala, /recId = _parsed\.recId/);
    assert.match(scala, /recVal = _parsed\.recVal/);
  });
});

// ---------------------------------------------------------------------------
// Finding (hh03): an OCCURS table of GROUPS builds/reads a proper
// Vector.tabulate/mapped per-occurrence expression on both WRITE and READ,
// instead of a type-mismatched single-instance constructor call.
// ---------------------------------------------------------------------------

describe('round-32 finding (hh03): an OCCURS table of GROUPS builds a Vector.tabulate constructor call on WRITE', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32TBLGRP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T32TBLGRP.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ROW     OCCURS 2 TIMES.
               10  ROW-QTY     PIC S9(3).
               10  ROW-TAG     PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE -12 TO ROW-QTY(1).
           MOVE "AAA" TO ROW-TAG(1).
           WRITE REL-REC.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the constructor call builds one RecRow per occurrence via Vector.tabulate, not a single mismatched instance', () => {
    assert.match(scala, /RelRec\(recId, Vector\.tabulate\(2\)\(i => RecRow\(rowQty\(i\), rowTag\(i\)\)\)\)/);
  });

  test('a plain (non-table) nested group constructor call is unaffected - still one bare instance', () => {
    const plainSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32PLAINCTOR.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T32PLAINCTOR.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-DETAIL.
               10  DET-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           WRITE REL-REC.
           STOP RUN.
`;
    const plainScala = scalaOf(plainSrc);
    assert.match(plainScala, /RelRec\(recId, RecDetail\(detItem\)\)/);
    assert.doesNotMatch(plainScala, /Vector\.tabulate/);
  });
});

describe('round-32 finding (hh03) READ side: a table of groups decodes via a mapped Vector expression, not an unsupported decline', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32TBLGRPREAD.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T32TBLGRPREAD.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ROW     OCCURS 2 TIMES.
               10  ROW-QTY     PIC S9(3).
               10  ROW-TAG     PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT REL-FILE.
           READ REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('rowQty/rowTag are read back via a mapped (0 until N) expression over the parsed Vector[RecRow]', () => {
    assert.match(scala, /rowQty = \(0 until 2\)\.map\(_i => _parsed\.recRow\(_i\)\.rowQty\)\.toVector/);
    assert.match(scala, /rowTag = \(0 until 2\)\.map\(_i => _parsed\.recRow\(_i\)\.rowTag\)\.toVector/);
    assert.doesNotMatch(scala, /not supported \(see tests\/oracle\/README\.md known gaps\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding (hh02): occVar reload also rebuilds on a content-fingerprint
// mismatch, not just a length mismatch - closing round-31's own remaining
// gap (same record count, different occupied pattern).
// ---------------------------------------------------------------------------

describe('round-32 finding (hh02): occVar reload additionally rebuilds on a content-fingerprint mismatch', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32COINC.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "T32SHARED.DAT"
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
           CLOSE FILE-A.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the reload condition compares null-ness, length, AND a content fingerprint (fileASig vs the freshly-loaded content)', () => {
    assert.match(scala, /if fileAOcc == null \|\| fileAOcc\.length != fileABuf\.length \|\| fileASig != _fileAFreshSig then/);
  });

  test('the fresh fingerprint is computed from the just-reloaded buffer content, before the occVar rebuild decision', () => {
    assert.match(scala, /val _fileAFreshSig = fileABuf\.mkString/);
  });

  test('CLOSE captures this same file\'s own content fingerprint from the buffer it just flushed, before nulling it', () => {
    assert.match(scala, /fileASig = fileABuf\.mkString; fileABuf = null/);
  });

  test('a fresh per-file signature var is declared alongside the other file handles, defaulting to null', () => {
    assert.match(scala, /var fileASig: String = null/);
  });
});

describe('round-32 finding (hh02) regression: a plain LINE SEQUENTIAL I-O file also gets a content-fingerprint check on its own (non-recLen) reload branch', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32COINCLS.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "T32SHAREDLS.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN I-O FILE-A.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the line-delimited reload branch also gains the same null/length/signature condition', () => {
    assert.match(scala, /if fileAOcc == null \|\| fileAOcc\.length != fileABuf\.length \|\| fileASig != _fileAFreshSig then/);
    assert.match(scala, /val _fileAFreshSig = fileABuf\.mkString\("\\n"\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding (hh01): WRITE's AT END-OF-PAGE/NOT AT END-OF-PAGE now has a real,
// LINAGE-driven implementation instead of being silently dropped.
// ---------------------------------------------------------------------------

describe('round-32 finding (hh01): WRITE ... AT END-OF-PAGE ... NOT AT END-OF-PAGE ... is parsed and generates a real per-file LINAGE counter check', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32EOP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T32PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 2 LINES.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP"
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP"
           END-WRITE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('a per-file LINAGE counter var is declared, defaulting to 0', () => {
    assert.match(scala, /var printFileLinageCtr: Int = 0/);
  });

  test('the WRITE increments the counter and branches on reaching the declared page size (2), resetting to 0 on the AT END-OF-PAGE branch', () => {
    assert.match(scala, /printFileLinageCtr \+= 1/);
    assert.match(scala, /if printFileLinageCtr >= 2 then/);
    assert.match(scala, /printFileLinageCtr = 0/);
  });

  test('both clause bodies reach the generated code (neither is silently dropped)', () => {
    assert.match(scala, /println\("EOP"\)/);
    assert.match(scala, /println\("NOTEOP"\)/);
  });
});

describe('round-32 finding (hh01) regression: NOT INVALID KEY (no AT END-OF-PAGE at all) still parses correctly after WRITE\'s own lookahead fix', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32WNIK.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T32WNIK.DAT"
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
           WRITE REL-REC
               NOT INVALID KEY
                   DISPLAY "OK"
           END-WRITE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the NOT INVALID KEY body still reaches the generated code, not swallowed by the new NOT-AT-END-OF-PAGE lookahead', () => {
    assert.match(scala, /println\("OK"\)/);
  });
});

describe('round-32 finding (hh01) regression: a file with no LINAGE clause is completely unaffected by WRITE\'s own AT END-OF-PAGE handling change', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T32NOLINAGE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T32NOLIN.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP"
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP"
           END-WRITE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('no LinageCtr var is declared and neither clause body is emitted at all (matches pre-round-32 behavior exactly)', () => {
    assert.doesNotMatch(scala, /LinageCtr/);
    assert.doesNotMatch(scala, /println\("EOP"\)/);
    assert.doesNotMatch(scala, /println\("NOTEOP"\)/);
  });
});
