/**
 * tests/phase2-refutation-fixes.test.js
 *
 * Focused unit tests for the 14 root-cause gaps found by the Phase 2
 * adversarial refuter (tests/corpus/proc/r01-r14* and their *-iso/*-bisect
 * follow-ups) - see tests/oracle/README.md for the full end-to-end
 * (cobc-vs-generated-Scala) verification those corpus programs provide via
 * the data-driven oracle suite. This file targets the individual generator/
 * parser mechanisms each finding traces to, in isolation (no cobc/scala-cli
 * needed), so a future regression is caught at the unit level even on a
 * machine without the compiler toolchain installed.
 *
 * Numbered to match the refuter's own findings list (worst first).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { collectAmbiguousGroupClassNames, resolveClassName } from '../generator/case-class-gen.js';
import { toMethodName } from '../generator/method-gen.js';

// ---------------------------------------------------------------------------
// Finding 1: FUNCTION NUMVAL crash on COBOL-legal internal whitespace between
// the sign and the digits (e.g. '+  12.5').
// ---------------------------------------------------------------------------

test('Finding 1: FUNCTION NUMVAL routes through CobolFmt.numval (strips internal whitespace, not just outer trim)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC    PIC X(12) VALUE '+  12.5'.
       01  WS-RES    PIC S9(3)V99.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE FUNCTION NUMVAL(WS-SRC) TO WS-RES
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // round-8 finding 2: CobolFmt.numval gained a `decimalComma` parameter (see
  // tests/round8-fixes.test.js) so FUNCTION NUMVAL can parse "," as the
  // decimal point under SPECIAL-NAMES' DECIMAL-POINT IS COMMA - every call
  // site (this one included) now threads the current setting through as a
  // second argument, `false` here since this source has no SPECIAL-NAMES
  // clause at all.
  assert.match(code, /wsRes = CobolFmt\.numval\(wsSrc, false\)/);
  // A plain `.trim` alone (the pre-fix behavior) would leave the internal
  // space between '+' and '12.5' in place, which BigDecimal's own parser
  // rejects outright - the fix must not just re-wrap the same broken
  // .trim-then-BigDecimal call.
  assert.doesNotMatch(code, /BigDecimal\(\(wsSrc\)\.trim\)/);
});

test('Finding 1: CobolFmt.numval strips every space and normalizes a leading or trailing sign', () => {
  const code = convertToScala('       IDENTIFICATION DIVISION.\n       PROGRAM-ID. T.\n       PROCEDURE DIVISION.\n       0000-MAIN.\n           STOP RUN.\n', {}).scala;
  const match = code.match(/def numval\(s: String, decimalComma: Boolean = false\): BigDecimal =\n([\s\S]*?)\n\n/);
  assert.ok(match, 'CobolFmt.numval helper should be embedded');
  // Evaluate the actual Scala logic's JS-equivalent behavior isn't practical
  // here without a Scala runtime, but the embedded source itself is the
  // contract every NUMVAL call site relies on - assert its shape covers both
  // leading- and trailing-sign COBOL forms rather than only outer trimming.
  assert.match(code, /val compact = s\.filterNot\(_\.isWhitespace\)/);
  assert.match(code, /hasLeadingSign/);
  assert.match(code, /hasTrailingSign/);
});

// ---------------------------------------------------------------------------
// Finding 2: SET condition-name-1 TO TRUE must assign the condition's first
// declared VALUE to its *parent* field (a condition-name has no Scala var of
// its own) - IF/EVALUATE TRUE WHEN <condition-name> were already fixed
// earlier (commit 5a9605e); only SET ... TO TRUE remained broken.
// ---------------------------------------------------------------------------

test('Finding 2: SET condition-name TO TRUE assigns the parent field the first declared VALUE', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS   PIC X(1) VALUE 'A'.
           88  WS-STATUS-ACTIVE  VALUE 'A'.
           88  WS-STATUS-CLOSED  VALUE 'C'.
       PROCEDURE DIVISION.
       0000-MAIN.
           SET WS-STATUS-ACTIVE TO TRUE
           SET WS-STATUS-CLOSED TO TRUE
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsStatus = "A"/);
  assert.match(code, /wsStatus = "C"/);
  // The condition name itself must never appear as an assignment target -
  // there is no `wsStatusActive` var (that was the "Not found: wsStatusActive"
  // compile error this fix eliminates).
  assert.doesNotMatch(code, /wsStatusActive\s*=/);
  assert.doesNotMatch(code, /wsStatusClosed\s*=/);
});

test('Finding 2: SET condition-name TO TRUE uses the low end of a THRU range as the first VALUE', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE   PIC 9(3) VALUE 0.
           88  WS-CODE-ERROR  VALUE 500 THRU 599.
       PROCEDURE DIVISION.
       0000-MAIN.
           SET WS-CODE-ERROR TO TRUE
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsCode = 500/);
});

// ---------------------------------------------------------------------------
// Finding 3: EVALUATE with an arithmetic-expression subject, and a full
// relational condition (not just an 88-name) as a WHEN object under
// EVALUATE TRUE.
// ---------------------------------------------------------------------------

test('Finding 3: EVALUATE <arithmetic-expression> keeps the whole expression as its subject', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC 9(3).
       01  WS-B  PIC 9(3).
       01  WS-R  PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           EVALUATE WS-A + WS-B
               WHEN 0 THRU 5
                   MOVE 'LOW' TO WS-R
               WHEN OTHER
                   MOVE 'HI' TO WS-R
           END-EVALUATE
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // Before the fix, `+ WS-B` was silently dropped (parseOperand only grabs
  // one operand), so the whole WHEN structure never even parsed as a
  // coherent EvaluateStatement - branches became unconditional/flattened.
  assert.match(code, /\(wsA \+ wsB\)\) >= \(0\)/);
  assert.match(code, /\(wsA \+ wsB\)\) <= \(5\)/);
  assert.match(code, /wsR = "LOW/);
});

test('Finding 3: EVALUATE TRUE WHEN <relational-condition> tests the condition directly, not "(true) == (subject)"', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A  PIC 9(3).
       01  WS-B  PIC 9(3).
       01  WS-R  PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           EVALUATE TRUE
               WHEN WS-A > WS-B
                   MOVE 'GT' TO WS-R
               WHEN WS-A = WS-B
                   MOVE 'EQ' TO WS-R
               WHEN OTHER
                   MOVE 'LT' TO WS-R
           END-EVALUATE
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /if \(\(wsA\) > \(wsB\)\) then/);
  assert.match(code, /else if \(\(wsA\) == \(wsB\)\) then/);
  // The pre-fix bug rendered every such WHEN as the *subject's* own value
  // compared against a (wrongly parsed) single operand, e.g. `(true) == (wsA)`
  // - a Boolean/Int comparison that doesn't even compile.
  assert.doesNotMatch(code, /\(true\) == /);
});

// ---------------------------------------------------------------------------
// Finding 4: recursive/nested PERFORM of the same paragraph mangled a
// digit-leading paragraph name inconsistently with the actual method name.
// ---------------------------------------------------------------------------

test('Finding 4: toMethodName strips a leading numeric prefix before camelCasing', () => {
  assert.equal(toMethodName('1000-RECURSE'), 'recurse');
  assert.equal(toMethodName('0100-PROCESS-RECORD'), 'processRecord');
});

test('Finding 4: PERFORM of a self-referential paragraph nested inside an IF calls the correctly-mangled method name', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 1000-RECURSE
           STOP RUN.
       1000-RECURSE.
           ADD 1 TO WS-DEPTH
           IF WS-DEPTH < 3
               PERFORM 1000-RECURSE
           END-IF.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /def recurse\(\): Unit =/);
  // The nested (inside-IF) PERFORM 1000-RECURSE must call the same `recurse()`
  // method, not a raw camelCase of the undehyphenated name (`1000Recurse()`,
  // which isn't even legal Scala and doesn't match any generated method).
  assert.doesNotMatch(code, /1000Recurse/);
  const callSites = code.match(/recurse\(\)/g) || [];
  assert.ok(callSites.length >= 2, 'expected both the top-level PERFORM and the nested PERFORM to call recurse()');
});

// ---------------------------------------------------------------------------
// Finding 5: PERFORM WITH TEST AFTER emitted invalid Scala (`do <block> while
// <cond>` - postfix do-while was removed entirely in Scala 3, not restyled).
// ---------------------------------------------------------------------------

test('Finding 5: PERFORM WITH TEST AFTER UNTIL never emits a postfix do/while', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I  PIC S9(3) VALUE 99.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM WITH TEST AFTER UNTIL WS-I > 5
               ADD 1 TO WS-I
           END-PERFORM
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // Body+test folded into the while-condition block; the loop's own `do`
  // body is empty - see method-gen.js's generatePerformFromAST. The whole
  // loop is now also wrapped in `scala.util.boundary { ... }` (round-3
  // finding 1, EXIT PERFORM support) and the increment is stored through
  // the same ROUNDED-or-truncated coercion every arithmetic statement now
  // uses (round-3 findings 8/13) instead of a bare `wsI = wsI + 1`.
  assert.match(code, /scala\.util\.boundary \{\n\s+while\n\s+wsI = \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsI\) \+ \(BigDecimal\("1"\)\)\), 3, 0\)\)\.toInt\n\s+!\(wsI > 5\)\n\s+do \(\)\n\s+\}/);
  assert.doesNotMatch(code, /^\s*do\s*$/m);
});

test('Finding 5: PERFORM WITH TEST AFTER VARYING tests before incrementing (matches installed GnuCOBOL exactly)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I    PIC S9(3).
       01  WS-SUM  PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM WITH TEST AFTER VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               ADD WS-I TO WS-SUM
           END-PERFORM
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // The increment must be inside the `do` body (skipped after the final,
  // test-failing round) while the test itself uses the still-current value -
  // verified against real GnuCOBOL to run body for i=1,2,3,4 (SUM=10), not
  // i=1,2,3 (SUM=6) - see tests/corpus/proc/r07-perf-negafter.cbl. The whole
  // loop is now also wrapped in `scala.util.boundary { ... }` (round-3
  // finding 1) and both ADD targets are stored through the same ROUNDED-or-
  // truncated coercion every arithmetic statement now uses (round-3
  // findings 8/13) instead of a bare `x = x + y`.
  assert.match(code, /scala\.util\.boundary \{\n\s+wsI = 1\n\s+while\n\s+wsSum = \(CobolFmt\.truncNumeric\(\(BigDecimal\(wsSum\) \+ \(BigDecimal\(wsI\)\)\), 3, 0\)\)\.toInt\n\s+!\(wsI > 3\)\n\s+do\n\s+wsI = wsI \+ 1\n\s+\}/);
});

// ---------------------------------------------------------------------------
// Finding 6: two different top-level records each declaring a same-named
// nested group collided in case-class codegen.
// ---------------------------------------------------------------------------

test('Finding 6: collectAmbiguousGroupClassNames/resolveClassName qualify only genuinely colliding nested group names', () => {
  const itemsA = [{ name: 'WS-A', children: [{ name: 'DTL-GROUP', children: [{ name: 'QTY', children: [] }] }] }];
  const itemsB = [{ name: 'WS-B', children: [{ name: 'DTL-GROUP', children: [{ name: 'QTY', children: [] }] }] }];
  const ambiguous = collectAmbiguousGroupClassNames([itemsA, itemsB]);
  assert.ok(ambiguous.has('DtlGroup'));
  assert.ok(!ambiguous.has('WsA'));
  assert.ok(!ambiguous.has('WsB'));

  assert.equal(resolveClassName('DTL-GROUP', { ambiguousNames: ambiguous, parentClassName: 'WsA' }), 'WsADtlGroup');
  assert.equal(resolveClassName('DTL-GROUP', { ambiguousNames: ambiguous, parentClassName: 'WsB' }), 'WsBDtlGroup');
  // A unique name is completely untouched (no accidental over-qualification).
  assert.equal(resolveClassName('WS-A', { ambiguousNames: ambiguous, parentClassName: null }), 'WsA');
});

test('Finding 6: two records with a same-named nested group generate distinct, non-colliding case classes', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A.
           05  AMOUNT      PIC 9(5)  VALUE 100.
           05  DTL-GROUP.
               10  QTY     PIC 9(3)  VALUE 5.
       01  WS-B.
           05  AMOUNT      PIC 9(5)  VALUE 200.
           05  DTL-GROUP.
               10  QTY     PIC 9(3)  VALUE 1.
       PROCEDURE DIVISION.
       0000-MAIN.
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /case class WsADtlGroup\(/);
  assert.match(code, /case class WsBDtlGroup\(/);
  // Never a bare, unqualified duplicate.
  const bareDtlGroupClasses = code.match(/case class DtlGroup\(/g) || [];
  assert.equal(bareDtlGroupClasses.length, 0);
  // And the flat-var declarations (a separate registry from the case
  // classes) must also be distinct, not both `dtlGroupQty`.
  assert.match(code, /var wsADtlGroupQty: Int/);
  assert.match(code, /var wsBDtlGroupQty: Int/);
});

// ---------------------------------------------------------------------------
// Finding 7: FUNCTION LENGTH of a GROUP item.
// ---------------------------------------------------------------------------

test('Finding 7: FUNCTION LENGTH(group-item) is the compile-time sum of its children\'s byte lengths', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-G-A  PIC X(4).
           05  WS-G-B  PIC 9(3).
       01  WS-LEN  PIC 9(2).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE FUNCTION LENGTH(WS-GROUP) TO WS-LEN
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // 4 (PIC X(4)) + 3 (PIC 9(3)) = 7, embedded as a literal, not a runtime
  // `.length` call on a nonexistent `wsGroup` var.
  assert.match(code, /wsLen = 7\b/);
  assert.doesNotMatch(code, /wsGroup\.length/);
});

// ---------------------------------------------------------------------------
// Finding 8: FUNCTION MAX/MIN over BigDecimal operands (Math.max has no
// BigDecimal overload).
// ---------------------------------------------------------------------------

test('Finding 8: FUNCTION MAX/MIN use List(...).max/.min, never Math.max/Math.min', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-V1  PIC S9(3)V99 VALUE 1.5.
       01  WS-V2  PIC S9(3)V99 VALUE 2.5.
       01  WS-R   PIC S9(3)V99.
       PROCEDURE DIVISION.
       0000-MAIN.
           COMPUTE WS-R = FUNCTION MAX(WS-V1 WS-V2)
           COMPUTE WS-R = FUNCTION MIN(WS-V1 WS-V2)
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /List\(wsV1, wsV2\)\.max/);
  assert.match(code, /List\(wsV1, wsV2\)\.min/);
  assert.doesNotMatch(code, /Math\.max/);
  assert.doesNotMatch(code, /Math\.min/);
});

test('Finding 8: MOVE FUNCTION MAX(...) TO a numeric-edited field routes through CobolFmt.edited', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-V1  PIC S9(5)V99 VALUE 1.
       01  WS-V2  PIC S9(5)V99 VALUE 2.
       01  WS-EDITED  PIC ZZ,ZZ9.99.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE FUNCTION MAX(WS-V1 WS-V2) TO WS-EDITED
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsEdited = CobolFmt\.edited\(/);
  // Never a raw BigDecimal assignment into the (String-typed) edited field.
  assert.doesNotMatch(code, /wsEdited = List\(/);
});

// ---------------------------------------------------------------------------
// Finding 9: SEARCH ... VARYING other-index semantics.
// ---------------------------------------------------------------------------

test('Finding 9: SEARCH ... VARYING uses the named identifier - not the table\'s default index - as the sole loop control', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TBL.
           05  WS-ENTRY OCCURS 5 TIMES INDEXED BY WS-IDX WS-IDX2.
               10  WS-CODE  PIC X(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           SET WS-IDX TO 1
           SEARCH WS-ENTRY VARYING WS-IDX2
               AT END
                   DISPLAY 'NOT-FOUND'
               WHEN WS-CODE(WS-IDX) = 'CCC'
                   DISPLAY 'FOUND'
           END-SEARCH
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // The loop bound/increment must use wsIdx2 (the VARYING identifier), not
  // wsIdx (the table's leftmost-declared default index) - verified against
  // installed GnuCOBOL (see tests/corpus/proc/r01-search-midtable-varying.cbl).
  assert.match(code, /while !_searchDone && wsIdx2 <= 5 do/);
  assert.doesNotMatch(code, /while !_searchDone && wsIdx <= 5 do/);
});

// ---------------------------------------------------------------------------
// Finding 10: DISPLAY of an index-name must match GnuCOBOL's runtime format
// (signed, 9-digit zero-padded).
// ---------------------------------------------------------------------------

test('Finding 10: DISPLAY of an index-name formats as signed 9-digit zero-padded, regardless of table size', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TBL.
           05  WS-ENTRY OCCURS 5 TIMES INDEXED BY WS-IDX.
               10  WS-CODE  PIC X(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           SET WS-IDX TO 4
           DISPLAY 'IDX=' WS-IDX
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  // round-7 finding 5 added a trailing `decimalComma` argument to every
  // CobolFmt.num call site (false for a program with no SPECIAL-NAMES
  // DECIMAL-POINT IS COMMA clause, like this one - byte-identical rendered
  // output). The 9-digit signed index-name format this test proves is
  // unchanged.
  assert.match(code, /CobolFmt\.num\(BigDecimal\(wsIdx\), 9, 0, true, false\)/);
});

// ---------------------------------------------------------------------------
// Finding 11: multi-key SORT with mixed ASCENDING/DESCENDING.
// ---------------------------------------------------------------------------

test('Finding 11: multi-key SORT with mixed ASCENDING/DESCENDING generates a true per-key comparator', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "S1".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-DEPT   PIC 9(3).
           05  SORT-SCORE  PIC 9(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           SORT SORT-FILE
               ON ASCENDING KEY SORT-DEPT
               ON DESCENDING KEY SORT-SCORE
               INPUT PROCEDURE 1000-FEED
               OUTPUT PROCEDURE 2000-DRAIN
           STOP RUN.
       1000-FEED.
           CONTINUE.
       2000-DRAIN.
           CONTINUE.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /sortInPlaceWith \{ \(a, b\) =>/);
  assert.match(code, /if a\.sortDept != b\.sortDept then a\.sortDept < b\.sortDept/);
  assert.match(code, /else if a\.sortScore != b\.sortScore then a\.sortScore > b\.sortScore/);
  assert.match(code, /else false/);
  // The old primary-key-only approximation (sortInPlaceBy + a whole-buffer
  // reverseInPlace) must be gone entirely.
  assert.doesNotMatch(code, /sortInPlaceBy/);
  assert.doesNotMatch(code, /reverseInPlace/);
});

// ---------------------------------------------------------------------------
// Findings 12 & 13: RELEASE ... FROM / RETURN ... INTO must perform a
// positional (structural) implicit MOVE, not a name-matched CORRESPONDING one
// (RELEASE/RETURN have no CORRESPONDING keyword and are never name-matched in
// real COBOL - the whole point of FROM/INTO is that the source/target's field
// names may legitimately differ from the SD record's own).
// ---------------------------------------------------------------------------

test('Findings 12/13: RELEASE ... FROM / RETURN ... INTO copy fields BY POSITION even when names differ', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "S1".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY   PIC 9(3).
       WORKING-STORAGE SECTION.
       01  WS-SRC-GRP.
           05  WS-SRC-KEY  PIC 9(3) VALUE 7.
       01  WS-DST-GRP.
           05  WS-DST-KEY  PIC 9(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           SORT SORT-FILE ON ASCENDING KEY SORT-KEY
               INPUT PROCEDURE 1000-FEED
               OUTPUT PROCEDURE 2000-DRAIN
           STOP RUN.
       1000-FEED.
           RELEASE SORT-REC FROM WS-SRC-GRP.
       2000-DRAIN.
           RETURN SORT-FILE INTO WS-DST-GRP
               AT END
                   CONTINUE
           END-RETURN.
`;
  const code = convertToScala(source, {}).scala;
  // RELEASE ... FROM: the differently-named source field's *value* (not a
  // name match against "SORT-KEY") is moved into the SD record field,
  // matched by declared POSITION (see positionalPairs), not by name.
  assert.match(code, /sortKey = wsSrcKey/);
  // RETURN ... INTO: the mirror image.
  assert.match(code, /wsDstKey = sortKey/);
});

// ---------------------------------------------------------------------------
// Finding 14: UNSTRING COUNT IN clause.
// ---------------------------------------------------------------------------

test('Finding 14: UNSTRING COUNT IN populates the per-field count receiver with the delimited substring\'s length', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CSV  PIC X(20) VALUE 'AA,BBB'.
       01  WS-F1   PIC X(5).
       01  WS-C1   PIC 9(2).
       01  WS-F2   PIC X(5).
       01  WS-C2   PIC 9(2).
       PROCEDURE DIVISION.
       0000-MAIN.
           UNSTRING WS-CSV DELIMITED BY ','
               INTO WS-F1 COUNT IN WS-C1
                    WS-F2 COUNT IN WS-C2
           END-UNSTRING
           STOP RUN.
`;
  const code = convertToScala(source, {}).scala;
  assert.match(code, /wsC1 = _parts\.lift\(0\)\.map\(_\.length\)\.getOrElse\(0\)/);
  assert.match(code, /wsC2 = _parts\.lift\(1\)\.map\(_\.length\)\.getOrElse\(0\)/);
});
