/**
 * tests/round14-fixes.test.js
 *
 * Focused unit tests for the round-14 adversarial-refutation findings:
 *
 *   1. Qualified PERFORM ... THRU (`PERFORM x OF secA THRU y OF secB`)
 *      matched THRU endpoints by BARE NAME ONLY (generatePerformThruMethod's
 *      own `units.findIndex`), silently resolving the FIRST program-order
 *      paragraph sharing that bare name regardless of an explicit OF/IN
 *      qualifier - so a THRU range entirely inside one section could run an
 *      unrelated same-named paragraph pair from an earlier section instead.
 *      Fixed by threading targetSection/throughSection into the unit
 *      lookup (matching name AND section when a qualifier is present) and
 *      into the wrapper method's own composite name (performThruWrapperName)
 *      so two qualified THRU ranges sharing both bare endpoint names in
 *      different sections don't collide on the same wrapper-method name.
 *
 *   2. INSPECT REPLACING with MULTIPLE clauses in one statement cascaded -
 *      each clause's own codegen wrapped the *previous* clause's resulting
 *      Scala expression, so a later clause's comparand could match text an
 *      earlier clause in the SAME statement had just written (`REPLACING
 *      ALL "A" BY "B" ALL "B" BY "A"` against "AAAABBBB" produced
 *      "AAAAAAAA" instead of cobc's actual "BBBBAAAA"). Fixed by routing
 *      2+-clause REPLACING through a new CobolInspect.replaceMultiClause
 *      runtime helper that evaluates every clause in ONE left-to-right scan
 *      of the pre-statement snapshot, first-clause-written-wins per
 *      position - the single-clause case is untouched (same codegen as
 *      before, byte-for-byte).
 *
 *   3. (MOST IMPORTANT - general parser flaw) Sentence-scope termination:
 *      parseStatementBlock treated a PERIOD as "skip and keep collecting
 *      into this same block" - so ANY conditional clause lacking its own
 *      explicit END-* terminator (IF without END-IF, READ AT END without
 *      END-READ, ON SIZE ERROR/OVERFLOW/INVALID KEY without their own
 *      END-*, EVALUATE WHEN without END-EVALUATE, ...) silently absorbed
 *      every following statement in the paragraph into its own implicit
 *      scope. COBOL rule: a PERIOD ends the whole SENTENCE, closing EVERY
 *      open scope at once. Fixed: parseStatementBlock now stops at a
 *      period WITHOUT consuming it (exactly like any other terminator),
 *      leaving it in place so it propagates upward through every nested
 *      parseStatementBlock call until it reaches whichever sentence-level
 *      loop owns period consumption (parseProcedureDivision's/
 *      parseDeclaratives' per-paragraph loops) - consumed there exactly
 *      once, regardless of how many implicit scopes it closes on the way.
 *
 *   4. SYNCHRONIZED/SYNC alignment was parsed (`item.sync`) but had zero
 *      consumers anywhere in the generator - completely ignored. Fixed in
 *      layout.js: a SYNC binary (COMP/COMP-4/COMP-5/BINARY) item aligns to
 *      its own natural byte boundary (2-byte items to an even offset,
 *      4-byte to a multiple of 4, 8-byte to a multiple of 8), inserting pad
 *      bytes (compiler-verified as 0x00, never a space) before it - both
 *      itemByteLength (FUNCTION LENGTH/groupByteLengthRegistry) and
 *      case-class-gen.js's parse/format (real file-record byte layout) now
 *      account for the padding; COMP-3/PACKED-DECIMAL is compiler-verified
 *      UNAFFECTED by SYNC (real COBOL's SYNCHRONIZED clause only concerns
 *      binary-word alignment).
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/b3/c1/c3/c4/c4b/c6
 * programs provide via the data-driven oracle suite. This file targets the
 * individual parser/generator mechanisms each finding traces to, in
 * isolation (no cobc/scala-cli needed), so a regression is caught at the
 * unit level even on a machine without the compiler toolchain installed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { tokenize } from '../parser/lexer.js';
import { parseProcedureDivision } from '../parser/procedure-parser.js';
import { performThruWrapperName, generatePerformThruMethod, flattenProcedureUnits, collectAmbiguousParagraphNames } from '../generator/method-gen.js';
import { itemByteLength, syncPadBytes, elementaryByteLength } from '../generator/layout.js';
import { generateCaseClass } from '../generator/case-class-gen.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function procedureOf(source) {
  const tokens = tokenize(source, { format: 'fixed' });
  return parseProcedureDivision(tokens);
}

// ---------------------------------------------------------------------------
// Finding 3: sentence-scope termination. A battery over every conditional-
// clause type this round's instructions called out, each with/without its
// own explicit END-* terminator - verifying the PARSE structure directly
// (statements after the missing terminator become SIBLINGS of the
// conditional statement, not absorbed into its own implicit block).
// ---------------------------------------------------------------------------

describe('round-14 finding 3: sentence-scope termination (period ends ALL open scopes)', () => {
  function wrap(body) {
    return `       IDENTIFICATION DIVISION.
       PROGRAM-ID. R14SCOPE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MY-FILE ASSIGN TO "R14SCOPE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  MY-FILE.
       01  MY-REC PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(2) VALUE 5.
       01  WS-Y PIC 9(2) VALUE 0.
       01  WS-A PIC X(5) VALUE "AB".
       01  WS-B PIC X(5) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
${body}
`;
  }

  test('IF without END-IF (true branch): THEN body stops at the period, following statements are siblings', () => {
    const ast = procedureOf(wrap(`           IF WS-X > 0
               DISPLAY "POS".
           DISPLAY "NEXT".
           DISPLAY "THIRD".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 4, 'If, Display NEXT, Display THIRD, Stop must all be top-level siblings');
    assert.equal(stmts[0].type, 'IfStatement');
    assert.equal(stmts[0].thenStatements.length, 1, 'THEN arm must contain only the DISPLAY "POS" statement');
    assert.equal(stmts[0].elseStatements.length, 0);
    assert.equal(stmts[1].type, 'DisplayStatement');
    assert.equal(stmts[2].type, 'DisplayStatement');
    assert.equal(stmts[3].type, 'StopStatement');
  });

  test('IF WITH explicit END-IF still stops exactly at END-IF (regression guard)', () => {
    const ast = procedureOf(wrap(`           IF WS-X > 0
               DISPLAY "POS"
               DISPLAY "POS2"
           END-IF
           DISPLAY "NEXT".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].thenStatements.length, 2);
    assert.equal(stmts[1].type, 'DisplayStatement');
    assert.equal(stmts[2].type, 'StopStatement');
  });

  test('READ AT END without END-READ: AT END body stops at the period', () => {
    const ast = procedureOf(wrap(`           READ MY-FILE
               AT END DISPLAY "EOF1"
                      DISPLAY "EOF2".
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3, 'Read, Display AFTER, Stop must all be top-level siblings');
    assert.equal(stmts[0].type, 'ReadStatement');
    assert.equal(stmts[0].atEnd.length, 2);
    assert.equal(stmts[1].type, 'DisplayStatement');
    assert.equal(stmts[2].type, 'StopStatement');
  });

  test('READ AT END WITH explicit END-READ still stops exactly at END-READ (regression guard)', () => {
    const ast = procedureOf(wrap(`           READ MY-FILE
               AT END DISPLAY "EOF1"
                      DISPLAY "EOF2"
           END-READ
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].atEnd.length, 2);
    assert.equal(stmts[1].type, 'DisplayStatement');
  });

  test('COMPUTE ON SIZE ERROR without END-COMPUTE: SIZE ERROR body stops at the period', () => {
    const ast = procedureOf(wrap(`           COMPUTE WS-Y = WS-X * 2
               ON SIZE ERROR DISPLAY "ERR1"
                             DISPLAY "ERR2".
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].type, 'ComputeStatement');
    assert.equal(stmts[0].onSizeError.length, 2);
    assert.equal(stmts[1].type, 'DisplayStatement');
    assert.equal(stmts[2].type, 'StopStatement');
  });

  test('COMPUTE ON SIZE ERROR WITH explicit END-COMPUTE still stops exactly at END-COMPUTE (regression guard)', () => {
    const ast = procedureOf(wrap(`           COMPUTE WS-Y = WS-X * 2
               ON SIZE ERROR DISPLAY "ERR1"
           END-COMPUTE
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].onSizeError.length, 1);
  });

  test('STRING ON OVERFLOW without END-STRING: OVERFLOW body stops at the period', () => {
    const ast = procedureOf(wrap(`           STRING WS-A DELIMITED BY SIZE INTO WS-B
               ON OVERFLOW DISPLAY "OVER1"
                           DISPLAY "OVER2".
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].type, 'StringStatement');
    assert.equal(stmts[0].onOverflow.length, 2);
    assert.equal(stmts[1].type, 'DisplayStatement');
    assert.equal(stmts[2].type, 'StopStatement');
  });

  test('WRITE INVALID KEY without END-WRITE: INVALID KEY body stops at the period', () => {
    const ast = procedureOf(wrap(`           WRITE MY-REC
               INVALID KEY DISPLAY "INV1"
                           DISPLAY "INV2".
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].type, 'WriteStatement');
    assert.equal(stmts[0].invalidKey.length, 2);
    assert.equal(stmts[1].type, 'DisplayStatement');
    assert.equal(stmts[2].type, 'StopStatement');
  });

  test('EVALUATE WHEN without END-EVALUATE: WHEN body stops at the period', () => {
    const ast = procedureOf(wrap(`           EVALUATE WS-X
               WHEN 5 DISPLAY "ONE1"
                      DISPLAY "ONE2".
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].type, 'EvaluateStatement');
    assert.equal(stmts[0].whenClauses.length, 1);
    assert.equal(stmts[0].whenClauses[0].statements.length, 2);
    assert.equal(stmts[1].type, 'DisplayStatement');
    assert.equal(stmts[2].type, 'StopStatement');
  });

  test('EVALUATE WHEN WITH explicit END-EVALUATE still stops exactly there (regression guard)', () => {
    const ast = procedureOf(wrap(`           EVALUATE WS-X
               WHEN 5 DISPLAY "ONE1"
           END-EVALUATE
           DISPLAY "AFTER".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].whenClauses[0].statements.length, 1);
  });

  test('nested scopes: an inner IF with no END-IF, itself inside an outer IF with no END-IF, is closed by ONE period all the way out to the paragraph level', () => {
    const ast = procedureOf(wrap(`           IF WS-X > 0
               IF WS-X > 100
                   DISPLAY "HUGE".
           DISPLAY "AFTER-BOTH".
           STOP RUN.`));
    const stmts = ast.paragraphs[0].statements;
    // The outer IF, "AFTER-BOTH" display, and STOP RUN must all be top-level
    // siblings - the period closes the inner IF's THEN arm AND the outer
    // IF's own THEN arm (which contains only the inner IF) in one go.
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0].type, 'IfStatement');
    assert.equal(stmts[0].thenStatements.length, 1);
    const inner = stmts[0].thenStatements[0];
    assert.equal(inner.type, 'IfStatement');
    assert.equal(inner.thenStatements.length, 1);
    assert.equal(inner.thenStatements[0].type, 'DisplayStatement');
  });

  // Compiler-verified end-to-end (against installed GnuCOBOL) for both the
  // true and false IF-branch shapes via the promoted oracle corpus:
  //   tests/corpus/proc/c4-if-period-scope.cbl  (true branch taken)
  //   tests/corpus/proc/c4b-if-period-scope-false.cbl (false branch taken)
  //   tests/corpus/proc/c3-write-from-renames.cbl (READ AT END without END-READ)
  // - see tests/oracle/README.md's round-14 table.
});

// ---------------------------------------------------------------------------
// Finding 1: qualified PERFORM ... THRU must resolve THRU endpoints by name
// AND section when a qualifier is present, and the wrapper method's own
// composite name must incorporate the section to avoid wrapper-name
// collisions between two qualified ranges sharing both bare endpoint names.
// ---------------------------------------------------------------------------

describe('round-14 finding 1: qualified PERFORM ... THRU', () => {
  test('performThruWrapperName reduces to the pre-existing unqualified scheme when neither endpoint carries a section', () => {
    assert.equal(performThruWrapperName('1000-PARA-A', null, '2000-PARA-B', null), 'paraA' + 'To' + 'ParaB');
  });

  test('performThruWrapperName folds a section qualifier into the name on either/both endpoints', () => {
    const bare = performThruWrapperName('PARA-ONE', null, 'PARA-TWO', null);
    const qualified = performThruWrapperName('PARA-ONE', 'SECTION-A', 'PARA-TWO', 'SECTION-B');
    assert.notEqual(bare, qualified);
    assert.match(qualified, /InSectionA/);
    assert.match(qualified, /InSectionB/);
  });

  test('two qualified THRU ranges sharing both bare endpoint names in DIFFERENT sections get two DIFFERENT wrapper names', () => {
    const a = performThruWrapperName('PARA-ONE', 'SECTION-A', 'PARA-TWO', 'SECTION-A');
    const b = performThruWrapperName('PARA-ONE', 'SECTION-B', 'PARA-TWO', 'SECTION-B');
    assert.notEqual(a, b);
  });

  const B3_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. THRUQUAL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "START".
           PERFORM PARA-ONE OF SECTION-B THRU PARA-TWO OF SECTION-B.
           DISPLAY "END".
           STOP RUN.

       SECTION-A SECTION.
       PARA-ONE.
           DISPLAY "A-ONE".
       PARA-TWO.
           DISPLAY "A-TWO".

       SECTION-B SECTION.
       PARA-ONE.
           DISPLAY "B-ONE".
       PARA-TWO.
           DISPLAY "B-TWO".
`;

  test('b3 repro: the generated wrapper method actually calls SECTION-B\'s paragraphs, not SECTION-A\'s', () => {
    const scala = scalaOf(B3_SOURCE);
    // The wrapper's own composite name must incorporate both section
    // qualifiers (both endpoints qualified OF SECTION-B here).
    assert.match(scala, /def paraOneInSectionBToParaTwoInSectionB\(\): Unit =/);
    // mainPara must call THAT wrapper, not a bare/unqualified one.
    assert.match(scala, /paraOneInSectionBToParaTwoInSectionB\(\)/);
    // The wrapper's own body must resolve to SECTION-B's own paragraphs.
    const wrapperStart = scala.indexOf('def paraOneInSectionBToParaTwoInSectionB');
    const wrapperEnd = scala.indexOf('\n\n', wrapperStart);
    const wrapperBody = scala.slice(wrapperStart, wrapperEnd === -1 ? undefined : wrapperEnd);
    assert.match(wrapperBody, /sectionBParaOne/);
    assert.match(wrapperBody, /sectionBParaTwo/);
    assert.doesNotMatch(wrapperBody, /sectionAParaOne/);
    assert.doesNotMatch(wrapperBody, /sectionAParaTwo/);
  });

  // Compiler-verified end-to-end (against installed GnuCOBOL) via the
  // promoted oracle corpus: tests/corpus/proc/b3-qualified-perform-thru.cbl
  // - output is "START"/"B-ONE"/"B-TWO"/"END", byte-for-byte matching cobc.
});

// ---------------------------------------------------------------------------
// Finding 2: INSPECT REPLACING with multiple clauses in one statement must
// match every clause against the pre-statement snapshot (single combined
// pass), not cascade each clause's own output into the next clause's input.
// ---------------------------------------------------------------------------

describe('round-14 finding 2: INSPECT REPLACING multi-clause (no cascading)', () => {
  const C1_SOURCE = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. INSPMULTI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR PIC X(8) VALUE "AAAABBBB".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-STR REPLACING ALL "A" BY "B"
                                     ALL "B" BY "A".
           DISPLAY "STR=[" WS-STR "]".
           STOP RUN.
`;

  test('2+ REPLACING clauses route through CobolInspect.replaceMultiClause with both clauses in written order', () => {
    const scala = scalaOf(C1_SOURCE);
    assert.match(scala, /CobolInspect\.replaceMultiClause\(/);
    const call = scala.slice(scala.indexOf('CobolInspect.replaceMultiClause'));
    const firstClauseIdx = call.indexOf('"ALL", "A"');
    const secondClauseIdx = call.indexOf('"ALL", "B"');
    assert.ok(firstClauseIdx >= 0 && secondClauseIdx >= 0, 'both clauses must be present');
    assert.ok(firstClauseIdx < secondClauseIdx, 'clauses must appear in written (not reordered) order');
    // Must NOT be a cascade: the previous (pre-fix) codegen wrapped the
    // second clause's own CobolInspect.replaceAll call around the first's
    // resulting expression.
    assert.doesNotMatch(scala, /replaceAll\([^)]*replaceAll\(/);
  });

  test('a SINGLE REPLACING clause is untouched - still the pre-existing direct CobolInspect.replaceAll call, not the multi-clause helper', () => {
    const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. INSPONE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR PIC X(8) VALUE "AAAABBBB".
       PROCEDURE DIVISION.
       MAIN-PARA.
           INSPECT WS-STR REPLACING ALL "A" BY "B".
           STOP RUN.
`;
    const scala = scalaOf(source);
    assert.match(scala, /CobolInspect\.replaceAll\(wsStr, "A", "B"\)/);
    // The CobolInspect runtime helper (embedded once per file) always
    // DEFINES replaceMultiClause regardless of whether this particular
    // program calls it - check that MAIN-PARA's own generated statement
    // doesn't, not that the substring never appears anywhere in the file.
    const mainParaBody = scala.slice(scala.indexOf('def mainPara'), scala.indexOf('@main def run'));
    assert.doesNotMatch(mainParaBody, /replaceMultiClause/);
  });

  // Compiler-verified end-to-end (against installed GnuCOBOL) via the
  // promoted oracle corpus: tests/corpus/proc/c1-inspect-multi-swap.cbl -
  // "AAAABBBB" -> "BBBBAAAA" (not the cascaded "AAAAAAAA"), matching cobc.
});

// ---------------------------------------------------------------------------
// Finding 4: SYNCHRONIZED/SYNC alignment - layout.js's syncPadBytes/
// itemByteLength, and case-class-gen.js's parse/format padding.
// ---------------------------------------------------------------------------

describe('round-14 finding 4: SYNCHRONIZED/SYNC alignment', () => {
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

  test('syncPadBytes is 0 for a non-SYNC item regardless of offset', () => {
    assert.equal(syncPadBytes(compItem('F', 4, false), 1), 0);
  });

  test('syncPadBytes is 0 for SYNC on a non-binary usage (COMP-3 unaffected by SYNC, compiler-verified)', () => {
    const item = { level: 5, name: 'G', usage: 'COMP-3', sync: true, pic: { pattern: 'S9(4)', integerDigits: 4, decimalDigits: 0 } };
    assert.equal(syncPadBytes(item, 1), 0);
  });

  test('2-byte SYNC COMP item aligns to the next even offset', () => {
    assert.equal(syncPadBytes(compItem('F2', 4, true), 1), 1); // offset 1 -> 2
    assert.equal(syncPadBytes(compItem('F2', 4, true), 0), 0); // already aligned
    assert.equal(syncPadBytes(compItem('F2', 4, true), 2), 0);
  });

  test('4-byte SYNC COMP item aligns to the next multiple of 4', () => {
    assert.equal(syncPadBytes(compItem('F2', 8, true), 1), 3); // offset 1 -> 4
    assert.equal(syncPadBytes(compItem('F2', 8, true), 4), 0);
  });

  test('8-byte SYNC COMP item aligns to the next multiple of 8', () => {
    assert.equal(syncPadBytes(compItem('F2', 16, true), 1), 7); // offset 1 -> 8
    assert.equal(syncPadBytes(compItem('F2', 16, true), 8), 0);
  });

  test('itemByteLength: X(1) + SYNC S9(4) COMP + X(1) totals 5 (1 pad byte) - matches cobc oracle (c6)', () => {
    const group = {
      level: 1,
      name: 'WS-REC',
      children: [xItem('F1', 1), compItem('F2', 4, true), xItem('F3', 1)],
    };
    assert.equal(itemByteLength(group), 5);
  });

  test('itemByteLength: an already-aligned SYNC item adds no padding', () => {
    const group = {
      level: 1,
      name: 'WS-REC',
      children: [xItem('F1', 2), compItem('F2', 4, true), xItem('F3', 1)],
    };
    // F1 (2 bytes, offset 0-1) already leaves F2 at offset 2 (even) - no pad.
    assert.equal(itemByteLength(group), 2 + elementaryByteLength(compItem('F2', 4, true)) + 1);
  });

  test('generateCaseClass emits an explicit pad-skip in both parse and format, and a correctly-padded recordLength', () => {
    const group = {
      level: 1,
      name: 'WS-REC',
      children: [xItem('F1', 1), compItem('F2', 4, true), xItem('F3', 1)],
    };
    const scala = generateCaseClass(group, 0, {});
    assert.match(scala, /val recordLength: Int = 5/);
    const padLines = scala.match(/offset \+= 1 \/\/ SYNC alignment padding/g) || [];
    assert.equal(padLines.length, 2, 'exactly one pad-skip in parse and one in format');
  });

  // Compiler-verified end-to-end (against installed GnuCOBOL, including a
  // direct file-write probe for the pad byte's own value) via the promoted
  // oracle corpus: tests/corpus/proc/c6-comp-sync.cbl - LEN=5, matching cobc
  // exactly (a pre-fix engine reported LEN=4, ignoring the SYNC clause).
});
