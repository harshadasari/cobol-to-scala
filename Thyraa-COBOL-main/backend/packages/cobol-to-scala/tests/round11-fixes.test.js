/**
 * tests/round11-fixes.test.js
 *
 * Focused unit tests for the round-11 adversarial-refutation findings (3
 * dishonest divergences fixed - DISPLAY of a group containing an OCCURS
 * child (fixed-size OR ... DEPENDING ON) fell through to a bare undeclared
 * Scala identifier, SEARCH ALL against a multi-field composite key silently
 * discarded every key past the first (a wrong-match bug, not just an
 * incompleteness), and INITIALIZE of a subscripted table element ignored
 * the subscript entirely and wiped the WHOLE table) - see
 * tests/oracle/README.md for the full end-to-end (cobc-vs-generated-Scala)
 * verification the promoted tests/corpus/proc/y*.cbl programs provide via
 * the data-driven oracle suite. This file targets the individual
 * generator mechanisms each finding traces to, in isolation (no
 * cobc/scala-cli needed), so a regression is caught at the unit level even
 * on a machine without the compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: DISPLAY of a GROUP containing an OCCURS child fell through
// every rendering path in renderDisplayOperand to a bare `expr` at the
// bottom - a reference to a nonexistent Scala identifier, since a group has
// no flat var of its own (only its children do). round-10 had already built
// odoDisplayValueExpr for this exact table-aware concatenation, but wired it
// ONLY into writeRecordPlan (the WRITE path) - renderDisplayOperand (the
// DISPLAY path) still only tried groupDisplayValueExpr, which unconditionally
// bails (returns null) the moment ANY OCCURS child is present, fixed-size or
// ODO alike. Fixed by: (a) extending odoDisplayValueExpr itself to also
// handle a FIXED-size OCCURS child (not just DEPENDING ON), and (b) trying
// it FIRST in renderDisplayOperand, before groupDisplayValueExpr.
// ---------------------------------------------------------------------------

const FIXED_OCCURS_GROUP_DISPLAY_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-CNT   PIC 9 VALUE 3.
           05  WS-ELEM  PIC 9 OCCURS 5 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1 TO WS-ELEM(1).
           DISPLAY WS-REC.
           STOP RUN.
`;

test('Finding 1a: DISPLAY of a group with a FIXED-size OCCURS child concatenates ALL declared elements (not a bare undeclared identifier)', () => {
  const code = scalaOf(FIXED_OCCURS_GROUP_DISPLAY_SOURCE);
  assert.match(
    code,
    /println\(\(CobolFmt\.digitsOf\(BigDecimal\(wsCnt\), 1, 0\) \+ \(0 until 5\)\.map\(i => CobolFmt\.digitsOf\(BigDecimal\(wsElem\(i\)\), 1, 0\)\)\.mkString\)\)/,
    'must concatenate the counter digit text plus all 5 fixed elements, driven by a literal 5 (not a live counter)'
  );
  assert.doesNotMatch(code, /println\(wsRec\)/, 'must never fall back to a bare/nonexistent group var');
});

const ODO_GROUP_DISPLAY_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y11BMIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-COUNT     PIC 9 VALUE 3.
           05  WS-ELEM      PIC 9 OCCURS 1 TO 5 TIMES
                            DEPENDING ON WS-COUNT.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1 TO WS-ELEM(1).
           MOVE 2 TO WS-ELEM(2).
           MOVE 3 TO WS-ELEM(3).
           DISPLAY "GROUP=[" WS-REC "]".
           STOP RUN.
`;

test('Finding 1b: DISPLAY of a group with an OCCURS ... DEPENDING ON child concatenates exactly wsCount-many elements (the LIVE counter), never the fixed max occurrence count', () => {
  const code = scalaOf(ODO_GROUP_DISPLAY_SOURCE);
  assert.match(
    code,
    /\(0 until \(wsCount\)\.toInt\)\.map\(i => CobolFmt\.digitsOf\(BigDecimal\(wsElem\(i\)\), 1, 0\)\)\.mkString/,
    'must drive the element count from the live wsCount value, not a literal 5'
  );
});

// ---------------------------------------------------------------------------
// Finding 2: SEARCH ALL against a table declared with a MULTI-field
// composite key (ASCENDING KEY IS WS-K1 WS-K2) drove the binary search off
// WS-K1 alone - findKeyEquality only ever extracted the FIRST key's equality
// test out of the WHEN's AND-chain, silently discarding every conjunct past
// it. This was a wrong-MATCH bug, not just an incompleteness: a WHEN testing
// `WS-K1(x) = 20 AND WS-K2(x) = 9` (no such row exists) matched purely on
// WS-K1 = 20 and returned whichever of the several same-K1 rows binary
// search happened to land on, where cobc reports "not found". Fixed by
// extractKeyPrefix (extracts the full ordered PREFIX of the table's
// declared composite key that has an equality conjunct) driving a genuine
// composite-key binary search (compositeShouldNarrowLowerExpr), with any
// residual (non-key, or un-prefixed trailing key) conjunct re-verified
// before declaring a match.
// ---------------------------------------------------------------------------

const COMPOSITE_KEY_SEARCH_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y12SRCHALL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 5 TIMES
               ASCENDING KEY IS WS-K1 WS-K2
               INDEXED BY WS-IDX.
               10  WS-K1    PIC 9(2).
               10  WS-K2    PIC 9(2).
               10  WS-VAL   PIC X(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SEARCH ALL WS-ENTRY
               WHEN WS-K1(WS-IDX) = 20 AND WS-K2(WS-IDX) = 2
                   DISPLAY WS-VAL(WS-IDX)
           END-SEARCH.
           STOP RUN.
`;

test('Finding 2a: a WHEN testing BOTH declared key fields drives a composite (both-key) binary search, not a WS-K1-only one', () => {
  const code = scalaOf(COMPOSITE_KEY_SEARCH_SOURCE);
  assert.match(code, /val _key0 = wsK1\(wsIdx - 1\)/);
  assert.match(code, /val _key1 = wsK2\(wsIdx - 1\)/);
  assert.match(code, /if \(_key0 == \(20\) && _key1 == \(2\)\) then/, 'the match test must require BOTH keys to equal their target, not just WS-K1');
});

test('Finding 2b: the composite narrowing direction compares the FULL key tuple lexicographically (per the declared ASCENDING order), not just the first key', () => {
  const code = scalaOf(COMPOSITE_KEY_SEARCH_SOURCE);
  assert.match(
    code,
    /else if \(\(_key0 > \(20\)\) \|\| \(_key0 == \(20\) && _key1 > \(2\)\)\) then\s*\n\s*_hi = wsIdx - 1/,
    'the lower-half-narrowing test must be a genuine lexicographic tuple comparison over BOTH keys'
  );
});

const PARTIAL_KEY_PREFIX_SEARCH_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 5 TIMES
               ASCENDING KEY IS WS-K1 WS-K2
               INDEXED BY WS-IDX.
               10  WS-K1    PIC 9(2).
               10  WS-K2    PIC 9(2).
               10  WS-VAL   PIC X(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SEARCH ALL WS-ENTRY
               WHEN WS-K1(WS-IDX) = 10
                   DISPLAY WS-VAL(WS-IDX)
           END-SEARCH.
           STOP RUN.
`;

test('Finding 2c: a WHEN testing only a LEADING prefix of the composite key (just WS-K1) still drives a valid (single-key) binary search - not forced to the linear fallback', () => {
  const code = scalaOf(PARTIAL_KEY_PREFIX_SEARCH_SOURCE);
  assert.match(code, /val _key0 = wsK1\(wsIdx - 1\)/);
  assert.doesNotMatch(code, /val _key1 = /, 'WS-K2 has no equality conjunct at all, so no _key1 should be extracted');
  assert.doesNotMatch(code, /SEARCH ALL fallback: linear scan/, 'a valid leading-prefix key equality must NOT fall back to the linear scan');
});

const NO_KEY_SEARCH_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 5 TIMES
               ASCENDING KEY IS WS-K1 WS-K2
               INDEXED BY WS-IDX.
               10  WS-K1    PIC 9(2).
               10  WS-K2    PIC 9(2).
               10  WS-VAL   PIC X(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SEARCH ALL WS-ENTRY
               WHEN WS-K2(WS-IDX) = 2
                   DISPLAY WS-VAL(WS-IDX)
           END-SEARCH.
           STOP RUN.
`;

test('Finding 2d: a WHEN whose only equality is on the SECOND declared key (skipping the first) cannot be decomposed to a key-prefix and falls back to the honest linear scan', () => {
  const code = scalaOf(NO_KEY_SEARCH_SOURCE);
  assert.match(code, /SEARCH ALL fallback: linear scan/, 'WS-K1 (the leading declared key) has no equality conjunct at all, so this must fall back to the documented linear scan');
});

const RESIDUAL_CONJUNCT_SEARCH_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 5 TIMES
               ASCENDING KEY IS WS-K1
               INDEXED BY WS-IDX.
               10  WS-K1    PIC 9(2).
               10  WS-FLAG  PIC X(1).
               10  WS-VAL   PIC X(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SEARCH ALL WS-ENTRY
               WHEN WS-K1(WS-IDX) = 20 AND WS-FLAG(WS-IDX) = "Y"
                   DISPLAY WS-VAL(WS-IDX)
           END-SEARCH.
           STOP RUN.
`;

test('Finding 2e: a non-key residual conjunct (WS-FLAG, not a declared key) is re-verified at the narrowed candidate index before declaring a match', () => {
  const code = scalaOf(RESIDUAL_CONJUNCT_SEARCH_SOURCE);
  assert.match(code, /if \(_key0 == \(20\)\) then/, 'the binary search itself narrows only on the declared key WS-K1');
  assert.match(code, /if \(\(wsFlag\(\(wsIdx - 1\)\.toInt\) == "Y"\)\) then/, 'the non-key conjunct must be re-checked at the candidate index');
  assert.match(code, /_lo = _hi \+ 1/, 'a residual-conjunct failure must force-terminate the search as not-found, not keep narrowing');
});

// ---------------------------------------------------------------------------
// Finding 3: INITIALIZE of a SUBSCRIPTED table element (`INITIALIZE
// WS-ENTRY(WS-I)`) completely ignored the target's own subscript -
// generateInitialize/initializeAssignmentLines always emitted a bare
// `<child camel> = Vector.fill(<full count>)(...)` for every leaf, wiping
// EVERY row of the table exactly as if the INITIALIZE had named the bare
// (unsubscripted) table. Fixed by threading the target's own subscript list
// through to both the group-recursion path and the elementary-field path,
// rebuilding only the indexed element via the same subscripted-MOVE-target
// `.updated(idx, value)` convention (renderAssignment) any other subscripted
// write uses.
// ---------------------------------------------------------------------------

const INITIALIZE_TABLE_ELEMENT_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y17INITAB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 3 TIMES.
               10  WS-NAME    PIC X(6) VALUE "XXXXXX".
               10  WS-AMT     PIC 9(4) VALUE 9999.
       01  WS-I               PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-ENTRY(WS-I).
           STOP RUN.
`;

test('Finding 3a: INITIALIZE of a subscripted GROUP table element rebuilds only that ONE row via .updated, never the whole Vector', () => {
  const code = scalaOf(INITIALIZE_TABLE_ELEMENT_SOURCE);
  assert.match(
    code,
    /wsName = wsName\.updated\(\(wsI - 1\)\.toInt, "\s+"\)/,
    'WS-NAME (alphanumeric) must be reset to spaces at ONLY the WS-I row via .updated'
  );
  assert.match(
    code,
    /wsAmt = wsAmt\.updated\(\(wsI - 1\)\.toInt, 0\)/,
    'WS-AMT (numeric) must be reset to zero at ONLY the WS-I row via .updated'
  );
  assert.doesNotMatch(code, /wsName = Vector\.fill\(3\)/, 'must NOT wipe the whole 3-element table');
  assert.doesNotMatch(code, /wsAmt = Vector\.fill\(3\)/, 'must NOT wipe the whole 3-element table');
});

const INITIALIZE_ELEMENTARY_TABLE_ELEMENT_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-ELEM  PIC 9(3) OCCURS 4 TIMES.
       01  WS-I     PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-ELEM(WS-I).
           STOP RUN.
`;

test('Finding 3b: INITIALIZE of a subscripted, directly-OCCURS-bearing ELEMENTARY item also rebuilds only the one indexed element', () => {
  const code = scalaOf(INITIALIZE_ELEMENTARY_TABLE_ELEMENT_SOURCE);
  assert.match(
    code,
    /wsElem = wsElem\.updated\(\(wsI - 1\)\.toInt, 0\)/,
    'must reset only the WS-I-th element via .updated, not the whole table'
  );
  assert.doesNotMatch(code, /wsElem = Vector\.fill\(4\)/, 'must NOT wipe the whole 4-element table');
});

test('Finding 3c regression guard: INITIALIZE of the bare (unsubscripted) table name still wipes every element, unchanged from pre-round-11 behavior', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 3 TIMES.
               10  WS-NAME    PIC X(6) VALUE "XXXXXX".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INITIALIZE WS-ENTRY.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /wsName = Vector\.fill\(3\)\("\s+"\)/, 'an unsubscripted INITIALIZE of the whole table must still wipe every element');
});
