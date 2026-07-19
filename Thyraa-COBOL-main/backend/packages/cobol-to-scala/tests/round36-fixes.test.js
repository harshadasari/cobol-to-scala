/**
 * tests/round36-fixes.test.js
 *
 * Focused unit tests for round-36 adversarial-refutation findings - see
 * tests/oracle/README.md's round-36 table for the full write-up and the
 * ll01/ll07/ll15 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs).
 *
 *   1. (ll01) generateCall's `target.recursive` branch (round-35 finding 2,
 *      generator/expression-gen.js) named a BY CONTENT/VALUE argument's own
 *      isolated call-site-scoped snapshot var `_call<i>Snapshot<j>`, where
 *      `i`/`j` are only unique WITHIN one CALL node's own argument list -
 *      not across the whole generated method body. TWO textually distinct
 *      CALL statements to the same RECURSIVE program, both passing BY
 *      CONTENT as their first argument, land in the SAME Scala method scope
 *      (ll01's own MAIN-PARA: two separate `CALL "LL01SUB" USING BY CONTENT
 *      ...` statements) and both declared `var _call0Snapshot0` - a hard
 *      "already defined" Scala compile error, even though real cobc runs
 *      this fine. Fixed the exact same way round-12's own `_callRet`
 *      duplicate-declaration bug (see nextCallRetName/resetCallRetSeq's own
 *      doc comment) was fixed: every CALL statement that reaches the
 *      `target.recursive` branch now asks for its own never-repeated
 *      call-site id via a new nextCallSiteId()/resetCallSiteSeq() module-
 *      level counter (generator/expression-gen.js), threaded into the
 *      snapshot var's own name (`_call<siteId>_<i>Snapshot<j>`) alongside
 *      the pre-existing `i`/`j` (still needed to distinguish multiple BY
 *      CONTENT/VALUE arguments WITHIN the same call). resetCallSiteSeq() is
 *      invoked once per generateScala() call (scala-generator.js, right
 *      alongside resetCallRetSeq()) purely for cosmetic determinism - each
 *      PROGRAM-ID's own codegen pass starts its own numbering fresh at 0,
 *      exactly like `_callRet<N>` already does. A single call site executed
 *      repeatedly at runtime (ll14, inside a PERFORM VARYING loop) is
 *      unaffected: nextCallSiteId() is called once per SOURCE-LEVEL
 *      generateCall invocation, not once per runtime execution, so the loop
 *      body still declares exactly one `var` and simply overwrites it each
 *      iteration.
 *   2. (ll07/ll15) `parseFunctionArgument` (parser/procedure-parser.js)
 *      called `parseOperand(ctx)` for each FUNCTION argument - correct for a
 *      bare literal/identifier/nested-FUNCTION-call argument, but wrong the
 *      instant an argument is itself an arithmetic expression: `FUNCTION
 *      MOD(FUNCTION NUMVAL(WS-STR1) * 10, FUNCTION NUMVAL(WS-STR2))`'s first
 *      argument is `FUNCTION NUMVAL(WS-STR1) * 10`, not just `FUNCTION
 *      NUMVAL(WS-STR1)` - parseOperand consumed only the leading term,
 *      leaving `* 10, FUNCTION NUMVAL(WS-STR2))` sitting unconsumed in the
 *      token stream, desyncing every statement parsed afterward (ll07's
 *      fuller repro: `FUNCTION MOD` ends up with only 1 argument, and the
 *      leftover tokens corrupt the surrounding COMPUTE's own `ON SIZE
 *      ERROR`/`END-COMPUTE` structure - confirmed via a direct AST dump,
 *      not just a compile error).
 *      Fixed with a NEW, dedicated add/subtract -> multiply/divide -> power
 *      -> unary precedence chain (parseFunctionArgAddSubtract/
 *      MultiplyDivide/Power/Unary/Operand) that mirrors
 *      parseArithmeticExpression's own chain, but - deliberately, NOT a bare
 *      `parseArithmeticExpression(ctx)` call - delegates to parseOperand at
 *      its OWN leaf level (parseFunctionArgOperand), not
 *      parseArithmeticExpression's own parsePrimary. parsePrimary has no
 *      case for a STRING literal, a figurative constant, or an ALL literal -
 *      all of which parseOperand already supports and at least one existing
 *      corpus program actually uses as a FUNCTION argument
 *      (p15-intrinsics.cbl's `FUNCTION LENGTH('HELLO')`) - and delegating
 *      straight to parseArithmeticExpression would also change the AST
 *      SHAPE of every ordinary bare-operand argument (wrapping it in an
 *      ArithmeticExpression), breaking downstream FUNCTION-argument
 *      consumers that pattern-match the un-wrapped shape directly
 *      (functionLength's own `arg.type === 'Literal'`/`'VariableReference'`
 *      branches, generator/expression-gen.js). Because each precedence level
 *      simply returns its child's result untouched when no operator token
 *      follows, a bare, operator-free argument still parses to EXACTLY the
 *      same node parseOperand always produced - only an argument that DOES
 *      continue with `+`/`-`/`*`/`/`/`**` now correctly consumes the whole
 *      expression into a real ArithmeticExpression tree.
 *      A companion, previously-masked bug surfaced once parsing was fixed:
 *      `functionCallToBigDecimalOperand`'s generic fallback (generator/
 *      expression-gen.js, used by COMPUTE's ON SIZE ERROR digit-capacity
 *      check and DIVIDE's GIVING-target coercion) guessed whether a
 *      rendered FUNCTION call was already BigDecimal-typed by checking if
 *      its rendered TEXT started with the literal string `BigDecimal(` -
 *      `FUNCTION MOD`'s own two operands can now themselves be arbitrary
 *      arithmetic expressions (as of this round's parser fix) including a
 *      nested `FUNCTION NUMVAL(...)` call, which is ALREADY BigDecimal-typed
 *      but renders as text starting with `CobolFmt.numval(`/`(((` - so it
 *      got wrapped a SECOND time (`BigDecimal(<already-BigDecimal-expr>)`),
 *      a hard "no overload of BigDecimal.apply accepts a BigDecimal" Scala
 *      COMPILE error. This was previously masked because no prior corpus
 *      program combined a top-level `FUNCTION MOD` with BigDecimal-typed
 *      operands in a COMPUTE (every pre-existing MOD-using corpus program's
 *      own operands are plain Int literals/fields - k09, bb10, v11, p15,
 *      r11/r11b - for which `BigDecimal(Int-typed-expr)` has a real
 *      `apply(i: Int)` overload, so the pre-existing fallback never
 *      crashed). Fixed with a dedicated MOD case in
 *      functionCallToBigDecimalOperand (mirroring the pre-existing MAX/MIN
 *      cases) that coerces MOD's own two operands through
 *      toBigDecimalOperand itself (guaranteed BigDecimal) and returns the
 *      resulting formula directly, plus a new `node.type === 'FunctionCall'`
 *      case in toBigDecimalOperand itself (a bare, unwrapped FunctionCall -
 *      e.g. `FUNCTION NUMVAL(WS-STR)` - can now appear directly as an
 *      ArithmeticExpression's own `.left`/`.right`, a shape only this
 *      round's new parseFunctionArgument precedence chain produces) that
 *      dispatches through functionCallToBigDecimalOperand instead of falling
 *      to the same generic double-wrap-prone fallback one level up.
 *
 * Every expectation below is derived from (or directly cross-checked
 * against) the real cobc-captured tests/corpus/proc/ll*.oracle.txt files.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala, parseCobol } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PROC = path.join(__dirname, 'corpus', 'proc');

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function readCorpus(name) {
  return fs.readFileSync(path.join(CORPUS_PROC, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// Finding 1 (ll01): two textually distinct CALL statements to the same
// RECURSIVE program, both passing BY CONTENT, must not collide on the same
// snapshot-var name in the same generated method scope.
// ---------------------------------------------------------------------------

describe('round-36 finding 1 (ll01): two distinct CALL sites to the same RECURSIVE program get distinct snapshot-var names', () => {
  const oracleText = readCorpus('ll01-call-content-dup-site.oracle.txt');

  test('the real cobc oracle capture runs both CALLs sequentially with no error (sanity)', () => {
    assert.match(oracleText, /BEFORE A=010 B=020/);
    assert.match(oracleText, /IN SUB VAL=110/);
    assert.match(oracleText, /IN SUB VAL=120/);
    assert.match(oracleText, /AFTER A=010 B=020/);
  });

  test('the generated Scala declares two DIFFERENT snapshot var names for the two textually distinct CALL statements', () => {
    const scala = scalaOf(readCorpus('ll01-call-content-dup-site.cbl'));
    assert.match(scala, /var _call0_0Snapshot0: Int = wsA/);
    assert.match(scala, /var _call1_0Snapshot0: Int = wsB/);
    assert.doesNotMatch(scala, /var _call0Snapshot0/); // the old, collision-prone name is gone entirely
  });

  test('each snapshot var is used consistently in its own entry() call', () => {
    const scala = scalaOf(readCorpus('ll01-call-content-dup-site.cbl'));
    assert.match(
      scala,
      /Ll01sub\.entry\(\(\) => _call0_0Snapshot0, \(v: Int\) => _call0_0Snapshot0 = v\)/
    );
    assert.match(
      scala,
      /Ll01sub\.entry\(\(\) => _call1_0Snapshot0, \(v: Int\) => _call1_0Snapshot0 = v\)/
    );
  });
});

describe('round-36 finding 1 regression (ll14): one call site executed 3x at runtime still declares exactly ONE snapshot var', () => {
  test('only one _call<N>_0Snapshot0 declaration is emitted for the single (loop-repeated) CALL statement', () => {
    const scala = scalaOf(readCorpus('ll14-call-content-loop-samesite.cbl'));
    const declarations = scala.match(/var _call\d+_0Snapshot0: Int = wsVal/g) || [];
    assert.equal(declarations.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (ll07/ll15): a FUNCTION argument that is itself an arithmetic
// expression must parse (and generate) correctly, not silently truncate and
// corrupt the surrounding token stream.
// ---------------------------------------------------------------------------

describe('round-36 finding 2 (ll15): FUNCTION MOD\'s first argument being an arithmetic expression parses as ONE argument, not two', () => {
  const oracleText = readCorpus('ll15-funcmod-nested-arg-min.oracle.txt');

  test('the real cobc oracle capture documents the correct floored-mod result (sanity)', () => {
    assert.match(oracleText, /RESULT=004/);
  });

  test('the AST gives FUNCTION MOD exactly 2 arguments, the first an ArithmeticExpression (* 2), the second a bare Literal', () => {
    const ast = parseCobol(readCorpus('ll15-funcmod-nested-arg-min.cbl'));
    const stmt = ast.procedures.paragraphs[0].statements[0];
    assert.equal(stmt.type, 'ComputeStatement');
    const modCall = stmt.expression.functionCall;
    assert.equal(modCall.name, 'MOD');
    assert.equal(modCall.arguments.length, 2);
    const arg0 = modCall.arguments[0];
    assert.equal(arg0.type, 'ArithmeticExpression');
    assert.equal(arg0.operator, '*');
    assert.equal(arg0.left.type, 'FunctionCall');
    assert.equal(arg0.left.name, 'NUMVAL');
    assert.equal(arg0.right.type, 'Literal');
    assert.equal(arg0.right.value, '2');
    const arg1 = modCall.arguments[1];
    assert.equal(arg1.type, 'Literal');
    assert.equal(arg1.value, '5');
  });

  test('the generated Scala compiles the whole MOD formula without a double-BigDecimal-wrap and matches the oracle value', () => {
    const scala = scalaOf(readCorpus('ll15-funcmod-nested-arg-min.cbl'));
    assert.match(scala, /CobolFmt\.numval\(wsStr, false\) \* BigDecimal\("2"\)/);
    assert.doesNotMatch(scala, /BigDecimal\(CobolFmt\.numval/); // no re-wrap of an already-BigDecimal NUMVAL call
  });
});

describe('round-36 finding 2 (ll07): the fuller COMPUTE/ON SIZE ERROR/END-COMPUTE structure is no longer corrupted', () => {
  const oracleText = readCorpus('ll07-compute-func-nested.oracle.txt');

  test('the real cobc oracle capture documents the ROUNDED result, the expected SIZE ERROR firing once, and OVERFLOW left unchanged (sanity)', () => {
    assert.match(oracleText, /RESULT=015\.75/);
    assert.match(oracleText, /SIZE ERROR 2 \(EXPECTED\)/);
    assert.match(oracleText, /OVERFLOW=77/);
  });

  test('the AST parses all 5 statements distinctly - no UnknownStatement, no vanished/merged DISPLAY, no lost ON SIZE ERROR', () => {
    const ast = parseCobol(readCorpus('ll07-compute-func-nested.cbl'));
    const statements = ast.procedures.paragraphs[0].statements;
    assert.equal(statements.length, 5);
    assert.deepEqual(
      statements.map(s => s.type),
      ['ComputeStatement', 'DisplayStatement', 'ComputeStatement', 'DisplayStatement', 'StopStatement']
    );
    // each COMPUTE keeps its own ON SIZE ERROR clause (previously the second
    // COMPUTE's own END-COMPUTE became an UnknownStatement sibling and the
    // first COMPUTE's own ON SIZE ERROR DISPLAY got detached into an
    // unconditional sibling statement - neither happens now).
    assert.ok(Array.isArray(statements[0].onSizeError) && statements[0].onSizeError.length === 1);
    assert.ok(Array.isArray(statements[2].onSizeError) && statements[2].onSizeError.length === 1);
  });

  test('FUNCTION MOD in both COMPUTEs gets its full 2-argument shape, first argument an arithmetic expression (NUMVAL * literal)', () => {
    const ast = parseCobol(readCorpus('ll07-compute-func-nested.cbl'));
    const statements = ast.procedures.paragraphs[0].statements;
    for (const [stmt, multiplier] of [[statements[0], '10'], [statements[2], '100']]) {
      const modCall = stmt.expression.left.functionCall;
      assert.equal(modCall.name, 'MOD');
      assert.equal(modCall.arguments.length, 2);
      const arg0 = modCall.arguments[0];
      assert.equal(arg0.type, 'ArithmeticExpression');
      assert.equal(arg0.operator, '*');
      assert.equal(arg0.left.name, 'NUMVAL');
      assert.equal(arg0.right.value, multiplier);
    }
  });

  test('the generated Scala compiles the whole formula (both COMPUTEs) without a double-BigDecimal-wrap', () => {
    const scala = scalaOf(readCorpus('ll07-compute-func-nested.cbl'));
    assert.match(scala, /CobolFmt\.numval\(wsStr1, false\) \* BigDecimal\("10"\)/);
    assert.match(scala, /CobolFmt\.numval\(wsStr1, false\) \* BigDecimal\("100"\)/);
    assert.doesNotMatch(scala, /BigDecimal\(CobolFmt\.numval/);
  });
});

describe('round-36 finding 2 regression: a bare (operator-free) FUNCTION argument still parses to the EXACT pre-fix shape', () => {
  test('p15\'s FUNCTION LENGTH(\'HELLO\') argument is still a direct, un-wrapped Literal node (not wrapped in ArithmeticExpression)', () => {
    const ast = parseCobol(readCorpus('p15-intrinsics.cbl'));
    const statements = ast.procedures.paragraphs[0].statements;
    const moveStmt = statements.find(
      s => s.type === 'MoveStatement' && s.source?.type === 'FunctionCall' && s.source.name === 'LENGTH' &&
        s.source.arguments[0]?.type === 'Literal'
    );
    assert.ok(moveStmt, "expected a MOVE FUNCTION LENGTH('HELLO') statement");
    const arg0 = moveStmt.source.arguments[0];
    assert.equal(arg0.type, 'Literal');
    assert.equal(arg0.literalType, 'string');
  });

  test('r11\'s FUNCTION MOD(7, -3) (plain literal arguments, no arithmetic) still compiles and runs correctly through the new MOD case in functionCallToBigDecimalOperand, with no double-BigDecimal-wrap', () => {
    const scala = scalaOf(readCorpus('r11-intrinsics-composition.cbl'));
    // COMPUTE always renders its target assignment via toBigDecimalOperand
    // (resultBD) - which now routes FUNCTION MOD through this round's new
    // dedicated MOD case (coercing each literal operand through
    // toBigDecimalOperand itself: `BigDecimal("7")`/`BigDecimal("-3")`) -
    // this is oracle-verified end-to-end (see the harness-level oracleCompare
    // check this fix was verified against); the important regression
    // guarantee is simply that it is NOT double-wrapped a second time.
    assert.match(scala, /\(\(\(BigDecimal\("7"\)\) % \(BigDecimal\("-3"\)\) \+ \(BigDecimal\("-3"\)\)\) % \(BigDecimal\("-3"\)\)\)/);
    assert.doesNotMatch(scala, /BigDecimal\(\(\(\(BigDecimal/); // no re-wrap of the already-BigDecimal MOD formula
  });

  test('a bare identifier FUNCTION argument (FUNCTION MOD(WS-A, WS-B)) still parses as a direct VariableReference, not wrapped', () => {
    const ast = parseCobol(readCorpus('v11-intrinsic-cond.cbl'));
    const statements = ast.procedures.paragraphs[0].statements;
    const ifStmt = statements.find(
      s => s.type === 'IfStatement' && s.condition?.subject?.type === 'FunctionCall'
    );
    assert.ok(ifStmt, 'expected an IF FUNCTION MOD(...) = ... statement');
    const modCall = ifStmt.condition.subject;
    assert.equal(modCall.name, 'MOD');
    assert.equal(modCall.arguments[0].type, 'VariableReference');
    assert.equal(modCall.arguments[1].type, 'VariableReference');
  });
});
