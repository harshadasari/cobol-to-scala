/**
 * tests/round15-fixes.test.js
 *
 * Focused unit tests for the round-15 adversarial-refutation findings (8
 * reported, all addressed - see tests/oracle/README.md's round-15 table for
 * the full write-up and the d02-d12 promoted oracle corpus programs for the
 * end-to-end cobc-vs-generated-Scala verification):
 *
 *   1. SYNC binary child inheriting a GROUP-level VALUE clause - the
 *      offset-walk in scala-generator.js's buildFieldRegistry (`walk()`)
 *      never consulted syncPadBytes when slicing each child's span out of
 *      the group's own VALUE literal, even though layout.js's itemByteLength
 *      (used for the *total* group width) already did - the two offsets
 *      drifted apart the moment a SYNC child needed padding. Fixed by
 *      applying the same syncPadBytes padding to walk()'s own running
 *      `offset` immediately before it's used.
 *
 *   2. SYNC alignment inside a nested sub-group that itself sits at a
 *      non-zero ABSOLUTE record offset - both layout.js's itemByteLength and
 *      scala-generator.js's walk() aligned relative to the sub-group's own
 *      (always-reset-to-0) local offset instead of the item's true absolute
 *      record position. Fixed by threading a `baseOffset` parameter through
 *      both functions' recursion.
 *
 *   3. SYNC binary item inside an OCCURS table - itemByteLength only padded
 *      *before* the SYNC child within one occurrence, never rounding the
 *      occurrence's own STRIDE up afterward, so repeated occurrences drifted
 *      out of alignment after the first. Fixed by rounding the per-
 *      occurrence stride up to the widest SYNC alignment any descendant
 *      requires (new layout.js-internal syncAlignmentSize), applied only
 *      when the item itself carries OCCURS > 1 (a no-op for every non-SYNC
 *      OCCURS table).
 *
 *   4. Group-VALUE slicing over a COMP-5 (native binary) child -
 *      nonDisplayInheritedNumericText truncated the decoded value to the
 *      PICTURE's declared digit count for EVERY non-DISPLAY usage, but real
 *      cobc's binary-truncate convention (FILE STATUS "35"-style low-order
 *      clipping) does not apply to COMP-5 - its DISPLAY shows the true
 *      stored magnitude even past the declared digit count. Fixed by
 *      exempting COMP-5 from the truncation (COMP-3/COMP/COMP-4/BINARY keep
 *      truncating, unchanged).
 *
 *   5. Subscripted whole-row MOVE across two DIFFERENT tables (`MOVE
 *      WS-ROW-A(i) TO WS-ROW-B(j)`) previously fell through to a broken
 *      elementary-MOVE codegen path (`wsRowB = wsRowB.updated(...)`, a hard
 *      "Not found: wsRowB" compile error, since a group-with-OCCURS name has
 *      no flat var of its own). Fixed by generalizing
 *      subscriptedGroupMoveChildLines/generateSubscriptedGroupMove to accept
 *      two (possibly different) group keys, matching children positionally
 *      (same rule generateGroupMove's groupLayoutsIdentical already applies
 *      for a bare cross-record group MOVE) - a real, working fix, not a
 *      degraded marker.
 *
 *   6. Subscripted whole-row MOVE with TWO subscript dimensions (`MOVE
 *      WS-INNER(1,1) TO WS-INNER(2,2)`, OCCURS nested inside OCCURS) was a
 *      SILENT NO-OP (generateSubscriptedGroupMove rejected anything but
 *      exactly one subscript dimension per side, falling through to a
 *      comment-only marker that left the target's stale value in place).
 *      Fixed by generalizing to build a nested `.updated(...)` chain for any
 *      number of dimensions (nestedReadExpr/nestedUpdateExpr) - also a real
 *      fix, not a degraded marker; a 1-dimensional row (the common case,
 *      w05) produces byte-for-byte the same single-`.updated` output as
 *      before.
 *
 *   7. SORT with DECLARATIVES firing from the OUTPUT PROCEDURE - the actual
 *      root cause was file-io-gen.js's OPEN-failure classifier mapping
 *      EVERY `java.io.FileNotFoundException` to FILE STATUS "35" regardless
 *      of OPEN mode. "35" ("file not found") is only meaningful for
 *      INPUT/I-O (which require the file to already exist); OPEN
 *      OUTPUT/EXTEND CREATE the file, so a FileNotFoundException there means
 *      the file genuinely couldn't be created (parent directory missing, a
 *      permission error, ...) - cobc's generic permanent-error code, "30".
 *      Fixed by branching the FileNotFoundException-to-status mapping on
 *      OPEN mode (INPUT/I-O keep "35", OUTPUT/EXTEND now get "30").
 *
 *   8. Reference modification used as a STRING segment source combined
 *      Known Gap #1's pre-existing `???`-typed (Nothing) read placeholder
 *      with STRING's segment-copy loop's `.indices`/`.length` calls on that
 *      placeholder - a hard "Found: Nothing, Required: ?{indices}" compile
 *      error, turning an already-documented, compiling gap into a crash.
 *      Fixed by giving STRING's own segment-value codegen
 *      (stringSegmentValueExpr) a dedicated, concrete String-typed ("")
 *      placeholder for a ref-mod segment source, instead of routing through
 *      the shared Nothing-typed convertIdentifier placeholder - compiles and
 *      runs (contributing zero characters, an honest visible decline), never
 *      crashes. Reference modification's own semantics remain deliberately
 *      unimplemented (out of scope, per the existing Known Gap #1) - this
 *      fix is scoped exactly to stopping the STRING-combination crash.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/d02-d12 programs
 * provide via the data-driven oracle suite. This file targets the individual
 * parser/generator mechanisms each finding traces to, in isolation (no cobc/
 * scala-cli needed), so a regression is caught at the unit level even on a
 * machine without the compiler toolchain installed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { itemByteLength, syncPadBytes, elementaryByteLength } from '../generator/layout.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function compItem(name, digits, sync) {
  return {
    level: 5,
    name,
    usage: 'COMP',
    sync,
    pic: { pattern: `S9(${digits})`, integerDigits: digits, decimalDigits: 0 },
  };
}
function xItem(name, len) {
  return { level: 5, name, usage: 'DISPLAY', pic: { pattern: `X(${len})`, length: len } };
}

// ---------------------------------------------------------------------------
// Findings 1/2: SYNC group-VALUE-inheritance offset + absolute-offset
// threading through a nested sub-group.
// ---------------------------------------------------------------------------

describe('round-15 findings 1/2: SYNC offset consistency (group-VALUE slicing + nested sub-group absolute offset)', () => {
  test('itemByteLength: SYNC nested inside a sub-group at a non-zero absolute offset aligns by ABSOLUTE position, not the sub-group\'s own local offset (d03 oracle: LEN=6)', () => {
    const group = {
      level: 1,
      name: 'WS-OUTER',
      children: [
        xItem('W-LEAD', 1),
        {
          level: 5,
          name: 'W-GRP',
          children: [xItem('F1', 1), compItem('F2', 4, true), xItem('F3', 1)],
        },
        xItem('W-TAIL', 1),
      ],
    };
    // Absolute offsets: W-LEAD@0 (1B), W-GRP starts@1 -> F1@1 (1B), F2's
    // absolute offset would be 2 (already even - no pad needed), F2@2-3
    // (2B), F3@4 (1B) -> W-GRP totals 4 bytes (NOT 5 - no padding, since 2
    // is already aligned when measured absolutely). W-TAIL@5 (1B). Total 6.
    assert.equal(itemByteLength(group), 6);
  });

  test('d02 shape: F2 immediately after a single 1-byte sibling (no sub-group) still pads as before (regression guard)', () => {
    const group = {
      level: 1,
      name: 'WS-REC',
      children: [xItem('F1', 1), compItem('F2', 4, true), xItem('F3', 1)],
    };
    assert.equal(itemByteLength(group), 5);
  });

  test('scala-generator walk(): a group-level VALUE clause slices a SYNC binary child using the SAME sync-padded offset itemByteLength computes (d02 end-to-end)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC VALUE "ABCDE".
           05  F1 PIC X(1).
           05  F2 PIC S9(4) COMP SYNC.
           05  F3 PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-REC).
           DISPLAY "F2=" F2.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // "CD" (bytes 2-3 of "ABCDE", after 1 pad byte following F1) decoded as
    // signed big-endian COMP, truncated to 4 declared digits: 17220 -> 7220.
    assert.match(scala, /var f2: Int = 7220/);
    assert.match(scala, /println\("LEN=" \+ 5\)/);
  });

  test('scala-generator walk(): SYNC nested inside a sub-group with its own VALUE-less elementary siblings still totals the absolute-offset-correct length (d03 end-to-end)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-OUTER.
           05  W-LEAD PIC X(1) VALUE "X".
           05  W-GRP.
               10  F1 PIC X(1) VALUE "A".
               10  F2 PIC S9(4) COMP SYNC VALUE 258.
               10  F3 PIC X(1) VALUE "Z".
           05  W-TAIL PIC X(1) VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-OUTER).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /println\("LEN=" \+ 6\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: OCCURS stride rounding for a SYNC item inside a table.
// ---------------------------------------------------------------------------

describe('round-15 finding 3: SYNC alignment combined with OCCURS (per-occurrence stride rounding)', () => {
  function rowGroup(occursTimes) {
    return {
      level: 5,
      name: 'WS-ROW',
      occurs: occursTimes ? { times: occursTimes } : null,
      children: [xItem('R-LEAD', 1), compItem('R-NUM', 4, true), xItem('R-TAIL', 1)],
    };
  }

  test('one occurrence in isolation (occurs stripped) keeps the pre-existing unrounded width - the established "one occurrence width" convention is unaffected', () => {
    assert.equal(itemByteLength(rowGroup(null)), 5); // 1 (lead) + 1 (pad) + 2 (num) + 1 (tail)
  });

  test('OCCURS 2 rounds the per-occurrence stride up to the SYNC alignment (6, not the naive 5*2=10) - matches d04 oracle (LEN=12)', () => {
    const table = { level: 1, name: 'WS-TABLE', children: [rowGroup(2)] };
    assert.equal(itemByteLength(table), 12);
  });

  test('an OCCURS table with no SYNC descendant is completely unaffected (no-op regression guard)', () => {
    const plainRow = {
      level: 5,
      name: 'WS-ROW',
      occurs: { times: 3 },
      children: [xItem('R-A', 2), xItem('R-B', 3)],
    };
    const table = { level: 1, name: 'WS-TABLE', children: [plainRow] };
    assert.equal(itemByteLength(table), 5 * 3);
  });

  test('d04 end-to-end: FUNCTION LENGTH(WS-TABLE) reports 12, and each row\'s R-NUM stays independently addressable/correct', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D04.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 2 TIMES.
               10  R-LEAD PIC X(1).
               10  R-NUM  PIC S9(4) COMP SYNC.
               10  R-TAIL PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-TABLE).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /println\("LEN=" \+ 12\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4: COMP-5 exempt from binary-truncate; COMP/COMP-4/BINARY/COMP-3
// still truncate (regression).
// ---------------------------------------------------------------------------

describe('round-15 finding 4: COMP-5 group-VALUE inheritance is NOT truncated to the declared digit count', () => {
  test('d06 end-to-end: PIC 9(4) COMP-5 reading raw bytes "12" from a group VALUE shows the full native-binary magnitude (12849), not 12849 mod 10^4 (2849)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D06.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC VALUE "AB12CD".
           05 WS-CODE   PIC X(2).
           05 WS-AMT    PIC 9(4) COMP-5.
           05 WS-TAIL   PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "AMT=" WS-AMT.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var wsAmt: Int = 12849/);
  });

  test('regression guard: an ordinary (non-COMP-5) binary group-VALUE child still truncates to its declared digit count (d02 shape, COMP)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D02B.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC VALUE "ABCDE".
           05  F1 PIC X(1).
           05  F2 PIC S9(4) COMP SYNC.
           05  F3 PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "F2=" F2.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var f2: Int = 7220/);
  });
});

// ---------------------------------------------------------------------------
// Findings 5/6: subscripted whole-row MOVE - cross-table (real fix) and
// multi-dimensional (real fix), replacing the previous compile-error /
// silent-no-op degradations.
// ---------------------------------------------------------------------------

describe('round-15 finding 5: subscripted whole-row MOVE across two DIFFERENT tables', () => {
  test('d07 end-to-end: MOVE WS-ROW-A(1) TO WS-ROW-B(2) generates a real per-child copy, never a bare "wsRowB" reference', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE-A.
           05 WS-ROW-A OCCURS 3 TIMES.
               10 A-CODE PIC X(3).
               10 A-NUM  PIC 9(3).
       01 WS-TABLE-B.
           05 WS-ROW-B OCCURS 3 TIMES.
               10 B-CODE PIC X(3).
               10 B-NUM  PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-ROW-A(1) TO WS-ROW-B(2).
           STOP RUN.
`;
    const scala = scalaOf(src);
    // Never the broken pre-fix codegen (a bare group name with no flat var).
    assert.doesNotMatch(scala, /\bwsRowB\s*=\s*wsRowB\.updated/);
    assert.doesNotMatch(scala, /\?\?\? TODO - whole-row MOVE/);
    // The real fix: each child copied positionally from row A's index 0 to
    // row B's index 1 (both zero-based).
    assert.match(scala, /bCode = bCode\.updated\(1, aCode\(0\)\)/);
    assert.match(scala, /bNum = bNum\.updated\(1, aNum\(0\)\)/);
  });
});

describe('round-15 finding 6: subscripted whole-row MOVE with TWO subscript dimensions', () => {
  test('d08 end-to-end: MOVE WS-INNER(1,1) TO WS-INNER(2,2) generates a real nested-Vector update, never a silent no-op comment', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-OUTER OCCURS 2 TIMES.
               10 WS-INNER OCCURS 2 TIMES.
                   15 IN-CODE PIC X(2).
                   15 IN-NUM  PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-INNER(1,1) TO WS-INNER(2,2).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /\?\?\? TODO - whole-row MOVE/);
    assert.match(scala, /inCode = inCode\.updated\(1, inCode\(1\)\.updated\(1, inCode\(0\)\(0\)\)\)/);
    assert.match(scala, /inNum = inNum\.updated\(1, inNum\(1\)\.updated\(1, inNum\(0\)\(0\)\)\)/);
  });

  test('1-dimensional row MOVE (w05 shape) still produces the original single-.updated output (no regression from the multi-dim generalization)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15W05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-ROW OCCURS 3 TIMES.
               10 R-A PIC X(3).
               10 R-B PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-ROW(1) TO WS-ROW(3).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /rA = rA\.updated\(2, rA\(0\)\)/);
    assert.match(scala, /rB = rB\.updated\(2, rB\(0\)\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 7: OPEN-failure FILE STATUS classification branches on mode.
// ---------------------------------------------------------------------------

describe('round-15 finding 7: OPEN-failure FileNotFoundException status depends on OPEN mode', () => {
  test('OPEN OUTPUT against a path whose parent directory may not exist maps FileNotFoundException to "30", not "35"', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D10OUT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "/no/such/dir/OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-OUT-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-OUT-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           DISPLAY "STATUS=" WS-OUT-STATUS.
           STOP RUN.
`;
    const scala = scalaOf(src);
    const catchBlock = scala.slice(scala.indexOf('case _: java.io.FileNotFoundException'));
    const firstAssignment = catchBlock.match(/wsOutStatus = "(\d\d)"/);
    assert.ok(firstAssignment, 'expected a wsOutStatus assignment in the FileNotFoundException catch arm');
    assert.equal(firstAssignment[1], '30');
  });

  test('OPEN INPUT against a missing file still maps FileNotFoundException to "35" (regression guard - x01/x02 shape)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15X02.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "NOSUCHFILE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD IN-FILE.
       01 IN-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN INPUT IN-FILE.
           DISPLAY "STATUS=" WS-STATUS.
           STOP RUN.
`;
    const scala = scalaOf(src);
    const catchBlock = scala.slice(scala.indexOf('case _: java.io.FileNotFoundException'));
    const firstAssignment = catchBlock.match(/wsStatus = "(\d\d)"/);
    assert.ok(firstAssignment, 'expected a wsStatus assignment in the FileNotFoundException catch arm');
    assert.equal(firstAssignment[1], '35');
  });
});

// ---------------------------------------------------------------------------
// Finding 8: STRING segment source degrades gracefully for a ref-mod
// operand instead of emitting a Nothing-typed `???` that crashes the
// surrounding .indices/.length loop at compile time.
// ---------------------------------------------------------------------------

describe('round-15 finding 8: reference modification as a STRING segment source no longer hard-crashes', () => {
  test('d12 shape: STRING with two ref-mod segment sources compiles to a concrete String placeholder, not the shared Nothing-typed ??? marker', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15D12.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "HELLOWORLD".
       01 WS-TARGET PIC X(10) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-SRC(1:5) DELIMITED BY SIZE
                  WS-SRC(6:5) DELIMITED BY SIZE
                  INTO WS-TARGET.
           DISPLAY "TARGET=" WS-TARGET.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // The old, crash-causing shape must be gone from the STRING segments.
    assert.doesNotMatch(scala, /val _seg0 = \?\?\?/);
    assert.doesNotMatch(scala, /val _seg1 = \?\?\?/);
    // Replaced by a concrete, STRING-compatible ("".indices/"".length both
    // compile and run) placeholder that still visibly documents the gap.
    assert.match(scala, /val _seg0 = "" \/\* TODO: reference modification/);
    assert.match(scala, /val _seg1 = "" \/\* TODO: reference modification/);
  });

  test('a non-ref-mod STRING source is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R15STRPLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC X(5) VALUE "HELLO".
       01 WS-TARGET PIC X(10) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-A DELIMITED BY SIZE INTO WS-TARGET.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /val _seg0 = wsA/);
    assert.doesNotMatch(scala, /TODO: reference modification/);
  });
});
