/**
 * tests/round16-fixes.test.js
 *
 * Focused unit tests for the round-16 adversarial-refutation findings (6
 * reported, all addressed - see tests/oracle/README.md's round-16 table for
 * the full write-up and the e02/e05/e06/e10/e13/e14 promoted oracle corpus
 * programs for the end-to-end cobc-vs-generated-Scala verification):
 *
 *   1. REDEFINES of a GROUP whose base carries a SYNC-padded child (`05
 *      WS-B REDEFINES WS-A PIC X(5)` over a group with a `PIC S9(4) COMP
 *      SYNC` child) - a hard "Not found: wsB" compile error. Two
 *      compounding gaps: redefinesAccessorLines routed EVERY group-target
 *      REDEFINES through groupOverGroupRedefinesLines, which assumes the
 *      redefining item is itself a group (declares accessors only for ITS
 *      children) - an elementary redefining item got nothing declared at
 *      all; and flattenRedefinesLeaves' text-digit model can't represent a
 *      signed/non-DISPLAY child, with no real fallback beyond an unusable
 *      stub. Fixed via a new elementaryOverGroupRedefinesLines (the missing
 *      mirror image of the elementary-target case) plus a new byte-accurate
 *      flattenRedefinesLeavesBytes fallback (reusing case-class-gen.js's own
 *      classifyCodec/decodeFieldExpr/encodeFieldExpr) - a real fix, not a
 *      degraded marker.
 *
 *   2. Reference modification as a relational-comparison operand (`IF
 *      WS-SRC(8:3) > "AAA"`) - a hard "Found: Nothing, Required:
 *      ?{compareTo}" compile error, since round-15 finding 8 only patched
 *      the STRING-segment code path, not renderComparisonExpr's `.compareTo`
 *      builder. Fixed via the same honest-decline shape (relationalOperandExpr
 *      substitutes a concrete String-typed placeholder for a ref-mod operand)
 *      - ref-mod's own semantics remain out of scope (Known Gap #1).
 *
 *   3. Reference modification as a CALL ... USING argument - SILENT WRONG
 *      OUTPUT (no crash, no marker): the callee received the FULL base
 *      variable instead of the named slice, and BY REFERENCE writeback
 *      would have corrupted the base variable's untouched bytes too. Fixed
 *      via a visible, compiling honest-decline placeholder for both the
 *      argument value and the writeback (a new 'refmod-unsupported' writer
 *      kind) - ref-mod's own semantics remain out of scope.
 *
 *   4. EVALUATE ... ALSO nested inside a PERFORM ... THRU crossing two
 *      SECTIONs, itself inside two nested PERFORM VARYING loops - a hard
 *      "Not found: <from>To<to>" compile error, since generateAllMethods's
 *      PERFORM-THRU-wrapper collection pass only ever walked each unit's own
 *      top-level statement list. Fixed via a new collectStatementsDeep that
 *      recurses into every statement-list-bearing AST field (inline PERFORM
 *      bodies, IF branches, EVALUATE WHEN/WHEN-OTHER, SEARCH WHEN, every ON
 *      EXCEPTION/SIZE ERROR/OVERFLOW/INVALID KEY/AT END list).
 *
 *   5. SEARCH over an OCCURS ... DEPENDING ON table ignored the live counter
 *      value, scanning up to the fixed declared maximum instead - SILENT
 *      WRONG OUTPUT (a row past the live count but within fixed storage was
 *      still found). Fixed by using the table's depending-on counter's own
 *      flat-var name as the loop/binary-search bound instead of the fixed
 *      max, in both generateSearch and generateSearchAll.
 *
 *   6. A bare `USAGE BINARY-LONG` item with no PIC clause (the only legal
 *      form) was silently treated as alphanumeric/DISPLAY text - SILENT
 *      WRONG OUTPUT (ADD behaved like string concatenation). Fixed by
 *      recognizing BINARY-CHAR/SHORT/LONG/DOUBLE in parseUsageClause and
 *      synthesizing their implicit PIC (S9(3)/S9(5)/S9(10)/S9(20)) when no
 *      explicit PIC was parsed, plus giving them their own fixed byte width
 *      (1/2/4/8 bytes, not digit-count-tiered) in layout.js.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/e02/e05/e06/e10/e13/e14
 * programs provide via the data-driven oracle suite. This file targets the
 * individual parser/generator mechanisms each finding traces to, in
 * isolation (no cobc/scala-cli needed), so a regression is caught at the
 * unit level even on a machine without the compiler toolchain installed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { elementaryByteLength, itemByteLength } from '../generator/layout.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: REDEFINES of a SYNC-padded group by an elementary item.
// ---------------------------------------------------------------------------

describe('round-16 finding 1: elementary item REDEFINES a group carrying a SYNC-padded child', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-A.
               10  A-LEAD PIC X(1) VALUE "Z".
               10  A-NUM  PIC S9(4) COMP SYNC VALUE 0.
               10  A-TAIL PIC X(1) VALUE "Z".
           05  WS-B REDEFINES WS-A PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-A).
           MOVE "PQRST" TO WS-B.
           DISPLAY "LEAD=" A-LEAD.
           DISPLAY "TAIL=" A-TAIL.
           DISPLAY "NUM=" A-NUM.
           STOP RUN.
`;

  test('e02 shape: wsB is declared (never "Not found: wsB") with a real getter/setter pair', () => {
    const scala = scalaOf(src);
    assert.match(scala, /def wsB: String =/);
    assert.match(scala, /def wsB_=\(v: String\): Unit =/);
    // Never the old byte-accurate model's absence - the getter must actually
    // reference all three of WS-A's children, not leave any undeclared.
    assert.match(scala, /aLead/);
    assert.match(scala, /aNum/);
    assert.match(scala, /aTail/);
  });

  test('e02 shape: the setter decodes A-NUM through CobolCodecs.binaryDecode (byte-accurate, not digit-text) and truncates to its declared 4 digits (round-15 finding 4\'s own rule, re-applied)', () => {
    const scala = scalaOf(src);
    assert.match(scala, /aNum = \(CobolFmt\.truncNumeric\(BigDecimal\(CobolCodecs\.binaryDecode\(/);
    // The old (pre-fix) shape never got this far at all (wsB was undeclared),
    // but the shape flattenRedefinesLeaves' TEXT model would have produced had
    // it not bailed on the signed COMP child is a bare substring-derived
    // digit-text decode with no byte-level codec involved at all.
    assert.doesNotMatch(scala, /aNum = v\.substring\([^)]*\)\.toInt\b/, 'must not decode A-NUM via plain digit-text substring().toInt');
  });

  test('e02 shape: the SYNC pad byte between A-LEAD and A-NUM is accounted for as a real character position (getter/setter offsets shift by 1, not just 4 total characters)', () => {
    const scala = scalaOf(src);
    // The setter must read A-NUM's own bytes starting at character position
    // 2 (index 0=A-LEAD, 1=pad, 2-3=A-NUM), not position 1 (which would be
    // the bug this fix corrects - the pad byte silently missing from the
    // flat view entirely).
    assert.match(scala, /v\.substring\(2, 4\)/);
  });

  test('itemByteLength/elementaryByteLength agree on WS-A\'s total width (5, including the SYNC pad) - the same width the byte-accurate flattener must reproduce', () => {
    const group = {
      level: 1,
      name: 'WS-A',
      children: [
        { level: 5, name: 'A-LEAD', usage: 'DISPLAY', pic: { pattern: 'X(1)', length: 1 } },
        { level: 5, name: 'A-NUM', usage: 'COMP', sync: true, pic: { pattern: 'S9(4)', integerDigits: 4, decimalDigits: 0, signed: true } },
        { level: 5, name: 'A-TAIL', usage: 'DISPLAY', pic: { pattern: 'X(1)', length: 1 } },
      ],
    };
    assert.equal(itemByteLength(group), 5);
  });

  test('regression guard: round-3 finding 6\'s own group-over-group REDEFINES (WS-DATE-ALT REDEFINES WS-DATE, both unsigned DISPLAY, no SYNC) still produces byte-for-byte the same text-model output as before this round', () => {
    const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16REGRESSION.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DATE.
           05  WS-YEAR   PIC 9(4).
           05  WS-MONTH  PIC 9(2).
       01  WS-DATE-ALT REDEFINES WS-DATE.
           05  WS-MONTH-ALT  PIC 9(2).
           05  WS-YEAR-ALT   PIC 9(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           STOP RUN.
`;
    const code = scalaOf(source);
    assert.match(
      code,
      /def wsDateAltBaseFlat: String = CobolFmt\.digitsOf\(BigDecimal\(wsYear\), 4, 0\) \+ CobolFmt\.digitsOf\(BigDecimal\(wsMonth\), 2, 0\)/
    );
    assert.match(code, /def wsMonthAlt: String = wsDateAltBaseFlat\.substring\(0, 2\)/);
    // Never routed through the new byte-accurate fallback (CobolCodecs) -
    // the pre-existing text model still handles this unsigned/no-SYNC shape
    // on its own, exactly as before round 16.
    assert.doesNotMatch(code, /CobolCodecs\.binaryDecode\(wsYear/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: reference modification as a relational-comparison operand.
// ---------------------------------------------------------------------------

describe('round-16 finding 2: reference modification as an IF/EVALUATE comparison operand no longer hard-crashes', () => {
  test('e05 shape: a ref-mod\'d operand in a ">" comparison compiles to a concrete String placeholder, not the shared Nothing-typed ??? marker', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-FLAG PIC X(1) VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-SRC(8:3) > "AAA"
               MOVE "Y" TO WS-FLAG
           END-IF.
           DISPLAY "FLAG=" WS-FLAG.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /\?\?\?.*\.compareTo/, 'must never emit a Nothing-typed ???.compareTo(...) call');
    assert.match(scala, /"" \/\* TODO: reference modification not implemented as a comparison operand/);
    assert.match(scala, /\.compareTo\(/, 'the comparison itself must still compile via .compareTo on a concrete String');
  });

  test('a non-ref-mod relational comparison is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E05PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC X(3) VALUE "AAA".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-A > "AAA"
               DISPLAY "YES"
           END-IF.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /TODO: reference modification/);
    assert.match(scala, /wsA\.compareTo\(/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: reference modification as a CALL ... USING argument.
// ---------------------------------------------------------------------------

describe('round-16 finding 3: reference modification as a CALL argument no longer silently passes the full base variable', () => {
  test('e06 shape: CALL ... USING WS-SRC(3:5) passes a visible placeholder, never the bare "wsSrc" full variable', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E06.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-RESULT PIC X(5) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "E06SUB" USING WS-SRC(3:5) WS-RESULT.
           DISPLAY "RESULT=" WS-RESULT.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. E06SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-IN PIC X(5).
       01 LS-OUT PIC X(5).
       PROCEDURE DIVISION USING LS-IN LS-OUT.
       SUB-PARA.
           MOVE LS-IN TO LS-OUT.
           GOBACK.
       END PROGRAM E06SUB.
       END PROGRAM R16E06.
`;
    const scala = scalaOf(src);
    // The old silent bug: the callee received the FULL base variable.
    assert.doesNotMatch(scala, /E06sub\.entry\(wsSrc,/);
    assert.match(scala, /"" \/\* TODO: CALL "E06SUB" USING WS-SRC\(\.\.\.\): reference modification not implemented as a CALL argument/);
    // The BY REFERENCE writeback must also be a visible no-op, not a write
    // into the untouched base variable.
    assert.match(scala, /TODO: CALL \.\.\. USING BY REFERENCE WS-SRC\(\.\.\.\): reference modification not implemented for CALL argument writeback/);
    assert.doesNotMatch(scala, /\bwsSrc = _callRet/);
  });

  test('a non-ref-mod CALL argument is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E06PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(5) VALUE "HELLO".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "SUB1" USING WS-SRC.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. SUB1.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-IN PIC X(5).
       PROCEDURE DIVISION USING LS-IN.
       SUB-PARA.
           GOBACK.
       END PROGRAM SUB1.
       END PROGRAM R16E06PLAIN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /TODO: reference modification/);
    assert.match(scala, /Sub1\.entry\(wsSrc\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4: PERFORM THRU nested deep inside other control-flow constructs.
// ---------------------------------------------------------------------------

describe('round-16 finding 4: PERFORM THRU wrapper methods are found regardless of nesting depth', () => {
  test('e10 shape: a PERFORM THRU nested inside two PERFORM VARYING loops still gets its wrapper method generated and called', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9.
       01 WS-B PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-A FROM 1 BY 1 UNTIL WS-A > 2
               PERFORM VARYING WS-B FROM 1 BY 1 UNTIL WS-B > 2
                   PERFORM SECA-P1 THRU SECB-P2
               END-PERFORM
           END-PERFORM.
           STOP RUN.

       SECTION-A SECTION.
       SECA-P1.
           DISPLAY "A".
       SECA-P2.
           DISPLAY "A2".

       SECTION-B SECTION.
       SECB-P1.
           DISPLAY "B1".
       SECB-P2.
           DISPLAY "B2".
`;
    const scala = scalaOf(src);
    // The wrapper method must actually be DECLARED, not just called.
    assert.match(scala, /def secaP1ToSecbP2\(\): Unit =/);
    // ... and called from inside the nested loop body.
    assert.match(scala, /secaP1ToSecbP2\(\)/);
  });

  test('a PERFORM THRU nested inside a single IF branch is also found (one level of nesting - narrower regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E10IF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-FLAG = "Y"
               PERFORM PARA-A THRU PARA-B
           END-IF.
           STOP RUN.
       PARA-A.
           DISPLAY "A".
       PARA-B.
           DISPLAY "B".
`;
    const scala = scalaOf(src);
    assert.match(scala, /def paraAToParaB\(\): Unit =/);
  });

  test('a top-level (non-nested) PERFORM THRU is unaffected (regression guard - the entire pre-round-16 corpus shape)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E10FLAT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-A THRU PARA-B.
           STOP RUN.
       PARA-A.
           DISPLAY "A".
       PARA-B.
           DISPLAY "B".
`;
    const scala = scalaOf(src);
    assert.match(scala, /def paraAToParaB\(\): Unit =/);
  });
});

// ---------------------------------------------------------------------------
// Finding 5: SEARCH over an OCCURS ... DEPENDING ON table.
// ---------------------------------------------------------------------------

describe('round-16 finding 5: SEARCH bounds itself by the live ODO counter, not the fixed OCCURS maximum', () => {
  test('e13 shape: SEARCH\'s loop condition compares the index against the depending-on counter\'s own var, not the fixed max literal', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E13.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-COUNT PIC 9(2) VALUE 3.
           05  WS-ROW OCCURS 1 TO 5 TIMES
                   DEPENDING ON WS-COUNT
                   INDEXED BY IDX.
               10  R-CODE PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET IDX TO 1.
           SEARCH WS-ROW
               AT END DISPLAY "NOT FOUND"
               WHEN R-CODE(IDX) = "DD"
                   DISPLAY "FOUND"
           END-SEARCH.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /while !_searchDone && idx <= wsCount do/);
    assert.doesNotMatch(scala, /while !_searchDone && idx <= 5 do/, 'must not bound the search by the fixed OCCURS maximum');
  });

  test('a fixed-size (non-ODO) OCCURS table\'s SEARCH is unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E13FIXED.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 5 TIMES INDEXED BY IDX.
               10  R-CODE PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET IDX TO 1.
           SEARCH WS-ROW
               WHEN R-CODE(IDX) = "DD"
                   DISPLAY "FOUND"
           END-SEARCH.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /while !_searchDone && idx <= 5 do/);
  });
});

// ---------------------------------------------------------------------------
// Finding 6: bare USAGE BINARY-LONG (no PIC clause) numeric typing.
// ---------------------------------------------------------------------------

describe('round-16 finding 6: a bare USAGE BINARY-LONG item (no PIC) is typed numeric, not alphanumeric', () => {
  test('e14 shape: WS-VALUE-VAL USAGE BINARY-LONG VALUE 30 declares a numeric var (Int/Long), not a String', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E14.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-VALUE-VAL USAGE BINARY-LONG VALUE 30.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD 1 TO WS-VALUE-VAL.
           DISPLAY "VALUE=" WS-VALUE-VAL.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var wsValueVal: (Int|Long) = 30L?/);
    // The old bug: ADD behaved like string concatenation.
    assert.doesNotMatch(scala, /wsValueVal = wsValueVal \+ "1"/);
    assert.doesNotMatch(scala, /var wsValueVal: String/);
  });

  test('elementaryByteLength gives BINARY-LONG its fixed 4-byte width regardless of its own (10-digit) implicit PIC digit count', () => {
    const item = {
      usage: 'BINARY-LONG',
      pic: { pattern: 'S9(10)', integerDigits: 10, decimalDigits: 0, signed: true, length: 10, dataType: 'numeric' },
    };
    assert.equal(elementaryByteLength(item), 4);
  });

  test('DISPLAY of a BINARY-LONG field zero-pads to its own 10-digit implicit width (oracle-verified: +0000000031, not a 9-digit S9(9) tiering)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E14DISP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-V USAGE BINARY-LONG VALUE 31.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "V=" WS-V.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /CobolFmt\.num\(BigDecimal\(wsV\), 10, 0, true, false\)/);
  });

  test('a PIC-less BINARY-SHORT/BINARY-CHAR/BINARY-DOUBLE item is also recognized as numeric (regression guard for the other three fixed-width native binary USAGEs)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E14OTHERS.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SHORT USAGE BINARY-SHORT VALUE 1.
       01 WS-CHAR USAGE BINARY-CHAR VALUE 2.
       01 WS-DOUBLE USAGE BINARY-DOUBLE VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /var wsShort: String/);
    assert.doesNotMatch(scala, /var wsChar: String/);
    assert.doesNotMatch(scala, /var wsDouble: String/);
  });

  test('an ordinary explicit PIC + USAGE COMP declaration is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R16E14PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC S9(4) USAGE COMP VALUE 7.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /var wsN: Int = 7/);
  });
});
