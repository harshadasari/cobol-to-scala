import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { tokenize } from '../parser/lexer.js';
import { parseProcedureDivision } from '../parser/procedure-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PROC_DIR = path.join(__dirname, 'corpus', 'proc');

async function parseCorpusProc(filename) {
  const source = await fs.readFile(path.join(CORPUS_PROC_DIR, filename), 'utf-8');
  const tokens = tokenize(source, { format: 'fixed' });
  return parseProcedureDivision(tokens);
}

function parseSnippet(procedureDivisionBody) {
  const source = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T.
       PROCEDURE DIVISION.
       0000-MAIN.
${procedureDivisionBody}
`;
  const tokens = tokenize(source, { format: 'fixed' });
  return parseProcedureDivision(tokens);
}

function typesOf(stmts) {
  return stmts.map((s) => s.type);
}

// Recursively collect every UnknownStatement node reachable from a list of
// top-level paragraph statements (through IF/PERFORM/EVALUATE/SEARCH/READ/
// RETURN bodies), so a test can assert "nothing was silently dropped or
// mis-parsed anywhere in this paragraph".
function collectUnknowns(stmts, out = []) {
  for (const s of stmts) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'UnknownStatement') out.push(s);
    if (Array.isArray(s.statements)) collectUnknowns(s.statements, out);
    if (Array.isArray(s.thenStatements)) collectUnknowns(s.thenStatements, out);
    if (Array.isArray(s.elseStatements)) collectUnknowns(s.elseStatements, out);
    if (Array.isArray(s.atEnd)) collectUnknowns(s.atEnd, out);
    if (Array.isArray(s.notAtEnd)) collectUnknowns(s.notAtEnd, out);
    if (Array.isArray(s.whenClauses)) {
      for (const w of s.whenClauses) collectUnknowns(w.statements || [], out);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bug fix 1: inline `PERFORM <numeric-literal> TIMES ... END-PERFORM`
// ---------------------------------------------------------------------------

test('PERFORM <int-literal> TIMES (inline) parses times/body instead of leaking (README repro)', () => {
  const division = parseSnippet(`           PERFORM 3 TIMES
               ADD 1 TO WS-X
           END-PERFORM
           STOP RUN.`);
  const main = division.paragraphs[0];

  // Exactly 2 top-level statements: the PERFORM and STOP RUN. Before the
  // fix, the ADD leaked out as a 3rd top-level sibling statement because
  // performType/times/statements were all left null/empty.
  assert.deepEqual(typesOf(main.statements), ['PerformStatement', 'StopStatement']);

  const perform = main.statements[0];
  assert.equal(perform.performType, 'times');
  assert.equal(perform.times?.value, '3');
  assert.equal(perform.statements.length, 1, 'the ADD must live inside the PERFORM body, not leak to the paragraph');
  assert.equal(perform.statements[0].type, 'AddStatement');
});

test('PERFORM <identifier> TIMES (inline, variable count) has no target paragraph', () => {
  const division = parseSnippet(`           PERFORM WS-COUNT TIMES
               ADD 1 TO WS-X
           END-PERFORM
           STOP RUN.`);
  const main = division.paragraphs[0];
  const perform = main.statements[0];

  assert.equal(perform.performType, 'times');
  assert.equal(perform.targetParagraph, null, 'a data-name TIMES count is not a target paragraph');
  assert.equal(perform.times?.name, 'WS-COUNT');
  assert.equal(perform.statements.length, 1);
});

test('PERFORM <paragraph-name> <literal> TIMES (out-of-line repeat) keeps working', () => {
  const division = parseSnippet(`           PERFORM 2000-PARA 3 TIMES
           STOP RUN.
       2000-PARA.
           ADD 1 TO WS-X.`);
  const main = division.paragraphs[0];
  const perform = main.statements[0];

  assert.equal(perform.performType, 'times');
  assert.equal(perform.targetParagraph, '2000-PARA');
  assert.equal(perform.times?.value, '3');
  assert.equal(perform.statements.length, 0, 'out-of-line PERFORM has no inline body');
});

// ---------------------------------------------------------------------------
// p16: every other PERFORM form, verified against the full corpus program
// ---------------------------------------------------------------------------

test('p16-perform-forms.cbl: all 5 PERFORM forms parse faithfully with no leakage', async () => {
  const division = await parseCorpusProc('p16-perform-forms.cbl');
  const main = division.paragraphs.find((p) => p.name === '0000-MAIN');

  // 5 PERFORMs + 1 MOVE + 5 DISPLAYs + 1 STOP RUN = 12, matching the source
  // line-for-line. No ADD/DISPLAY statement should have leaked to this level.
  assert.equal(main.statements.length, 12);
  assert.equal(typesOf(main.statements).filter((t) => t === 'PerformStatement').length, 5);
  assert.equal(collectUnknowns(main.statements).length, 0);

  const performs = main.statements.filter((s) => s.type === 'PerformStatement');
  const [times, until, varying, nestedVarying, thru] = performs;

  assert.equal(times.performType, 'times');
  assert.equal(times.times.value, '3');
  assert.equal(times.statements.length, 2, 'PERFORM 3 TIMES body: two ADDs');

  assert.equal(until.performType, 'until');
  assert.ok(until.until, 'UNTIL condition must be captured');
  assert.equal(until.statements.length, 2);

  assert.equal(varying.performType, 'varying');
  assert.equal(varying.varying.variable, 'WS-I');
  assert.equal(varying.varying.from.value, '1');
  assert.equal(varying.varying.by.value, '2');
  assert.equal(varying.varying.after.length, 0);
  assert.equal(varying.statements.length, 1);

  assert.equal(nestedVarying.performType, 'varying');
  assert.equal(nestedVarying.varying.after.length, 1, 'two-level AFTER must be captured');
  assert.equal(nestedVarying.varying.after[0].variable, 'WS-J');
  assert.equal(nestedVarying.statements.length, 1);

  assert.equal(thru.performType, 'simple');
  assert.equal(thru.targetParagraph, '2000-ADD-A');
  assert.equal(thru.throughParagraph, '2000-ADD-C');
  assert.equal(thru.statements.length, 0, 'out-of-line THRU has no inline body');

  // The THRU'd paragraphs are untouched siblings, each with their own ADD.
  for (const name of ['2000-ADD-A', '2000-ADD-B', '2000-ADD-C']) {
    const para = division.paragraphs.find((p) => p.name === name);
    assert.equal(para.statements.length, 1);
    assert.equal(para.statements[0].type, 'AddStatement');
  }
});

// ---------------------------------------------------------------------------
// FUNCTION intrinsics
// ---------------------------------------------------------------------------

test('MOVE FUNCTION UPPER-CASE(x) TO y parses as FunctionCall source, not a fabricated target', () => {
  const division = parseSnippet(`           MOVE FUNCTION UPPER-CASE(WS-TEXT) TO WS-UPPER
           STOP RUN.`);
  const main = division.paragraphs[0];
  const move = main.statements[0];

  assert.equal(move.type, 'MoveStatement');
  assert.equal(move.source.type, 'FunctionCall');
  assert.equal(move.source.name, 'UPPER-CASE');
  assert.equal(move.source.arguments.length, 1);
  assert.equal(move.source.arguments[0].name, 'WS-TEXT');

  // The real destination must survive, unlike the pre-fix behavior where
  // "FUNCTION" became a bogus source variable and "UPPER-CASE(WS-TEXT)"
  // became a bogus subscripted target, dropping WS-UPPER entirely.
  assert.equal(move.targets.length, 1);
  assert.equal(move.targets[0].name, 'WS-UPPER');
});

test('COMPUTE x = FUNCTION MOD(a, b) parses a FunctionCall inside the arithmetic expression', () => {
  const division = parseSnippet(`           COMPUTE WS-RESULT = FUNCTION MOD(17, 5)
           STOP RUN.`);
  const compute = division.paragraphs[0].statements[0];

  assert.equal(compute.type, 'ComputeStatement');
  assert.equal(compute.targets[0].name, 'WS-RESULT');
  const fc = compute.expression.functionCall;
  assert.ok(fc, 'expression must carry a functionCall');
  assert.equal(fc.name, 'MOD');
  assert.deepEqual(fc.arguments.map((a) => a.value), ['17', '5']);
});

test('p15-intrinsics.cbl: every FUNCTION use parses with the correct name, args, and real target', async () => {
  const division = await parseCorpusProc('p15-intrinsics.cbl');
  const main = division.paragraphs[0];

  assert.equal(main.statements.length, 17, 'no statement should have been dropped or merged');
  assert.equal(collectUnknowns(main.statements).length, 0);

  const moves = main.statements.filter((s) => s.type === 'MoveStatement');
  assert.equal(moves.length, 5);

  const expectedMoves = [
    { fn: 'UPPER-CASE', args: ['WS-TEXT'], target: 'WS-UPPER' },
    { fn: 'LENGTH', args: ['WS-TEXT'], target: 'WS-LEN-FIELD' },
    { fn: 'LENGTH', args: ['HELLO'], target: 'WS-LEN-LITERAL' },
    { fn: 'NUMVAL', args: ['WS-NUMVAL-SRC'], target: 'WS-NUMVAL-RESULT' },
  ];
  for (let i = 0; i < expectedMoves.length; i++) {
    const { fn, args, target } = expectedMoves[i];
    const move = moves[i];
    assert.equal(move.source.type, 'FunctionCall');
    assert.equal(move.source.name, fn);
    assert.deepEqual(move.source.arguments.map((a) => a.value || a.name), args);
    assert.equal(move.targets.length, 1);
    assert.equal(move.targets[0].name, target);
  }

  // The 5th MOVE (FUNCTION REVERSE) comes after the 3 COMPUTEs.
  const reverseMove = moves[4];
  assert.equal(reverseMove.source.name, 'REVERSE');
  assert.equal(reverseMove.targets[0].name, 'WS-REVERSE-RESULT');

  const computes = main.statements.filter((s) => s.type === 'ComputeStatement');
  assert.equal(computes.length, 3);
  assert.equal(computes[0].expression.functionCall.name, 'MOD');
  assert.deepEqual(computes[0].expression.functionCall.arguments.map((a) => a.value), ['17', '5']);
  assert.deepEqual(computes[1].expression.functionCall.arguments.map((a) => a.value), ['-7', '3']);
  assert.equal(computes[2].expression.functionCall.name, 'MAX');
  assert.deepEqual(computes[2].expression.functionCall.arguments.map((a) => a.value), ['45', '78', '12']);
});

// ---------------------------------------------------------------------------
// SEARCH / SEARCH ALL
// ---------------------------------------------------------------------------

test('p10-search.cbl: linear SEARCH parses AT END / WHEN with no MOVE/SET pollution', async () => {
  const division = await parseCorpusProc('p10-search.cbl');
  const main = division.paragraphs[0];

  // 10 MOVEs (populating the table) + 2x (SET + SEARCH) + STOP RUN.
  assert.equal(main.statements.length, 15);
  assert.equal(collectUnknowns(main.statements).length, 0);

  for (const move of main.statements.filter((s) => s.type === 'MoveStatement')) {
    assert.equal(move.targets.length, 1, 'no bogus extra MOVE target from the following SET/SEARCH tokens');
  }

  const searches = main.statements.filter((s) => s.type === 'SearchStatement');
  assert.equal(searches.length, 2);
  for (const search of searches) {
    assert.equal(search.searchAll, false);
    assert.equal(search.target.name, 'WS-CODE-ENTRY');
    assert.equal(search.atEnd.length, 1);
    assert.equal(search.atEnd[0].type, 'DisplayStatement');
    assert.equal(search.whenClauses.length, 1);
    assert.equal(search.whenClauses[0].condition.type, 'RelationalCondition');
  }

  // Hit case: SET + 3 DISPLAYs inside WHEN. Miss case: SET + 1 DISPLAY.
  assert.equal(searches[0].whenClauses[0].statements.length, 4);
  assert.equal(searches[1].whenClauses[0].statements.length, 2);
});

test('p11-searchall.cbl: SEARCH ALL parses with searchAll=true and no MOVE pollution', async () => {
  const division = await parseCorpusProc('p11-searchall.cbl');
  const main = division.paragraphs[0];

  // 10 MOVEs + 2 SEARCH ALLs + STOP RUN.
  assert.equal(main.statements.length, 13);
  assert.equal(collectUnknowns(main.statements).length, 0);

  for (const move of main.statements.filter((s) => s.type === 'MoveStatement')) {
    assert.equal(move.targets.length, 1, 'the documented "SEARCH" bogus-target bug must not recur');
  }

  const searches = main.statements.filter((s) => s.type === 'SearchStatement');
  assert.equal(searches.length, 2);
  assert.ok(searches.every((s) => s.searchAll === true));
  assert.ok(searches.every((s) => s.target.name === 'WS-PROD-ENTRY'));
  assert.equal(searches[0].whenClauses[0].statements.length, 4);
  assert.equal(searches[1].whenClauses[0].statements.length, 2);
});

// ---------------------------------------------------------------------------
// SORT / MERGE / RELEASE / RETURN
// ---------------------------------------------------------------------------

test('p12-sort.cbl: SORT/RELEASE/RETURN parse with correct nesting and no MOVE pollution', async () => {
  const division = await parseCorpusProc('p12-sort.cbl');
  const main = division.paragraphs.find((p) => p.name === '0000-MAIN');

  // 10 MOVEs + SORT + the trailing display-loop PERFORM + STOP RUN.
  assert.equal(main.statements.length, 13);
  assert.equal(collectUnknowns(main.statements).length, 0);
  for (const move of main.statements.filter((s) => s.type === 'MoveStatement')) {
    assert.equal(move.targets.length, 1, 'the documented "SORT"/"SORT-FILE" bogus-target bug must not recur');
  }

  const sort = main.statements.find((s) => s.type === 'SortStatement');
  assert.ok(sort);
  assert.equal(sort.fileName, 'SORT-FILE');
  assert.equal(sort.keys.length, 1);
  assert.equal(sort.keys[0].order, 'ASCENDING');
  assert.equal(sort.keys[0].fields[0].name, 'SORT-KEY');
  assert.equal(sort.inputProcedure.procedure, '1000-RELEASE-RECORDS');
  assert.equal(sort.inputProcedure.through, null);
  assert.equal(sort.outputProcedure.procedure, '2000-RETURN-RECORDS');
  assert.equal(sort.using.length, 0);
  assert.equal(sort.giving.length, 0);

  const releasePara = division.paragraphs.find((p) => p.name === '1000-RELEASE-RECORDS');
  const releasePerform = releasePara.statements[0];
  assert.equal(releasePerform.type, 'PerformStatement');
  // Bug: the inline-PERFORM body parser used to truncate at RELEASE
  // (unimplemented), dropping it and losing the loop's control flow.
  assert.equal(releasePerform.statements.length, 3, 'MOVE, MOVE, RELEASE must all stay inside the loop body');
  assert.deepEqual(typesOf(releasePerform.statements), ['MoveStatement', 'MoveStatement', 'ReleaseStatement']);
  assert.equal(releasePerform.statements[2].recordName, 'SORT-REC');

  const returnPara = division.paragraphs.find((p) => p.name === '2000-RETURN-RECORDS');
  const returnPerform = returnPara.statements[0];
  assert.equal(returnPerform.statements.length, 1);
  const returnStmt = returnPerform.statements[0];
  assert.equal(returnStmt.type, 'ReturnStatement');
  assert.equal(returnStmt.fileName, 'SORT-FILE');
  // Bug: AT END / NOT AT END statements used to flatten out to the
  // paragraph as unconditional top-level statements.
  assert.equal(returnStmt.atEnd.length, 1);
  assert.equal(returnStmt.atEnd[0].type, 'MoveStatement');
  assert.equal(returnStmt.notAtEnd.length, 3);
  assert.deepEqual(typesOf(returnStmt.notAtEnd), ['AddStatement', 'MoveStatement', 'MoveStatement']);
});

test('MERGE statement parses USING/GIVING and keys (no corpus program exercises this verb)', () => {
  const division = parseSnippet(`           MERGE MERGE-FILE
               ON ASCENDING KEY MRG-KEY
               USING IN-FILE-1 IN-FILE-2
               GIVING OUT-FILE
           STOP RUN.`);
  const merge = division.paragraphs[0].statements[0];

  assert.equal(merge.type, 'MergeStatement');
  assert.equal(merge.fileName, 'MERGE-FILE');
  assert.equal(merge.keys.length, 1);
  assert.equal(merge.keys[0].order, 'ASCENDING');
  assert.equal(merge.keys[0].fields[0].name, 'MRG-KEY');
  assert.deepEqual(merge.using, ['IN-FILE-1', 'IN-FILE-2']);
  assert.deepEqual(merge.giving, ['OUT-FILE']);
});

test('MERGE statement parses OUTPUT PROCEDURE THRU form', () => {
  const division = parseSnippet(`           MERGE MERGE-FILE
               ON DESCENDING KEY MRG-KEY
               USING IN-FILE-1 IN-FILE-2
               OUTPUT PROCEDURE IS 3000-OUT THRU 3000-OUT-EXIT
           STOP RUN.`);
  const merge = division.paragraphs[0].statements[0];

  assert.equal(merge.keys[0].order, 'DESCENDING');
  assert.equal(merge.outputProcedure.procedure, '3000-OUT');
  assert.equal(merge.outputProcedure.through, '3000-OUT-EXIT');
  assert.equal(merge.giving.length, 0);
});

test('SORT with USING/GIVING form (file sort without INPUT/OUTPUT PROCEDURE)', () => {
  const division = parseSnippet(`           SORT SORT-FILE
               ON ASCENDING KEY SORT-KEY
               USING IN-FILE
               GIVING OUT-FILE
           STOP RUN.`);
  const sort = division.paragraphs[0].statements[0];

  assert.equal(sort.type, 'SortStatement');
  assert.deepEqual(sort.using, ['IN-FILE']);
  assert.deepEqual(sort.giving, ['OUT-FILE']);
  assert.equal(sort.inputProcedure, null);
  assert.equal(sort.outputProcedure, null);
});

test('SORT of a table (no INPUT/OUTPUT PROCEDURE, no USING/GIVING)', () => {
  const division = parseSnippet(`           SORT WS-TABLE-ENTRY
               ON ASCENDING KEY WS-KEY
           STOP RUN.`);
  const sort = division.paragraphs[0].statements[0];

  assert.equal(sort.type, 'SortStatement');
  assert.equal(sort.fileName, 'WS-TABLE-ENTRY');
  assert.equal(sort.keys[0].order, 'ASCENDING');
  assert.equal(sort.using.length, 0);
  assert.equal(sort.giving.length, 0);
  assert.equal(sort.inputProcedure, null);
  assert.equal(sort.outputProcedure, null);
});

// ---------------------------------------------------------------------------
// Unknown-statement boundary safety (general invariant, item 5)
// ---------------------------------------------------------------------------

test('an unrecognized verb becomes an UnknownStatement and does not corrupt the preceding MOVE', () => {
  const division = parseSnippet(`           MOVE 'A' TO WS-Y
           GENERATE REPORT-1
           MOVE 'B' TO WS-Z
           DISPLAY WS-Z
           STOP RUN.`);
  const main = division.paragraphs[0];

  assert.deepEqual(typesOf(main.statements), [
    'MoveStatement', 'UnknownStatement', 'MoveStatement', 'DisplayStatement', 'StopStatement',
  ]);
  assert.equal(main.statements[0].targets.length, 1);
  assert.equal(main.statements[0].targets[0].name, 'WS-Y');
  assert.deepEqual(main.statements[1].tokens, ['GENERATE', 'REPORT-1']);
  assert.equal(main.statements[2].targets[0].name, 'WS-Z');
});

test('an unrecognized verb inside an inline PERFORM body does not truncate the rest of the block', () => {
  const division = parseSnippet(`           PERFORM UNTIL WS-X > 5
               ADD 1 TO WS-X
               GENERATE REPORT-1
               MOVE WS-X TO WS-Y
           END-PERFORM
           STOP RUN.`);
  const main = division.paragraphs[0];
  const perform = main.statements[0];

  assert.deepEqual(typesOf(perform.statements), ['AddStatement', 'UnknownStatement', 'MoveStatement']);
  assert.equal(perform.statements[0].to.length, 1, 'ADD must not have absorbed GENERATE as a bogus TO-target');
  assert.equal(perform.statements[0].to[0].name, 'WS-X');
  assert.deepEqual(typesOf(main.statements), ['PerformStatement', 'StopStatement'], 'PERFORM must still terminate correctly and STOP RUN must still be reached');
});

test('an unrecognized verb does not get swallowed as a bogus DISPLAY operand', () => {
  const division = parseSnippet(`           DISPLAY 'X=' WS-X
           GENERATE REPORT-1
           STOP RUN.`);
  const main = division.paragraphs[0];

  assert.deepEqual(typesOf(main.statements), ['DisplayStatement', 'UnknownStatement', 'StopStatement']);
  assert.equal(main.statements[0].values.length, 2);
});

// ---------------------------------------------------------------------------
// Phase 2 adversarial-refutation finding 3: EVALUATE with an
// arithmetic-expression subject, and a full relational/class/sign condition
// (not just an 88-name) as a WHEN object under EVALUATE TRUE - see
// parseEvaluateValue/parseEvaluateObject in procedure-parser.js and
// tests/corpus/proc/r10-eval-nested.cbl.
// ---------------------------------------------------------------------------

test('EVALUATE <arithmetic-expression>: the subject keeps the whole expression, not just its first operand', () => {
  const division = parseSnippet(`           EVALUATE WS-A + WS-B
               WHEN 0 THRU 5
                   MOVE 'LOW' TO WS-R
               WHEN OTHER
                   MOVE 'HI' TO WS-R
           END-EVALUATE
           STOP RUN.`);
  const main = division.paragraphs[0];
  assert.deepEqual(typesOf(main.statements), ['EvaluateStatement', 'StopStatement']);

  const evaluate = main.statements[0];
  assert.equal(evaluate.subjects.length, 1);
  const subject = evaluate.subjects[0];
  assert.equal(subject.type, 'ArithmeticExpression');
  assert.equal(subject.operator, '+');
  // parseEvaluateValue's left/right are the raw parseOperand() results
  // (VariableReference nodes), not further wrapped.
  assert.equal(subject.left.name, 'WS-A');
  assert.equal(subject.right.name, 'WS-B');

  // Exactly one WHEN clause (the THRU-range) plus WHEN OTHER - before the
  // fix, the dropped `+ WS-B` left the cursor mid-expression and every token
  // from there on (including every WHEN keyword) was swallowed as
  // unrecognized fragments instead of ever becoming part of this
  // EvaluateStatement.
  assert.equal(evaluate.whenClauses.length, 1);
  assert.deepEqual(evaluate.whenClauses[0].conditions, [
    { type: 'RANGE', from: evaluate.whenClauses[0].conditions[0].from, to: evaluate.whenClauses[0].conditions[0].to },
  ]);
  assert.ok(evaluate.whenOther, 'WHEN OTHER statements should be captured');
});

test('EVALUATE TRUE WHEN <relational-condition> parses a RELATION object, not a truncated VALUE', () => {
  const division = parseSnippet(`           EVALUATE TRUE
               WHEN WS-A > WS-B
                   MOVE 'GT' TO WS-R
               WHEN WS-A = WS-B
                   MOVE 'EQ' TO WS-R
           END-EVALUATE
           STOP RUN.`);
  const main = division.paragraphs[0];
  assert.deepEqual(typesOf(main.statements), ['EvaluateStatement', 'StopStatement']);

  const evaluate = main.statements[0];
  assert.deepEqual(evaluate.subjects, [{ type: 'TRUE' }]);
  assert.equal(evaluate.whenClauses.length, 2);

  const [gt, eq] = evaluate.whenClauses.map((w) => w.conditions[0]);
  assert.equal(gt.type, 'RELATION');
  assert.equal(gt.operator, '>');
  assert.equal(gt.left.name, 'WS-A');
  assert.equal(gt.right.name, 'WS-B');

  assert.equal(eq.type, 'RELATION');
  assert.equal(eq.operator, '=');
});

test('EVALUATE TRUE WHEN <identifier> IS NUMERIC parses a CLASS object', () => {
  const division = parseSnippet(`           EVALUATE TRUE
               WHEN WS-X IS NUMERIC
                   MOVE 'N' TO WS-R
           END-EVALUATE
           STOP RUN.`);
  const evaluate = division.paragraphs[0].statements[0];
  const cond = evaluate.whenClauses[0].conditions[0];
  assert.equal(cond.type, 'CLASS');
  assert.equal(cond.classType, 'NUMERIC');
  assert.equal(cond.subject.name, 'WS-X');
});
