/**
 * tests/round9-fixes.test.js
 *
 * Focused unit tests for the round-9 adversarial-refutation findings (6
 * dishonest divergences fixed - EVALUATE WHEN unequal-width alphanumeric
 * comparison, group BY REFERENCE losing a signed COMP-3 child's sign across
 * a CALL boundary, group-level VALUE slicing over a COMP-3 child needing
 * cobc's actual packed-decimal byte-reinterpretation, MOVE of a subscripted
 * group-table row, a backward PERFORM ... THRU range, and DIVIDE ... GIVING
 * REMAINDER using BigDecimal's own integer-quotient `%` instead of the
 * picture-truncated stored quotient) - see tests/oracle/README.md for the
 * full end-to-end (cobc-vs-generated-Scala) verification the promoted
 * tests/corpus/proc/w*.cbl programs provide via the data-driven oracle
 * suite. This file targets the individual generator/parser mechanisms each
 * finding traces to, in isolation (no cobc/scala-cli needed), so a
 * regression is caught at the unit level even on a machine without the
 * compiler toolchain installed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: EVALUATE WHEN <unequal-width alphanumeric> - evaluateConditionExpr's
// VALUE case rendered a bare `(subject) == (value)` with no space-padding,
// unlike an ordinary IF/relational comparison (round-8 finding 3's
// renderRelationalCondition). Fixed by factoring renderRelationalCondition's
// operand-classification/padding core into renderComparisonExpr and reusing
// it from evaluateConditionExpr's VALUE case too.
// ---------------------------------------------------------------------------

const EVALUATE_UNEQUAL_WIDTH_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. W01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-LONG      PIC X(6) VALUE "AB    ".
       01 WS-SHORT     PIC X(2) VALUE "AB".
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE WS-LONG
               WHEN "AB"
                   DISPLAY "MATCHED-LITERAL"
               WHEN OTHER
                   DISPLAY "NO-MATCH-LITERAL"
           END-EVALUATE.
           EVALUATE WS-LONG
               WHEN WS-SHORT
                   DISPLAY "MATCHED-FIELD"
               WHEN OTHER
                   DISPLAY "NO-MATCH-FIELD"
           END-EVALUATE.
           STOP RUN.
`;

test('Finding 1: EVALUATE WHEN against a shorter literal/field space-pads before comparing (matches renderRelationalCondition\'s own IF-comparison padding)', () => {
  const code = scalaOf(EVALUATE_UNEQUAL_WIDTH_SOURCE);
  // WS-LONG (width 6) vs the 2-char literal "AB": the literal side must be
  // padded with 4 spaces before the comparison, exactly like an IF would.
  assert.match(code, /wsLong == \("AB" \+ "    "\)/,
    'a bare Scala String == would silently be false for every real match (COBOL treats "AB" == "AB    " as equal)');
  // WS-LONG (6) vs WS-SHORT (2): WS-SHORT must be padded too.
  assert.match(code, /wsLong == \(wsShort \+ "    "\)/, 'WS-SHORT (2 chars) must be space-padded to WS-LONG\'s 6-char width before comparing');
});

// ---------------------------------------------------------------------------
// Finding 2: group BY REFERENCE with a signed COMP-3 child - groupDisplayValueExpr/
// scatterGroupFromString (round-8 finding 1's marshalling channel) used
// CobolFmt.digitsOf's own unsigned digit text with no sign at all, so a
// negative value's sign was silently dropped crossing a CALL boundary. Fixed
// by prepending a one-character '+'/'-' sign marker (both functions updated
// symmetrically) for a signed numeric child only.
// ---------------------------------------------------------------------------

const SIGNED_GROUP_BYREF_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. W02MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-AMT     PIC S9(5)V99 COMP-3 VALUE -123.45.
           05 WS-TAG     PIC X(4)     VALUE "INIT".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE AMT=" WS-AMT " TAG=" WS-TAG.
           CALL "W02SUB" USING BY REFERENCE WS-REC.
           DISPLAY "AFTER  AMT=" WS-AMT " TAG=" WS-TAG.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. W02SUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-REC.
           05 LK-AMT     PIC S9(5)V99 COMP-3.
           05 LK-TAG     PIC X(4).
       PROCEDURE DIVISION USING LK-REC.
       SUB-PARA.
           DISPLAY "SUB SEES AMT=" LK-AMT " TAG=" LK-TAG.
           GOBACK.
       END PROGRAM W02SUB.
       END PROGRAM W02MAIN.
`;

test('Finding 2a: a signed numeric group child\'s marshalled text carries a \'+\'/\'-\' sign marker ahead of its digit text', () => {
  const code = scalaOf(SIGNED_GROUP_BYREF_SOURCE);
  assert.match(code, /if wsAmt < BigDecimal\(0\) then "-" else "\+"/,
    'the CALL argument must classify WS-AMT\'s own sign at marshal time, not just render unsigned digitsOf text');
});

test('Finding 2b: scattering a signed child back out consumes the leading sign character and negates the parsed magnitude when it is \'-\'', () => {
  const code = scalaOf(SIGNED_GROUP_BYREF_SOURCE);
  assert.match(code, /== "-" then -\(/, 'the scatter/writeback direction must be the exact inverse of the sign-marshalling above');
});

test('Finding 2c regression guard: an UNSIGNED numeric group child keeps its prior (no sign marker) marshalled text unchanged', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. TMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-AMT     PIC 9(5)V99 COMP-3 VALUE 123.45.
           05 WS-TAG     PIC X(4)     VALUE "INIT".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "TSUB" USING BY REFERENCE WS-REC.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. TSUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-REC.
           05 LK-AMT     PIC 9(5)V99 COMP-3.
           05 LK-TAG     PIC X(4).
       PROCEDURE DIVISION USING LK-REC.
       SUB-PARA.
           GOBACK.
       END PROGRAM TSUB.
       END PROGRAM TMAIN.
`;
  const code = scalaOf(source);
  assert.doesNotMatch(code, /if wsAmt < BigDecimal\(0\)/, 'an unsigned child must not gain a sign marker at all');
  assert.match(code, /CobolFmt\.digitsOf\(wsAmt, 5, 2\)/);
});

// ---------------------------------------------------------------------------
// Finding 3: group-level VALUE slicing over a COMP-3 child - the compile-time
// default-value inheritance (defaultElementaryValueWithInheritance) assumed
// every VALUE-inheriting child's byte span holds plain ASCII digit text
// (the DISPLAY-numeric convention) even for a packed-decimal child, whose
// *actual* cobc-observed behavior byte-reinterprets that same span as real
// COMP-3 nibbles. Fixed by routing a COMP-3/BINARY child through
// nonDisplayInheritedNumericText (reusing codecs.js's packedDecode/
// binaryDecode), matched against installed GnuCOBOL (w03).
// ---------------------------------------------------------------------------

const GROUP_VALUE_COMP3_SLICE_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. W03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC VALUE "AB1234CD".
           05 WS-CODE   PIC X(2).
           05 WS-AMT    PIC 9(4) COMP-3.
           05 WS-TAIL   PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;

test('Finding 3: a COMP-3 child inheriting a group VALUE clause reinterprets its byte span as real packed-decimal nibbles (cobc-verified "1323", not the naive DISPLAY-digit-text "0123")', () => {
  const code = scalaOf(GROUP_VALUE_COMP3_SLICE_SOURCE);
  assert.match(code, /var wsCode: String = "AB"/);
  assert.match(code, /var wsAmt: BigDecimal = BigDecimal\("1323"\)/,
    'WS-AMT\'s 3-byte span ("123" ASCII, bytes 0x31 0x32 0x33) packed-decimal-decodes to 1323, matching cobc exactly - not "0123"');
  assert.match(code, /var wsTail: String = "4C"/);
});

test('Finding 3 regression guard: an ordinary DISPLAY-usage numeric child inheriting a group VALUE clause is unaffected (still plain ASCII digit text)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC VALUE "AB1234CD".
           05 WS-CODE   PIC X(2).
           05 WS-NUM    PIC 9(4).
           05 WS-TAIL   PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
  const code = scalaOf(source);
  assert.match(code, /var wsNum: Int = 1234/);
});

// ---------------------------------------------------------------------------
// Finding 4: MOVE of a subscripted whole-group table row (`MOVE WS-ROW(1) TO
// WS-ROW(3)`) - neither the bare-group MOVE path (groupRefNameUpper requires
// zero subscripts) nor the elementary fallback (WS-ROW itself has no flat
// var) handled this at all, producing a "Not found: wsRow" hard compile
// error. Fixed by subscriptedGroupRowRef/generateSubscriptedGroupMove
// composing each child's own .updated(...) write/read at the two row
// indices.
// ---------------------------------------------------------------------------

const MOVE_WHOLE_ROW_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. W05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-ROW OCCURS 3 TIMES.
               10 WS-A PIC X(3).
               10 WS-B PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-ROW(1) TO WS-ROW(3).
           STOP RUN.
`;

test('Finding 4: MOVE of a subscripted group-table row composes each child\'s own Vector .updated read/write at the row indices, never a bare (nonexistent) row var', () => {
  const code = scalaOf(MOVE_WHOLE_ROW_SOURCE);
  // WS-ROW gets a synthetic case class (WsRow) purely for byte-level record
  // layout purposes (unrelated to this fix) - but the PROCEDURE DIVISION
  // itself (mainPara's own body) must never reference a flat `wsRow` var,
  // which does not exist.
  const mainParaBody = code.match(/def mainPara\(\): Unit =[\s\S]*?(?=\n  @main|\nend )/)[0];
  assert.doesNotMatch(mainParaBody, /\bwsRow\b/, 'WS-ROW has no flat Scala var of its own - mainPara should never reference one named wsRow');
  assert.match(mainParaBody, /wsA = wsA\.updated\(2, wsA\(0\)\)/, 'WS-A (row child) must be copied from index 0 (WS-ROW(1)) to index 2 (WS-ROW(3))');
  assert.match(mainParaBody, /wsB = wsB\.updated\(2, wsB\(0\)\)/, 'WS-B (row child) must be copied the same way');
});

// ---------------------------------------------------------------------------
// Finding 5: a backward PERFORM ... THRU range (`PERFORM PARA-C THRU PARA-A`
// where PARA-A is declared before PARA-C) - the range-collection loop's own
// `if (u.name === toParagraph) break` fired on PARA-A before PARA-C
// (fromParagraph) was ever reached, silently generating an empty no-op
// wrapper. Fixed by detecting endIndex < startIndex explicitly and matching
// cobc's actual verified behavior: run only the start paragraph (plus
// whatever naturally falls through after it), then never return to the
// PERFORM's own caller (an implicit "falls off the end of the PROCEDURE
// DIVISION" termination).
// ---------------------------------------------------------------------------

const PERFORM_THRU_BACKWARD_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. W10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-COUNT  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-C THRU PARA-A.
           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.
       PARA-A.
           ADD 1 TO WS-COUNT.
           DISPLAY "IN-PARA-A".
       PARA-B.
           ADD 10 TO WS-COUNT.
           DISPLAY "IN-PARA-B".
       PARA-C.
           ADD 100 TO WS-COUNT.
           DISPLAY "IN-PARA-C".
`;

test('Finding 5: a backward PERFORM ... THRU range runs the start paragraph then terminates (never returns to its own caller\'s next statement)', () => {
  const code = scalaOf(PERFORM_THRU_BACKWARD_SOURCE);
  const wrapperMatch = code.match(/def paraCToParaA\(\): Unit =[\s\S]*?(?=\n  def |\n@main|\nend )/);
  assert.ok(wrapperMatch, 'the PERFORM ... THRU wrapper method must still be generated');
  const wrapperBody = wrapperMatch[0];
  assert.doesNotMatch(wrapperBody, /^\s*\(\)\s*$/m, 'must not be the old empty no-op stub');
  assert.match(wrapperBody, /paraC\(\)/, 'must actually call the start paragraph (PARA-C)');
  assert.match(wrapperBody, /sys\.exit\(0\)/, 'must terminate rather than fall back through to mainPara\'s own next statement');
});

test('Finding 5 regression guard: an ordinary FORWARD PERFORM ... THRU range is unaffected (no sys.exit, normal return to caller)', () => {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-COUNT  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-A THRU PARA-B.
           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.
       PARA-A.
           ADD 1 TO WS-COUNT.
       PARA-B.
           ADD 10 TO WS-COUNT.
`;
  const code = scalaOf(source);
  const wrapperMatch = code.match(/def paraAToParaB\(\): Unit =[\s\S]*?(?=\n  def |\n@main|\nend )/);
  assert.ok(wrapperMatch);
  assert.doesNotMatch(wrapperMatch[0], /sys\.exit\(0\)/, 'a forward range must not gain the backward-range termination marker');
});

// ---------------------------------------------------------------------------
// Finding 6: DIVIDE ... GIVING q REMAINDER r where q's own declared decimal
// digits are wide enough that no truncation actually occurs - the remainder
// was computed via BigDecimal's own `%` operator, which effectively uses an
// *integer*-floor quotient (floor(7.5/2.0) = 3, remainder 1.5) instead of
// COBOL's own decimal-digit-truncated quotient (3.75, remainder 0). Fixed by
// computing REMAINDER as dividend - (storedQuotientBDExpr * divisor), using
// the first GIVING target's own actually-stored (ROUNDED-or-truncated)
// quotient value.
// ---------------------------------------------------------------------------

const DIVIDE_REMAINDER_SCALE_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. W11.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DVD    PIC 9(4)V9(4) VALUE 7.5000.
       01 WS-DVS    PIC 9(4)V9(4) VALUE 2.0000.
       01 WS-QUOT   PIC 9(4)V9(4).
       01 WS-REM    PIC 9(4)V9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DIVIDE WS-DVD BY WS-DVS GIVING WS-QUOT REMAINDER WS-REM.
           STOP RUN.
`;

test('Finding 6: DIVIDE ... GIVING ... REMAINDER computes the remainder from the stored (picture-truncated) quotient, never a bare BigDecimal `%`', () => {
  const code = scalaOf(DIVIDE_REMAINDER_SCALE_SOURCE);
  assert.doesNotMatch(code, /wsDvd\) % \(wsDvs\)|% wsDvs/, 'must not use BigDecimal\'s own integer-floor-quotient % operator at all');
  assert.match(code, /CobolFmt\.truncNumeric\(\(wsDvd \/ wsDvs\), 4, 4\)/,
    'the remainder computation must reuse the exact same store-time truncation formula the quotient itself is stored with');
  assert.match(code, /wsDvd - \(\(CobolFmt\.truncNumeric\(\(wsDvd \/ wsDvs\), 4, 4\)\) \* wsDvs\)/,
    'REMAINDER = dividend - (stored quotient * divisor)');
});
