/**
 * tests/round33-fixes.test.js
 *
 * Focused unit tests for round-33 adversarial-refutation findings - see
 * tests/oracle/README.md's round-33 table for the full write-up and the
 * ii01/ii06/ii09 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs, matching cobc byte-for-byte).
 *
 *   1. (ii01) `LINAGE IS <n> LINES WITH FOOTING AT <m>` - round-32's own
 *      bare-LINAGE parse (`parseFileDescription`) silently discarded any
 *      `WITH FOOTING AT`/`LINES AT TOP`/`LINES AT BOTTOM` sub-clause tokens
 *      to its generic catch-all. A direct cobc probe confirmed FOOTING
 *      alone changes WRITE's own AT END-OF-PAGE timing (LINES AT TOP/BOTTOM
 *      do not). Fixed by parsing `WITH FOOTING AT <m>` into
 *      `fd.linageFootingLines` and using (pageSize - footingLines) as the
 *      threshold that fires AT END-OF-PAGE (and keeps firing on every
 *      subsequent WRITE, since the running counter is no longer reset the
 *      instant the threshold is crossed - only once it reaches the full
 *      pageSize). With no FOOTING clause at all, the threshold degenerates
 *      to pageSize itself, and the reset happens on the exact same WRITE as
 *      the EOP condition - reproducing round 32's own bare-LINAGE behavior
 *      byte-for-byte.
 *   2. (ii06) A table-of-groups row that ITSELF contains another nested
 *      OCCURS table (two independent OCCURS dimensions) in a RELATIVE-file
 *      record: `groupChildConstructorExprIndexed` already, deliberately,
 *      declines this shape (a real, narrower limitation) - but
 *      `writeRecordPlan`'s own fallback chain didn't stop there: with no
 *      non-DISPLAY field either, it fell through the ODO/group-display text
 *      paths (which also decline this shape) all the way to its final,
 *      UNCONDITIONAL fallback, `{ mode: 'text', expr: toCamelCase(recordName) }`
 *      - blindly referencing a flat Scala variable that is NEVER declared
 *      for a record built entirely out of nested group/table structure. A
 *      hard `Not found: <name>` Scala COMPILE error, not a runtime decline.
 *      Fixed by adding a guard: when a GROUP record's shape can't be
 *      represented by any of the byte-mode/ODO/group-display paths, return
 *      a new `{ mode: 'text-unsupported' }` plan instead - a genuinely
 *      honest, visible, compiling `// TODO ...` marker (WRITE and REWRITE
 *      both handle it), matching how this codebase already declines other
 *      unsupported shapes (`bytes-unsupported`). The narrower two-level
 *      table-of-groups-containing-a-table limitation itself is NOT newly
 *      implemented - only the crash-to-decline conversion.
 *   3. (ii09) STRING's own `WITH POINTER` pointer-advancement, on
 *      `ON OVERFLOW` truncation: real cobc leaves the pointer positioned
 *      exactly where writing actually stopped (right after the last
 *      character genuinely stored into the bounded target) - but
 *      `generateString` unconditionally advanced `_ptr` by the FULL source
 *      segment's own length regardless of whether the per-character bounds
 *      check (which already correctly detects overflow and produces
 *      correctly-truncated target content) actually stored every character.
 *      Fixed by counting the characters actually stored per segment
 *      (`_writtenN`, incremented in lockstep with the pre-existing overflow
 *      bounds check) and advancing `_ptr` by that count instead of the
 *      segment's raw length - a general fix (not RECURSIVE-specific,
 *      despite ii09's own RECURSIVE-paragraph repro), since generateString
 *      is called identically regardless of which paragraph-rendering
 *      convention wraps it.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding (ii01): LINAGE's `WITH FOOTING AT` clause is parsed and drives a
// footing-aware AT END-OF-PAGE threshold.
// ---------------------------------------------------------------------------

describe('round-33 finding (ii01): LINAGE IS <n> LINES WITH FOOTING AT <m> uses (pageSize - footingLines) as the AT END-OF-PAGE threshold', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33LINFOOT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T33LINFOOT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES
           WITH FOOTING AT 3.
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

  test('the EOP condition compares the counter against (pageSize - footingLines) = 2, not the bare pageSize', () => {
    assert.match(scala, /if printFileLinageCtr >= 2 then/);
  });

  test('the counter reset condition still compares against the full pageSize (5), on a separate, unconditional check', () => {
    assert.match(scala, /if printFileLinageCtr >= 5 then\s*\n\s*printFileLinageCtr = 0/);
  });
});

describe('round-33 finding (ii01) regression: a bare LINAGE (no FOOTING clause) keeps round-32\'s exact behavior - EOP and reset fire on the same WRITE', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33BARELIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T33BARELIN.DAT"
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

  test('both the EOP condition and the reset compare against the same bare pageSize (2)', () => {
    assert.match(scala, /if printFileLinageCtr >= 2 then/);
    assert.match(scala, /if printFileLinageCtr >= 2 then\s*\n\s*printFileLinageCtr = 0/);
  });
});

describe('round-33 finding (ii01) regression: LINES AT TOP/LINES AT BOTTOM parse harmlessly and do not corrupt the surrounding FD clause', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33LINTOPBOT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T33LINTOPBOT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES
           WITH FOOTING AT 3
           LINES AT TOP 2
           LINES AT BOTTOM 1.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP"
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP"
           END-WRITE.
           CLOSE PRINT-FILE.
           STOP RUN.
`;

  test('the program still parses and generates (LINES AT TOP/BOTTOM did not derail the FD clause loop), keeping the FOOTING-driven threshold', () => {
    const scala = scalaOf(src);
    assert.match(scala, /if printFileLinageCtr >= 2 then/);
    assert.match(scala, /println\("EOP"\)/);
    assert.match(scala, /println\("NOTEOP"\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding (ii06): writeRecordPlan declines (instead of crashing) a group
// record with no representable shape at all.
// ---------------------------------------------------------------------------

describe('round-33 finding (ii06): a table-of-groups row containing ANOTHER nested OCCURS table declines visibly on WRITE instead of a bare undeclared-identifier compile crash', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33NESTTBL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T33NESTTBL.DAT"
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
               10  ROW-TAG     PIC X(2).
               10  ROW-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('WRITE degrades to a visible, compiling TODO marker, never a bare reference to an undeclared flat var', () => {
    assert.match(scala, /\/\/ TODO: WRITE REL-REC: a group record built entirely from nested group\/table structure/);
    assert.doesNotMatch(scala, /relRec\b/);
  });

  test('no other WRITE-plan mode (bytes/bytes-unsupported/plain text) is emitted for this record - only the new text-unsupported decline', () => {
    assert.doesNotMatch(scala, /RelRec\.format/);
  });
});

describe('round-33 finding (ii06) regression: a plain table of groups (no further nested OCCURS inside each row) still gets a real Vector.tabulate WRITE, unaffected by the new guard', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33TBLGRP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T33TBLGRP.DAT"
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
           WRITE REL-REC.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the pre-existing round-32 table-of-groups constructor call is completely unaffected', () => {
    assert.match(scala, /RelRec\(recId, Vector\.tabulate\(2\)\(i => RecRow\(rowQty\(i\), rowTag\(i\)\)\)\)/);
    assert.doesNotMatch(scala, /text-unsupported|a group record built entirely/);
  });
});

describe('round-33 finding (ii06) regression: a record with a non-DISPLAY child still gets the pre-existing bytes-unsupported decline, not the new text-unsupported one', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33NDFILLER.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T33NDFILLER.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-AMT     PIC S9(3)V99 COMP-3.
           05  FILLER      PIC X(4).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           WRITE REL-REC.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('still the pre-existing FILLER/OCCURS byte-level decline message, not the new group-shape one', () => {
    assert.match(scala, /\/\/ TODO: WRITE REL-REC: a byte-level \(non-DISPLAY-child\) record with a FILLER\/OCCURS/);
    assert.doesNotMatch(scala, /a group record built entirely from nested/);
  });
});

// ---------------------------------------------------------------------------
// Finding (ii09): STRING's WITH POINTER value tracks the ACTUAL number of
// characters written per segment, not the source segment's own full length.
// ---------------------------------------------------------------------------

describe('round-33 finding (ii09): STRING WITH POINTER advances by the actual number of characters written, not the full source length, on overflow', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33STROVF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TARGET PIC X(5).
       01  WS-PTR PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE SPACES TO WS-TARGET.
           MOVE 1 TO WS-PTR.
           STRING "HELLOWORLD" DELIMITED BY SIZE INTO WS-TARGET
               WITH POINTER WS-PTR
               ON OVERFLOW
                   DISPLAY "OVERFLOW"
           END-STRING.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('a per-segment written-character counter is declared and used to advance _ptr, not the raw segment length', () => {
    assert.match(scala, /var _written0 = 0/);
    assert.match(scala, /_ptr = _ptr \+ _written0/);
    assert.doesNotMatch(scala, /_ptr = _ptr \+ _seg0\.length/);
  });

  test('the per-character bounds-check loop still increments both the overflow flag and the new written counter in lockstep', () => {
    assert.match(scala, /_sb\.setCharAt\(_pos, _seg0\(_i\)\); _written0 \+= 1 \} else _overflow = true/);
  });
});

describe('round-33 finding (ii09) regression: a STRING with no overflow at all still advances the pointer by the full (fully-written) segment length', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33STROK.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TARGET PIC X(20).
       01  WS-PTR PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE SPACES TO WS-TARGET.
           MOVE 1 TO WS-PTR.
           STRING "HELLO" DELIMITED BY SIZE INTO WS-TARGET
               WITH POINTER WS-PTR.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('every character of the un-truncated segment is counted, so _written0 == _seg0.length at runtime (same effective value as before this fix)', () => {
    assert.match(scala, /var _written0 = 0/);
    assert.match(scala, /_ptr = _ptr \+ _written0/);
  });
});

describe('round-33 finding (ii09) regression: multiple STRING source segments each get their own independent written-counter var', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T33STRMULTI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TARGET PIC X(20).
       01  WS-PTR PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE SPACES TO WS-TARGET.
           MOVE 1 TO WS-PTR.
           STRING "HELLO" DELIMITED BY SIZE
               " " DELIMITED BY SIZE
               "WORLD" DELIMITED BY SIZE
               INTO WS-TARGET
               WITH POINTER WS-PTR.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('three independent segment/written-counter pairs are declared, each advancing _ptr by its own count', () => {
    assert.match(scala, /var _written0 = 0/);
    assert.match(scala, /var _written1 = 0/);
    assert.match(scala, /var _written2 = 0/);
    assert.match(scala, /_ptr = _ptr \+ _written0/);
    assert.match(scala, /_ptr = _ptr \+ _written1/);
    assert.match(scala, /_ptr = _ptr \+ _written2/);
  });
});
