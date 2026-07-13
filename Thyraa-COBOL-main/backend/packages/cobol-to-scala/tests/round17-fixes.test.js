/**
 * tests/round17-fixes.test.js
 *
 * Focused unit tests for the round-17 adversarial-refutation findings (8
 * reported) - see tests/oracle/README.md's round-17 table for the full
 * write-up and the f01/f02/f04/f06/f07/f09/f10/f12/f13 promoted oracle corpus
 * programs for the end-to-end cobc-vs-generated-Scala verification.
 *
 * Findings 2, 4, 6, 7, 8 are FULL FIXES - the promoted program for each
 * fully passes `oracleCompare()` (generated Scala output matches real
 * GnuCOBOL byte-for-byte). Findings 1, 3, 5 are HONEST-DECLINE ROUTES -
 * reference modification (Known Gap #1) and CALL-argument group-with-OCCURS
 * marshalling (round-13 finding 1) both remain explicitly out of scope; the
 * fix in each case is only to stop a hard compile crash (findings 1, 3) or a
 * silent wrong-value pass-through (finding 5 - already generalized by
 * round-13's own mode-agnostic fix, see that finding's own describe block
 * below) with a visible, compiling TODO placeholder instead.
 *
 *   1. Reference modification (`identifier(start:length)`, Known Gap #1)
 *      used as a MOVE target's SOURCE when the target is NUMERIC (`MOVE
 *      WS-SRC(3:4) TO WS-NUM` where WS-NUM is `PIC 9(4)`) - a hard
 *      "Ambiguous overload" compile error: `BigDecimal(???)` doesn't resolve
 *      because every one of BigDecimal.apply's overloads accepts `Nothing`.
 *      Fixed via the shared `refModNumericPlaceholder` helper - a concrete
 *      `BigDecimal(0)` honest placeholder - routed through
 *      `renderVariableMoveSource`.
 *
 *   2. Reference modification used as a `FUNCTION LENGTH` argument
 *      (`FUNCTION LENGTH(WS-SRC(3:4))`) previously ignored `.refMod`
 *      entirely and returned the BASE field's own full declared length -
 *      SILENT WRONG OUTPUT. This is a FULL FIX, not a decline: the ref-mod's
 *      length operand is a compile-time-known literal in the common case,
 *      so `functionLength()` now returns that literal directly (falling back
 *      to an honest TODO only when the length operand is itself a variable/
 *      expression, not a literal).
 *
 *   3. Reference modification used as a plain DISPLAY operand
 *      (`DISPLAY WS-SRC(start:4)`) - a hard "Found: Nothing, Required:
 *      ?{padTo}" compile error, since every branch of
 *      `renderDisplayOperand` calls a member directly on the shared
 *      `Nothing`-typed `???` placeholder. Fixed via the shared
 *      `refModStringPlaceholder` helper, detected up front before any
 *      type-specific DISPLAY branch is reached.
 *
 *   4. SYNC on the REDEFINING item (not the target) - `01 WS-B REDEFINES
 *      WS-A` where WS-B has a `PIC S9(4) COMP SYNC` child - previously
 *      sized EVERY child (DISPLAY or not) by its PICTURE's digit count,
 *      never its true binary storage width, silently walking the running
 *      offset past the target's own bounds
 *      (`StringIndexOutOfBoundsException` at runtime). Real fix:
 *      `characterSlicedGroupRedefinesLines` now sizes a non-DISPLAY child by
 *      its real `elementaryByteLength`, accounts for SYNC pad bytes via
 *      `syncPadBytes`, and decodes/encodes it through the same byte-level
 *      codec dispatch (`classifyCodec`/`decodeFieldExpr`/`encodeFieldExpr`)
 *      real file-record I/O already uses. A companion bug found while fixing
 *      this (a REDEFINES item that is itself a GROUP was never registered in
 *      groupRegistry/groupKeyRegistry/groupByteLengthRegistry at all - a hard
 *      "Not found" compile error for `FUNCTION LENGTH`/MOVE/DISPLAY of the
 *      bare redefining group name) is fixed in the same pass.
 *
 *   5. `CALL ... USING BY CONTENT` of a GROUP containing an OCCURS table -
 *      reported as silent wrong output (the callee would see blank/default
 *      table elements instead of the caller's actual values). Investigation
 *      found this is ALREADY covered by round-13 finding 1's own fix:
 *      `generateCall`'s `argExprs`/`refWriters` construction (`generator/
 *      expression-gen.js`) never branches on `param.mode` for the
 *      group-with-OCCURS honest-placeholder case at all - it applies
 *      identically regardless of BY CONTENT/BY REFERENCE/BY VALUE. No new
 *      production code was needed; this describe block exists to pin that
 *      finding down with a direct regression test (BY CONTENT and BY
 *      REFERENCE both hit the exact same visible TODO placeholder, and BY
 *      CONTENT correctly omits the writeback line BY REFERENCE gets, since
 *      BY CONTENT never writes back).
 *
 *   6. INSPECT REPLACING/CONVERTING on a SUBSCRIPTED table element
 *      (`INSPECT WS-ROW(3) REPLACING ALL "A" BY "Z"`) - a hard "value update
 *      is not a member of Vector[String]" compile error, since the
 *      write-back previously hand-built a naive `${target} = ${expr}`
 *      string (fine for a scalar, but Scala's `x(i) = v` assignment sugar
 *      needs a real `.update` method an immutable Vector doesn't have).
 *      Real fix: routed through the shared `renderAssignment` helper every
 *      other subscripted-write call site already uses (a pure no-op for a
 *      non-subscripted target).
 *
 *   7. SEARCH ALL on a 3+ dimension OCCURS table - the binary search's own
 *      key-lookup expression (`${pk.camel}(${idxVar} - 1)`) never accounted
 *      for the OUTER (fixed) subscripts a 3+-dimension table's key field
 *      needs before its own innermost, search-driven index. Real fix: new
 *      `outerKeySubscriptChain` helper prepends every subscript but the
 *      innermost one (a pure no-op for a 1-dimension table, where that list
 *      is always empty).
 *
 *   8. EVALUATE TRUE with an 88-level condition-name declared under a
 *      REDEFINES target - never registered in conditionRegistry at all
 *      (the REDEFINES branch of buildFieldRegistry's walk() `continue`s
 *      before ever reaching the ordinary elementary-leaf conditionRegistry
 *      registration loop) - a hard "Not found: flagLow" compile error. Real
 *      fix: register the REDEFINES item's own `.conditions` right where its
 *      own accessor is declared.
 *
 * A shared `refModGapComment`/`refModStringPlaceholder`/
 * `refModNumericPlaceholder` helper trio (generator/expression-gen.js) now
 * centralizes the ref-mod honest-placeholder text/shape used across findings
 * 1 and 3 here AND every pre-existing round-15/round-16 ref-mod call site
 * (STRING segment source, relational comparison, CALL argument) - see the
 * "shared helper refactor" describe block below, and
 * tests/round15-fixes.test.js/tests/round16-fixes.test.js (unmodified,
 * still green) for the regression coverage confirming those older call
 * sites produce byte-for-byte the same text as before this refactor.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/f01/f02/f04/f06/f07/
 * f09/f10/f12/f13 programs provide via the data-driven oracle suite. This
 * file targets the individual parser/generator mechanisms each finding
 * traces to, in isolation (no cobc/scala-cli needed).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: reference modification as a MOVE numeric target's source.
// ---------------------------------------------------------------------------

describe('round-17 finding 1: reference modification as a MOVE numeric-target source no longer hits an ambiguous BigDecimal overload', () => {
  test('f01 shape: MOVE WS-SRC(3:4) TO a PIC 9(4) target substitutes BigDecimal(0), never the bare Nothing-typed ??? placeholder', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "34567890AB".
       01 WS-NUM PIC 9(4) VALUE ZERO.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-SRC(3:4) TO WS-NUM.
           DISPLAY "NUM=" WS-NUM.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /wsNum = CobolFmt\.truncNumeric\(BigDecimal\(0\) \/\* TODO: reference modification not implemented as a MOVE numeric target/
    );
    assert.doesNotMatch(scala, /BigDecimal\(\?\?\?/, 'must never feed the shared ??? placeholder directly to BigDecimal(...)');
  });

  test('a decimal (PIC 9(3)V99) numeric target gets the same honest placeholder', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F01DEC.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "34567890AB".
       01 WS-DEC PIC 9(3)V99 VALUE ZERO.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-SRC(1:5) TO WS-DEC.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /wsDec = CobolFmt\.truncNumeric\(BigDecimal\(0\) \/\* TODO: reference modification not implemented as a MOVE numeric target - see tests\/oracle\/README\.md known gaps \*\/, 3, 2\)/
    );
  });

  test('a non-ref-mod MOVE to a numeric target is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F01PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC 9(4) VALUE 1234.
       01 WS-NUM PIC 9(4) VALUE ZERO.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-SRC TO WS-NUM.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /TODO: reference modification/);
    assert.match(scala, /wsNum = CobolFmt\.truncNumeric\(BigDecimal\(wsSrc\), 4, 0\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: FUNCTION LENGTH of a reference-modified argument.
// ---------------------------------------------------------------------------

describe('round-17 finding 2: FUNCTION LENGTH of a ref-mod\'d argument returns the substring length, not the base field\'s full length', () => {
  test('f02 shape: FUNCTION LENGTH(WS-SRC(3:4)) folds to the literal 4, not WS-SRC\'s own 10-character declared length', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-LEN PIC 9(2) VALUE ZERO.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "FULLEN=" FUNCTION LENGTH(WS-SRC).
           DISPLAY "SUBLEN=" FUNCTION LENGTH(WS-SRC(3:4)).
           MOVE FUNCTION LENGTH(WS-SRC(2:5)) TO WS-LEN.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // Plain (non-ref-mod) argument: unaffected, still the base field's own
    // full declared length, folded to a bare literal (unpadded, unlike the
    // ref-mod'd DISPLAY case below).
    assert.match(scala, /println\("FULLEN=" \+ 10\)/);
    // Ref-mod'd argument DISPLAYed directly: cobc's own 10-digit zero-padded
    // runtime-intrinsic-result format, folded from the literal length (4).
    assert.match(scala, /println\("SUBLEN=" \+ CobolFmt\.num\(BigDecimal\(4\), 10, 0, false, false\)\)/);
    // Ref-mod'd argument fed into a MOVE: a bare numeric literal (5), not
    // pre-formatted display text.
    assert.match(scala, /wsLen = 5/);
    assert.doesNotMatch(scala, /TODO: FUNCTION LENGTH of a reference-modified argument/);
  });

  test('a ref-mod\'d FUNCTION LENGTH argument whose length operand is a variable (not a literal) honestly declines instead of guessing', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F02VAR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-LEN-VAR PIC 9(2) VALUE 4.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "L=" FUNCTION LENGTH(WS-SRC(3:WS-LEN-VAR)).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /TODO: FUNCTION LENGTH of a reference-modified argument whose length operand is not a literal - not implemented - see tests\/oracle\/README\.md known gaps/
    );
  });
});

// ---------------------------------------------------------------------------
// Finding 3: reference modification as a plain DISPLAY operand.
// ---------------------------------------------------------------------------

describe('round-17 finding 3: reference modification as a plain DISPLAY operand no longer hits a Nothing.padTo compile error', () => {
  test('f04 shape: DISPLAY of a ref-mod\'d operand (whose own start expression is itself ref-mod\'d) substitutes the shared String placeholder', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F04.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-POS PIC X(1) VALUE "3".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "OUTER=" WS-SRC(FUNCTION NUMVAL(WS-POS(1:1)) : 4).
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /println\("OUTER=" \+ "" \/\* TODO: reference modification not implemented as a DISPLAY operand - see tests\/oracle\/README\.md known gaps \*\/\)/
    );
    assert.doesNotMatch(scala, /\?\?\?.*\.padTo/, 'must never call .padTo directly on the shared Nothing-typed ??? placeholder');
  });

  test('a non-ref-mod DISPLAY operand is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F04PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(5) VALUE "HELLO".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY WS-SRC.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /TODO: reference modification/);
    assert.match(scala, /wsSrc/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4: SYNC on the REDEFINING item (not the target).
// ---------------------------------------------------------------------------

describe('round-17 finding 4: SYNC on a REDEFINING item\'s own child is sized by its true byte width, not its PICTURE digit count', () => {
  test('f06 shape: B-NUM (PIC S9(4) COMP SYNC) redefining a PIC X(4) target decodes/encodes via CobolCodecs.binaryDecode/binaryEncode over its real 2-byte slice, with the SYNC pad byte accounted for', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F06.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC X(4) VALUE "PQRS".
       01 WS-B REDEFINES WS-A.
          05 B-LEAD PIC X(1).
          05 B-NUM PIC S9(4) COMP SYNC.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-B).
           DISPLAY "NUM=" B-NUM.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // B-LEAD occupies byte 0; the SYNC pad byte lands at byte 1; B-NUM's
    // real 2-byte binary slice is bytes 2-3 - not the naive
    // digit-count-derived (and out-of-bounds) slice a PICTURE-length model
    // would have produced.
    assert.match(scala, /def bNum: Int = .*CobolCodecs\.binaryDecode\(\(wsA\.substring\(2, 4\)\)\.getBytes/);
    assert.match(scala, /def bNum_=\(v: Int\): Unit = wsA = wsA\.substring\(0, 2\) \+ new String\(CobolCodecs\.binaryEncode\(v\.toLong, 2,/);
    // Never the plain digit-text substring/toInt model a DISPLAY child uses.
    assert.doesNotMatch(scala, /def bNum: Int = .*\.substring\([^)]*\)\.toInt\b/);
    // The companion bug: WS-B (the REDEFINING item, itself a group) must be
    // registered so FUNCTION LENGTH(WS-B) resolves (folds to a literal 4,
    // WS-A's own byte width) rather than crashing "Not found: wsB".
    assert.match(scala, /println\("LEN=" \+ 4\)/);
  });

  test('a DISPLAY-only redefining group (no non-DISPLAY child) is completely unaffected (regression guard - the pre-round-17 text model)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F06PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC X(6) VALUE "123456".
       01 WS-B REDEFINES WS-A.
          05 B-ONE PIC X(3).
          05 B-TWO PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /def bOne: String = wsA\.substring\(0, 3\)/);
    assert.match(scala, /def bTwo: String = wsA\.substring\(3, 6\)/);
    assert.doesNotMatch(scala, /CobolCodecs\.binaryDecode\(wsA/);
  });
});

// ---------------------------------------------------------------------------
// Finding 5: CALL ... USING BY CONTENT of a group with an OCCURS table.
// ---------------------------------------------------------------------------

describe('round-17 finding 5: CALL ... USING BY CONTENT of a group-with-OCCURS argument gets the same honest placeholder BY REFERENCE already gets', () => {
  test('f09 shape: BY CONTENT of a group containing an OCCURS table substitutes the shared honest placeholder, never a silent pass-through of the group\'s real values', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F09.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-COUNT  PIC 9(2) VALUE 3.
           05 WS-ITEM   PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "R17F09SUB" USING BY CONTENT WS-REC.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F09SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-REC.
           05 LK-COUNT PIC 9(2).
           05 LK-ITEM  PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION USING LK-REC.
       SUB-PARA.
           GOBACK.
       END PROGRAM R17F09SUB.
       END PROGRAM R17F09.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /R17f09sub\.entry\(\("" \/\* TODO: CALL "R17F09SUB" USING WS-REC: group argument marshalling not supported for a group containing an OCCURS table - see tests\/oracle\/README\.md known gaps \*\/\)\)/
    );
    // BY CONTENT never writes back - no "group writeback not supported"
    // no-op marker should be emitted at all (unlike the BY REFERENCE case
    // below), since there is nothing to write back for a BY CONTENT operand.
    assert.doesNotMatch(scala, /group writeback not supported/);
  });

  test('the same shape under (default) BY REFERENCE hits the identical argument placeholder, plus an additional writeback no-op marker BY CONTENT correctly omits', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F09REF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-COUNT  PIC 9(2) VALUE 3.
           05 WS-ITEM   PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "R17F09REFSUB" USING WS-REC.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F09REFSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-REC.
           05 LK-COUNT PIC 9(2).
           05 LK-ITEM  PIC X(4) OCCURS 3 TIMES.
       PROCEDURE DIVISION USING LK-REC.
       SUB-PARA.
           GOBACK.
       END PROGRAM R17F09REFSUB.
       END PROGRAM R17F09REF.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /"" \/\* TODO: CALL "R17F09REFSUB" USING WS-REC: group argument marshalling not supported for a group containing an OCCURS table - see tests\/oracle\/README\.md known gaps \*\//
    );
    assert.match(scala, /group writeback not supported for this shape.*value left unchanged/);
  });
});

// ---------------------------------------------------------------------------
// Finding 6: INSPECT REPLACING/CONVERTING on a subscripted table element.
// ---------------------------------------------------------------------------

describe('round-17 finding 6: INSPECT REPLACING on a subscripted table element no longer emits an illegal Vector element assignment', () => {
  test('f10 shape: INSPECT WS-ROW(3) REPLACING ALL "A" BY "Z" writes back via .updated(...), never a bare wsRow(2) = ... assignment', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-COUNT PIC 9 VALUE 3.
           05 WS-ROW OCCURS 1 TO 5 TIMES
              DEPENDING ON WS-COUNT PIC X(8).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAAAAA" TO WS-ROW(3).
           INSPECT WS-ROW(3) REPLACING ALL "A" BY "Z".
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsRow = wsRow\.updated\(2, CobolInspect\.replaceAll\(wsRow\(2\), "A", "Z"\)\)/);
    assert.doesNotMatch(scala, /^\s*wsRow\(2\) = /m, 'must never emit an illegal Vector element assignment');
  });

  test('a non-subscripted INSPECT REPLACING target is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F10PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FIELD PIC X(8) VALUE "AAAAAAAA".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-FIELD REPLACING ALL "A" BY "Z".
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsField = CobolInspect\.replaceAll\(wsField, "A", "Z"\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 7: SEARCH ALL on a 3+ dimension OCCURS table.
// ---------------------------------------------------------------------------

describe('round-17 finding 7: SEARCH ALL over a 3-dimension OCCURS table threads the outer (fixed) subscripts before the search-driven index', () => {
  test('f12 shape: the binary search\'s key-lookup expression is wsCellKey(idx1-1)(idx2-1)(idx3-1), not the bare (single-dimension) wsCellKey(idx3-1)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F12.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 2 INDEXED BY IDX1.
               10  WS-COL OCCURS 2 INDEXED BY IDX2.
                   15  WS-CELL OCCURS 4 ASCENDING KEY WS-CELL-KEY
                       INDEXED BY IDX3.
                       20  WS-CELL-KEY PIC 9(2).
                       20  WS-CELL-VAL PIC 9(2).
       01  TARGET-KEY PIC 9(2) VALUE 35.
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET IDX1 TO 2.
           SET IDX2 TO 1.
           SET IDX3 TO 1.
           SEARCH ALL WS-CELL
               WHEN WS-CELL-KEY(IDX1, IDX2, IDX3) = TARGET-KEY
                   DISPLAY "FOUND"
           END-SEARCH.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // round-18 finding 8 added a defensive `.max(0)` guard to every
    // non-literal subscript index built via subscriptIndexExpr (see its own
    // doc comment) - outerKeySubscriptChain's two outer (fixed) subscripts
    // go through it (a no-op here), but the innermost search-driven index
    // (idx3 - 1) is built directly by the binary search itself, not through
    // subscriptIndexExpr, so it is unaffected.
    assert.match(scala, /val _key0 = wsCellKey\(\(idx1 - 1\)\.toInt\.max\(0\)\)\(\(idx2 - 1\)\.toInt\.max\(0\)\)\(idx3 - 1\)/);
    assert.doesNotMatch(scala, /val _key0 = wsCellKey\(idx3 - 1\)/, 'must not drop the two outer (fixed) subscripts');
  });

  test('a 1-dimension OCCURS table\'s SEARCH ALL is completely unaffected (regression guard - outerKeySubscriptChain is a no-op)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F12FLAT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 3 ASCENDING KEY WS-KEY INDEXED BY IDX.
               10  WS-KEY PIC 9(2).
       01  TARGET-KEY PIC 9(2) VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET IDX TO 1.
           SEARCH ALL WS-ROW
               WHEN WS-KEY(IDX) = TARGET-KEY
                   DISPLAY "FOUND"
           END-SEARCH.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /val _key0 = wsKey\(idx - 1\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 8: EVALUATE TRUE with an 88-level condition-name on a REDEFINES target.
// ---------------------------------------------------------------------------

describe('round-17 finding 8: an 88-level condition-name declared under a REDEFINES target is registered and resolvable', () => {
  test('f13 shape: EVALUATE TRUE WHEN FLAG-LOW (an 88-level under WS-FLAG-NUM REDEFINES WS-FLAG) compiles to a real condition check, never "Not found: flagLow"', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F13.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X(1) VALUE "2".
       01 WS-FLAG-NUM REDEFINES WS-FLAG PIC 9(1).
           88 FLAG-LOW VALUE 0 1.
           88 FLAG-MID VALUE 2 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE TRUE
               WHEN FLAG-LOW
                   DISPLAY "RESULT=LOW"
               WHEN FLAG-MID
                   DISPLAY "RESULT=MID"
               WHEN OTHER
                   DISPLAY "RESULT=OTHER"
           END-EVALUATE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /if \(\(\(wsFlagNum == "0"\) \|\| \(wsFlagNum == "1"\)\)\) then/);
    assert.match(scala, /else if \(\(\(wsFlagNum == "2"\) \|\| \(wsFlagNum == "3"\)\)\) then/);
    assert.doesNotMatch(scala, /Not found: flagLow/);
  });

  test('a THRU-range 88-level (FLAG-HIGH VALUE 4 THRU 9) under the same REDEFINES target compiles to a real range compareTo check', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F13THRU.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X(1) VALUE "7".
       01 WS-FLAG-NUM REDEFINES WS-FLAG PIC 9(1).
           88 FLAG-HIGH VALUE 4 THRU 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE TRUE
               WHEN FLAG-HIGH
                   DISPLAY "RESULT=HIGH"
               WHEN OTHER
                   DISPLAY "RESULT=OTHER"
           END-EVALUATE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsFlagNum\.compareTo\("4"\) >= 0 && wsFlagNum\.compareTo\("9"\) <= 0/);
  });

  test('an 88-level condition-name on an ORDINARY (non-REDEFINES) item is completely unaffected (regression guard)', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17F13PLAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X(1) VALUE "Y".
           88 IS-YES VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF IS-YES
               DISPLAY "YES"
           END-IF.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsFlag == "Y"/);
  });
});

// ---------------------------------------------------------------------------
// Shared helper refactor: refModGapComment/refModStringPlaceholder/
// refModNumericPlaceholder centralize the ref-mod honest-placeholder text
// across every operand-position call site (round-17's own explicit ask,
// per finding 3's shared-comment-text request) - old round-15/round-16 call
// sites must produce byte-for-byte the same output as before.
// ---------------------------------------------------------------------------

describe('round-17 shared helper refactor: refModGapComment/refModStringPlaceholder produce unchanged text at pre-existing call sites', () => {
  test('round-16 finding 2 shape (relational comparison) still produces the same placeholder text after being routed through the shared helper', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17SHARED1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-FLAG PIC X(1) VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-SRC(8:3) > "AAA"
               MOVE "Y" TO WS-FLAG
           END-IF.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /"" \/\* TODO: reference modification not implemented as a comparison operand - see tests\/oracle\/README\.md known gaps \*\//);
  });

  test('round-16 finding 3 shape (CALL argument) still produces the same placeholder text after being routed through the shared helper', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17SHARED2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "R17SHARED2SUB" USING WS-SRC(3:5).
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17SHARED2SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-IN PIC X(5).
       PROCEDURE DIVISION USING LS-IN.
       SUB-PARA.
           GOBACK.
       END PROGRAM R17SHARED2SUB.
       END PROGRAM R17SHARED2.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /"" \/\* TODO: CALL "R17SHARED2SUB" USING WS-SRC\(\.\.\.\): reference modification not implemented as a CALL argument - see tests\/oracle\/README\.md known gaps \*\//
    );
  });

  test('round-15 finding 8 shape (STRING segment source) still produces the same placeholder text after being routed through the shared helper', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R17SHARED3.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(10) VALUE "ABCDEFGHIJ".
       01 WS-TARGET PIC X(10) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           STRING WS-SRC(2:3) DELIMITED BY SIZE INTO WS-TARGET.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /"" \/\* TODO: reference modification not implemented as a STRING source - see tests\/oracle\/README\.md known gaps \*\//);
  });
});
