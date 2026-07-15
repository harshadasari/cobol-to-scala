/**
 * tests/round30-fixes.test.js
 *
 * Focused unit tests for round-30 adversarial-refutation findings - see
 * tests/oracle/README.md's round-30 table for the full write-up and the
 * ff01/ff09/ff13/ff14 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run - and, for the
 * two file-I/O findings, a real cobc byte-layout probe - against those exact
 * corpus programs, matching cobc byte-for-byte).
 *
 *   1. (ff01) An ODO-bearing RELATIVE record combining an OCCURS DEPENDING ON
 *      table with an unrelated binary/float (COMP-2) field elsewhere in the
 *      SAME record fell back to the OLD, line-delimited file model
 *      (round-29 finding 5's own embedded-0x0A-byte corruption bug,
 *      reintroduced for this one narrower combination) AND declined the
 *      WRITE outright as an honest "bytes-unsupported" TODO (a silent
 *      no-op). A direct GnuCOBOL probe confirmed cobc's own on-disk RELATIVE
 *      format pads an ODO table to its declared MAXIMUM width regardless of
 *      live count - so the fixed-width byte-chunk model (round-29) now
 *      covers such a record too, using the record's own maximum byte width,
 *      and the WRITE side routes through the byte-accurate case-class codec
 *      instead of declining.
 *   2. (ff13) A RELATIVE-file record whose entire content is genuinely
 *      all-zero bytes (e.g. COMP-1 0.0) was indistinguishable, by content
 *      alone, from a never-written gap slot after a CLOSE+reopen round trip -
 *      a REAL fix (not a Known Gap): this engine's own in-memory
 *      occupied-tracking array is never actually invalidated by CLOSE (only
 *      the record buffer is), so reusing it verbatim on a later reopen
 *      within the SAME run sidesteps the content-based ambiguity entirely
 *      instead of re-deriving an ambiguous answer from admittedly-ambiguous
 *      bytes.
 *   3. (ff09/ff14) A plain signed DISPLAY (zoned-decimal, default trailing
 *      overpunch sign) field written to a file crashed on read-back
 *      (`zonedDecode: non-digit data in ...`) - the WRITE path used a
 *      completely different (CALL-BY-REFERENCE-marshalling-only) text
 *      convention than the READ path's real zoned-overpunch decoder ever
 *      expected. A companion MOVE-into-COMP-1/COMP-2 bug (ff09's own SORT
 *      KEY) is fixed alongside it - masked by the crash until finding 3's
 *      own fix stopped the crash from hiding it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 3 (ff09/ff14): a plain signed DISPLAY field's file WRITE now uses
// the same byte-accurate zoned-overpunch codec its own READ already used.
// ---------------------------------------------------------------------------

describe('round-30 finding 3 (ff09/ff14): plain signed DISPLAY file WRITE/READ symmetry', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T30SIGN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REC-FILE ASSIGN TO "T30SIGN.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  REC-FILE.
       01  FF-REC.
           05  FF-ID       PIC 9(2).
           05  FF-VAL      PIC S9(3)V99.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REC-FILE.
           MOVE 1 TO FF-ID.
           MOVE -0.12 TO FF-VAL.
           WRITE FF-REC.
           CLOSE REC-FILE.
           OPEN INPUT REC-FILE.
           READ REC-FILE.
           CLOSE REC-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('WRITE routes through the byte-accurate case-class codec (FfRec.format), not a literal +/- marker text', () => {
    assert.match(scala, /FfRec\.format\(FfRec\(ffId, ffVal\)\)/);
    // The old, WRITE-only convention (round-9 finding 2's CALL-BY-REFERENCE
    // marshalling text) must not be reachable from the WRITE statement at
    // all - it prepends a literal sign character before an unsigned digit
    // run, which is what corrupted the byte layout.
    assert.doesNotMatch(scala, /relFileWriter\.print\(\(if ffVal < BigDecimal\(0\)/);
  });

  test('READ decodes through the SAME class\'s real .parse() (CobolCodecs.zonedDecode)', () => {
    assert.match(scala, /FfRec\.parse\(/);
    assert.match(scala, /CobolCodecs\.zonedDecode/);
  });

  test('the generated zonedEncode call for FF-VAL carries signed = true (a real overpunch, not an unsigned digit run)', () => {
    assert.match(scala, /CobolCodecs\.zonedEncode\(record\.ffVal, 5, scale = 2, signed = true/);
  });
});

describe('round-30 finding 3 companion (ff09): MOVE into a COMP-1/COMP-2 target no longer truncates through CobolFmt.truncNumeric', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T30MOVEFLOAT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEC      PIC S9(3)V99 VALUE -12.25.
       01  WS-FLOAT    COMP-1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-DEC TO WS-FLOAT.
           DISPLAY WS-FLOAT.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the MOVE renders a direct .toFloat coercion, not CobolFmt.truncNumeric(...).toInt', () => {
    assert.match(scala, /wsFloat = \(wsDec\)\.toFloat/);
    assert.doesNotMatch(scala, /wsFloat = CobolFmt\.truncNumeric\([^)]*\)\.toInt/);
  });
});

// ---------------------------------------------------------------------------
// Finding 1 (ff01): an ODO-bearing RELATIVE record (combined with a
// non-DISPLAY sibling field) now uses the fixed-width byte-chunk model too.
// ---------------------------------------------------------------------------

describe('round-30 finding 1 (ff01): ODO + non-DISPLAY sibling in a RELATIVE record', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T30ODOREL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T30ODO.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-COUNT   PIC 9(1).
           05  REC-VAL     COMP-2.
           05  REC-ITEM    PIC X(3) OCCURS 1 TO 3 TIMES
                               DEPENDING ON REC-COUNT.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 2 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           MOVE 3.25 TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.
           OPEN INPUT REL-FILE.
           READ REL-FILE.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the RELATIVE file now uses the fixed-width raw-byte chunk model (no getLines()/println delimiter)', () => {
    assert.match(scala, /Files\.readAllBytes/);
    assert.doesNotMatch(scala, /relFileBuf\.foreach\(_w\.println\)/);
    // CLOSE's own flush is raw bytes (no delimiter) too, not one println per record.
    assert.match(scala, /_fos\.write\(r\.getBytes\(java\.nio\.charset\.StandardCharsets\.ISO_8859_1\)\)/);
  });

  test('WRITE no longer declines as bytes-unsupported - it routes through the byte-accurate case-class codec', () => {
    assert.doesNotMatch(scala, /bytes-unsupported|a byte-level \(non-DISPLAY-child\) record with a FILLER\/OCCURS/);
    assert.match(scala, /RelRec\.format\(RelRec\(recCount, recVal, recItem\)\)/);
  });

  test('the flat ODO table var (recItem) is passed straight through as a constructor argument, not indexed/sliced', () => {
    assert.match(scala, /RelRec\(recCount, recVal, recItem\)/);
  });
});

describe('round-30 finding 1 regression: a LINE SEQUENTIAL ODO record (no RELATIVE org) keeps the pre-existing text-mode WRITE', () => {
  const lineSeqSrc = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T30ODOLS.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T30ODOLS.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-COUNT   PIC 9(1).
           05  REC-ITEM    PIC X(3) OCCURS 1 TO 3 TIMES
                               DEPENDING ON REC-COUNT.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 2 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(lineSeqSrc);

  test('a LINE SEQUENTIAL ODO-only record (no RELATIVE org, no non-DISPLAY sibling) is untouched - still the pre-existing text-mode concatenation', () => {
    assert.doesNotMatch(scala, /RelRec\.format/);
    assert.match(scala, /relFileWriter\.println/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (ff13): the occupied-slot tracker (occVar) is preserved across a
// CLOSE+reopen within the same run instead of being re-derived from
// (ambiguous) disk content every time.
// ---------------------------------------------------------------------------

describe('round-30 finding 2 (ff13): occVar reload preserves in-memory state instead of re-deriving it from content', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T30ALLZERO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T30ALLZERO.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-VAL     COMP-1.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           CLOSE REL-FILE.
           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE 0.0 TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.
           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the content-based occVar rebuild is now gated behind a runtime `if occVar == null` check', () => {
    assert.match(scala, /if relFileOcc == null then\s+relFileOcc = scala\.collection\.mutable\.ArrayBuffer\.from\(relFileBuf\.map\(_ != "\\u0000" \* \d+\)\)/);
  });

  test('CLOSE still never nulls occVar itself (only the record buffer) - the precondition the fix depends on', () => {
    const closeSection = scala.slice(scala.indexOf('relFileBuf = null'));
    assert.doesNotMatch(closeSection.slice(0, 400), /relFileOcc = null/);
  });
});

describe('round-30 finding 2 regression: a fresh OPEN OUTPUT (random access) still resets occVar unconditionally', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T30FRESHOUT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T30FRESHOUT.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-VAL     PIC 9(4).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('OPEN OUTPUT (random-access branch) still unconditionally allocates a fresh, empty occVar - unaffected by the null-check fix', () => {
    assert.match(scala, /relFileOcc = new scala\.collection\.mutable\.ArrayBuffer\[Boolean\]\(\)/);
  });
});
