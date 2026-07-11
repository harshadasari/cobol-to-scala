/**
 * COBOL Procedure Division Parser
 * Parses paragraphs, sections, and all PROCEDURE DIVISION statements
 */

import { TokenType } from './tokens.js';
import {
  Procedure,
  ProcedureDivision,
  PerformStatement,
  VaryingClause,
  IfStatement,
  EvaluateStatement,
  WhenClause,
  MoveStatement,
  ComputeStatement,
  ArithmeticExpression,
  AddStatement,
  SubtractStatement,
  MultiplyStatement,
  DivideStatement,
  StringStatement,
  UnstringStatement,
  InspectStatement,
  CallStatement,
  CallParameter,
  OpenStatement,
  CloseStatement,
  ReadStatement,
  WriteStatement,
  RewriteStatement,
  DeleteStatement,
  StartStatement,
  GoToStatement,
  StopStatement,
  GobackStatement,
  ExitStatement,
  ContinueStatement,
  NextSentenceStatement,
  InitializeStatement,
  SetStatement,
  AcceptStatement,
  DisplayStatement,
  Condition,
  RelationalCondition,
  VariableReference,
  Literal,
  FunctionCall,
  SearchStatement,
  SearchWhenClause,
  SortStatement,
  MergeStatement,
  ReleaseStatement,
  ReturnStatement,
  UnknownStatement,
} from './ast.js';

/**
 * Parser context for tracking state
 */
class ParserContext {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
    this.errors = [];
  }

  current() {
    return this.tokens[this.position] || null;
  }

  peek(offset = 0) {
    return this.tokens[this.position + offset] || null;
  }

  advance() {
    if (!this.isAtEnd()) {
      this.position++;
    }
    return this.tokens[this.position - 1];
  }

  isAtEnd() {
    return this.position >= this.tokens.length ||
           (this.current() && this.current().type === TokenType.EOF);
  }

  check(type) {
    if (this.isAtEnd()) return false;
    return this.current().type === type;
  }

  checkValue(value) {
    if (this.isAtEnd()) return false;
    return this.current()?.value?.toUpperCase() === value.toUpperCase();
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  matchValue(...values) {
    for (const value of values) {
      if (this.checkValue(value)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  skipPeriod() {
    if (this.check(TokenType.PERIOD)) {
      this.advance();
      return true;
    }
    return false;
  }
}

/**
 * Check if current token could be a paragraph/section name
 */
function isParagraphName(ctx) {
  if (!ctx.check(TokenType.IDENTIFIER)) return false;

  // Look ahead for period (paragraph) or SECTION keyword
  const next = ctx.peek(1);
  if (!next) return false;

  return next.type === TokenType.PERIOD || next.type === TokenType.SECTION;
}

/**
 * Statement-starting reserved words (implemented or not). Used to find a
 * safe stopping point when capturing an UnknownStatement's tokens -
 * without this, an unrecognized-verb scan would run past the *next*
 * legitimate statement (or past the enclosing block's own terminator) and
 * swallow it too. Also doubles as the general "is this the start of a new
 * statement" check that used to be dead code (`isStatementStart`).
 */
const STATEMENT_KEYWORDS = new Set([
  'PERFORM', 'IF', 'EVALUATE', 'MOVE', 'COMPUTE', 'ADD', 'SUBTRACT',
  'MULTIPLY', 'DIVIDE', 'STRING', 'UNSTRING', 'INSPECT', 'CALL',
  'OPEN', 'CLOSE', 'READ', 'WRITE', 'REWRITE', 'DELETE', 'START',
  'GO', 'STOP', 'GOBACK', 'EXIT', 'CONTINUE', 'NEXT', 'INITIALIZE',
  'SET', 'ACCEPT', 'DISPLAY', 'EXEC', 'RETURN', 'SEARCH', 'SORT',
  'MERGE', 'RELEASE', 'GENERATE', 'INITIATE', 'TERMINATE',
]);

/**
 * Check if current position is at a statement start keyword
 */
function isStatementStart(ctx) {
  const current = ctx.current();
  if (!current) return false;

  return STATEMENT_KEYWORDS.has(current.value?.toUpperCase());
}

/**
 * True when the current token is a genuine identifier operand - i.e. an
 * IDENTIFIER token whose value isn't itself a statement-starting reserved
 * word. Guards the entry condition of target-list loops (MOVE ... TO
 * target-1 target-2 ..., SET target-1 target-2 ... TO, INITIALIZE
 * target-1 target-2 ...) so that a following statement's verb - which the
 * lexer may still emit as a plain IDENTIFIER token if this parser doesn't
 * register it as a keyword (e.g. GENERATE) - can never be swallowed as one
 * more bogus operand when there is no period between the two statements
 * (this corpus's one-period-per-paragraph style; see tests/corpus/README.md's
 * MOVE-target-pollution finding). Must only be used as a *loop entry*
 * check, never inside the callee itself (parseVariableReference/
 * parseOperand always consume a token once called, and several loops rely
 * on that to make progress).
 */
function isIdentifierOperand(ctx) {
  return ctx.check(TokenType.IDENTIFIER) &&
    !STATEMENT_KEYWORDS.has(ctx.current().value?.toUpperCase());
}

/**
 * Same idea as isIdentifierOperand, but for the mixed identifier-or-numeric-
 * literal operand lists used by ADD/SUBTRACT/MULTIPLY/DIVIDE.
 */
function isOperandStart(ctx) {
  return ctx.check(TokenType.NUMERIC_LITERAL) || isIdentifierOperand(ctx);
}

/**
 * Parse a variable reference (possibly qualified with subscripts)
 */
function parseVariableReference(ctx) {
  const ref = new VariableReference();

  if (!ctx.check(TokenType.IDENTIFIER)) {
    return null;
  }

  ref.name = ctx.advance().value;

  // Parse qualifiers (OF/IN)
  while (ctx.matchValue('OF', 'IN')) {
    if (ctx.check(TokenType.IDENTIFIER)) {
      ref.qualifiers.push(ctx.advance().value);
    }
  }

  // Parse subscripts. Each subscript slot is a full arithmetic expression
  // (not just a bare literal or identifier) - COBOL allows e.g.
  // `WS-T(WS-I + 1)` - so this parses via parseArithmeticExpression rather
  // than recognizing only IDENTIFIER/NUMERIC_LITERAL tokens directly; the
  // older token-only recognition silently dropped every token after the
  // first (`WS-T(WS-I + 1)` parsed as just `WS-T(WS-I)`, discarding `+ 1`
  // without even a parse error) since operator tokens hit neither branch and
  // fell through to `break`. subscriptIndexExpr (generator/expression-gen.js)
  // still fast-paths the common bare-literal/bare-variable shapes for
  // readability; anything else (this included) renders as a full expression.
  if (ctx.check(TokenType.OP_LPAREN)) {
    ctx.advance();
    while (!ctx.isAtEnd() && !ctx.check(TokenType.OP_RPAREN)) {
      if (ctx.check(TokenType.COMMA)) {
        ctx.advance();
        continue;
      }
      const sub = parseArithmeticExpression(ctx);
      if (sub) {
        ref.subscripts.push(sub);
      } else {
        break;
      }
    }
    ctx.match(TokenType.OP_RPAREN);
  }

  // Parse reference modification (start:length)
  if (ctx.check(TokenType.OP_LPAREN)) {
    ctx.advance();
    let start = null;
    let length = null;

    if (ctx.check(TokenType.NUMERIC_LITERAL) || ctx.check(TokenType.IDENTIFIER)) {
      start = ctx.advance().value;
    }

    if (ctx.check(TokenType.OP_COLON)) {
      ctx.advance();
      if (ctx.check(TokenType.NUMERIC_LITERAL) || ctx.check(TokenType.IDENTIFIER)) {
        length = ctx.advance().value;
      }
    }

    ctx.match(TokenType.OP_RPAREN);
    ref.refMod = { start, length };
  }

  return ref;
}

/**
 * Parse a literal or variable
 */
function parseOperand(ctx) {
  // String literal
  if (ctx.check(TokenType.STRING_LITERAL)) {
    return new Literal({
      literalType: 'string',
      value: ctx.advance().value,
    });
  }

  // Numeric literal
  if (ctx.check(TokenType.NUMERIC_LITERAL)) {
    return new Literal({
      literalType: 'numeric',
      value: ctx.advance().value,
    });
  }

  // Figurative constants
  if (ctx.matchValue('ZERO', 'ZEROS', 'ZEROES')) {
    return new Literal({ literalType: 'figurative', value: 'ZERO' });
  }
  if (ctx.matchValue('SPACE', 'SPACES')) {
    return new Literal({ literalType: 'figurative', value: 'SPACE' });
  }
  if (ctx.matchValue('HIGH-VALUE', 'HIGH-VALUES')) {
    return new Literal({ literalType: 'figurative', value: 'HIGH-VALUE' });
  }
  if (ctx.matchValue('LOW-VALUE', 'LOW-VALUES')) {
    return new Literal({ literalType: 'figurative', value: 'LOW-VALUE' });
  }
  if (ctx.matchValue('QUOTE', 'QUOTES')) {
    return new Literal({ literalType: 'figurative', value: 'QUOTE' });
  }

  // ALL literal
  if (ctx.matchValue('ALL')) {
    const literal = parseOperand(ctx);
    if (literal) {
      literal.all = true;
    }
    return literal;
  }

  // FUNCTION intrinsic call, e.g. FUNCTION UPPER-CASE(WS-TEXT)
  if (ctx.checkValue('FUNCTION')) {
    return parseFunctionCall(ctx);
  }

  // Variable reference
  if (ctx.check(TokenType.IDENTIFIER)) {
    return parseVariableReference(ctx);
  }

  return null;
}

/**
 * Parse a FUNCTION intrinsic call: FUNCTION name [ ( argument [, argument]... ) ]
 */
function parseFunctionCall(ctx) {
  ctx.advance(); // Skip FUNCTION

  const nameToken = ctx.advance();
  const call = new FunctionCall({ name: nameToken ? nameToken.value : '' });

  if (ctx.check(TokenType.OP_LPAREN)) {
    ctx.advance();
    while (!ctx.isAtEnd() && !ctx.check(TokenType.OP_RPAREN)) {
      if (ctx.check(TokenType.COMMA)) {
        ctx.advance();
        continue;
      }
      const arg = parseFunctionArgument(ctx);
      if (arg) {
        call.arguments.push(arg);
      } else {
        break;
      }
    }
    ctx.match(TokenType.OP_RPAREN);
  }

  return call;
}

/**
 * Parse a single FUNCTION argument (literal, variable reference, or a
 * nested FUNCTION call).
 */
function parseFunctionArgument(ctx) {
  if (ctx.checkValue('FUNCTION')) {
    return parseFunctionCall(ctx);
  }
  return parseOperand(ctx);
}

/**
 * Parse an arithmetic expression
 */
function parseArithmeticExpression(ctx) {
  return parseAddSubtract(ctx);
}

function parseAddSubtract(ctx) {
  let left = parseMultiplyDivide(ctx);

  while (ctx.check(TokenType.OP_PLUS) || ctx.check(TokenType.OP_MINUS)) {
    const operator = ctx.advance().value;
    const right = parseMultiplyDivide(ctx);
    left = new ArithmeticExpression({
      operator,
      left,
      right,
    });
  }

  return left;
}

function parseMultiplyDivide(ctx) {
  let left = parsePower(ctx);

  while (ctx.check(TokenType.OP_MULTIPLY) || ctx.check(TokenType.OP_DIVIDE)) {
    const operator = ctx.advance().value;
    const right = parsePower(ctx);
    left = new ArithmeticExpression({
      operator,
      left,
      right,
    });
  }

  return left;
}

function parsePower(ctx) {
  let left = parseUnary(ctx);

  while (ctx.check(TokenType.OP_POWER)) {
    const operator = ctx.advance().value;
    const right = parseUnary(ctx);
    left = new ArithmeticExpression({
      operator,
      left,
      right,
    });
  }

  return left;
}

function parseUnary(ctx) {
  if (ctx.check(TokenType.OP_MINUS)) {
    ctx.advance();
    const expr = parsePrimary(ctx);
    return new ArithmeticExpression({
      unaryMinus: true,
      right: expr,
    });
  }

  if (ctx.check(TokenType.OP_PLUS)) {
    ctx.advance();
  }

  return parsePrimary(ctx);
}

function parsePrimary(ctx) {
  // Parenthesized expression
  if (ctx.check(TokenType.OP_LPAREN)) {
    ctx.advance();
    const expr = parseArithmeticExpression(ctx);
    ctx.match(TokenType.OP_RPAREN);
    return expr;
  }

  // Numeric literal
  if (ctx.check(TokenType.NUMERIC_LITERAL)) {
    return new ArithmeticExpression({
      value: ctx.advance().value,
    });
  }

  // FUNCTION intrinsic call, e.g. COMPUTE X = FUNCTION MOD(17, 5)
  if (ctx.checkValue('FUNCTION')) {
    return new ArithmeticExpression({
      functionCall: parseFunctionCall(ctx),
    });
  }

  // Variable reference
  if (ctx.check(TokenType.IDENTIFIER)) {
    return new ArithmeticExpression({
      variable: parseVariableReference(ctx),
    });
  }

  return null;
}

/**
 * Parse a condition expression
 */
function parseCondition(ctx) {
  return parseOrCondition(ctx);
}

function parseOrCondition(ctx) {
  let left = parseAndCondition(ctx);

  while (ctx.checkValue('OR')) {
    ctx.advance();
    const right = parseAndCondition(ctx);
    left = new Condition({
      conditionType: 'compound',
      operator: 'OR',
      left,
      right,
    });
  }

  return left;
}

function parseAndCondition(ctx) {
  let left = parseNotCondition(ctx);

  while (ctx.checkValue('AND')) {
    ctx.advance();
    const right = parseNotCondition(ctx);
    left = new Condition({
      conditionType: 'compound',
      operator: 'AND',
      left,
      right,
    });
  }

  return left;
}

function parseNotCondition(ctx) {
  let negated = false;
  if (ctx.matchValue('NOT')) {
    negated = true;
  }

  const condition = parsePrimaryCondition(ctx);
  if (condition && negated) {
    condition.negated = true;
  }

  return condition;
}

/**
 * Build a `Condition` node with its `subject` actually attached.
 *
 * parser/ast.js's base `Condition` class constructor does not read/store an
 * `options.subject` at all (only its subclasses RelationalCondition/
 * ClassCondition/SignCondition do, in their own constructors) - so every
 * `new Condition({ conditionType: 'class'|'sign'|'simple', subject, ... })`
 * call below (this parser builds plain `Condition` instances for those three
 * shapes, not the dedicated subclasses) was silently dropping `subject`,
 * leaving `condition.subject` `undefined` for class conditions (`IS
 * NUMERIC`/`ALPHABETIC`/...), sign conditions (`IS POSITIVE`/`NEGATIVE`/
 * `ZERO`), and - most visibly - level-88 condition-name tests (`IF
 * WS-STATUS-ERROR`, `EVALUATE TRUE WHEN WS-STATUS-ERROR`), which rendered as
 * an empty `if  then` (a compile error) since generator/expression-gen.js's
 * convertCondition has nothing to convert. Assigning `.subject` directly
 * after construction (rather than editing the shared ast.js base class) is
 * the smallest fix that doesn't touch the AST node definitions.
 */
function makeCondition(options) {
  const cond = new Condition(options);
  cond.subject = options.subject ?? null;
  return cond;
}

function parsePrimaryCondition(ctx) {
  // Parenthesized condition
  if (ctx.check(TokenType.OP_LPAREN)) {
    ctx.advance();
    const cond = parseCondition(ctx);
    ctx.match(TokenType.OP_RPAREN);
    return cond;
  }

  // Class condition
  if (ctx.check(TokenType.IDENTIFIER)) {
    const subject = parseOperand(ctx);

    // Check for IS [NOT]
    ctx.matchValue('IS');
    const notMod = ctx.matchValue('NOT');

    // Class test
    if (ctx.matchValue('NUMERIC')) {
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'NUMERIC',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ALPHABETIC')) {
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'ALPHABETIC',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ALPHABETIC-LOWER')) {
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'ALPHABETIC-LOWER',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ALPHABETIC-UPPER')) {
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'ALPHABETIC-UPPER',
        negated: notMod,
      });
    }

    // Sign test
    if (ctx.matchValue('POSITIVE')) {
      return makeCondition({
        conditionType: 'sign',
        subject,
        signType: 'POSITIVE',
        negated: notMod,
      });
    }
    if (ctx.matchValue('NEGATIVE')) {
      return makeCondition({
        conditionType: 'sign',
        subject,
        signType: 'NEGATIVE',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ZERO', 'ZEROS', 'ZEROES')) {
      return makeCondition({
        conditionType: 'sign',
        subject,
        signType: 'ZERO',
        negated: notMod,
      });
    }

    // Relational condition
    let operator = null;
    if (ctx.check(TokenType.OP_EQUAL) || ctx.matchValue('EQUAL', 'EQUALS')) {
      ctx.match(TokenType.OP_EQUAL);
      ctx.matchValue('TO');
      operator = notMod ? '<>' : '=';
    } else if (ctx.check(TokenType.OP_GREATER) || ctx.matchValue('GREATER')) {
      ctx.match(TokenType.OP_GREATER);
      ctx.matchValue('THAN');
      if (ctx.matchValue('OR')) {
        ctx.matchValue('EQUAL');
        ctx.matchValue('TO');
        operator = notMod ? '<' : '>=';
      } else {
        operator = notMod ? '<=' : '>';
      }
    } else if (ctx.check(TokenType.OP_LESS) || ctx.matchValue('LESS')) {
      ctx.match(TokenType.OP_LESS);
      ctx.matchValue('THAN');
      if (ctx.matchValue('OR')) {
        ctx.matchValue('EQUAL');
        ctx.matchValue('TO');
        operator = notMod ? '>' : '<=';
      } else {
        operator = notMod ? '>=' : '<';
      }
    } else if (ctx.check(TokenType.OP_GREATER_EQUAL)) {
      ctx.advance();
      operator = notMod ? '<' : '>=';
    } else if (ctx.check(TokenType.OP_LESS_EQUAL)) {
      ctx.advance();
      operator = notMod ? '>' : '<=';
    } else if (ctx.check(TokenType.OP_NOT_EQUAL)) {
      ctx.advance();
      operator = notMod ? '=' : '<>';
    }

    if (operator) {
      const object = parseOperand(ctx);
      return new RelationalCondition({
        subject,
        relationalOperator: operator,
        object,
      });
    }

    // Condition name (88 level)
    return makeCondition({
      conditionType: 'simple',
      subject,
    });
  }

  return null;
}

/**
 * Parse PERFORM statement
 *
 * COBOL's PERFORM has an out-of-line form (PERFORM procedure-name-1
 * [THRU procedure-name-2] ...) and an inline form (PERFORM ... statements
 * ... END-PERFORM), and a repeat clause (TIMES / UNTIL / VARYING) that can
 * attach to *either* form. The only token that tells the two forms apart
 * is whether an IDENTIFIER immediately following PERFORM is a target
 * procedure-name or is itself the TIMES-count operand (e.g. `PERFORM
 * WS-COUNT TIMES` has no target paragraph even though WS-COUNT is an
 * IDENTIFIER token) - so that must be checked with one token of lookahead
 * *before* deciding whether a target paragraph is present. The previous
 * implementation used `!ctx.check(TokenType.IDENTIFIER)` as its inline/
 * out-of-line dispatch, which is also true for a numeric TIMES count
 * (`PERFORM 3 TIMES`), routing it into the bare-inline branch where TIMES
 * was never detected - see tests/corpus/README.md finding #1.
 */
function parsePerformStatement(ctx) {
  ctx.advance(); // Skip PERFORM

  const stmt = new PerformStatement();

  // A target procedure-name is present only when the current token is an
  // IDENTIFIER that is *not* itself the operand of an inline "<count>
  // TIMES" clause.
  const nextIsTimes = ctx.peek(1)?.value?.toUpperCase() === 'TIMES';
  const hasTarget = ctx.check(TokenType.IDENTIFIER) && !nextIsTimes;

  if (hasTarget) {
    stmt.targetParagraph = ctx.advance().value;

    if (ctx.matchValue('THRU', 'THROUGH')) {
      if (ctx.check(TokenType.IDENTIFIER)) {
        stmt.throughParagraph = ctx.advance().value;
      }
    }
  }

  // TIMES clause: <numeric-literal | identifier> TIMES. Applies to both
  // the out-of-line form (repeats the target paragraph) and the inline
  // form (repeats the bodied statements).
  if ((ctx.check(TokenType.NUMERIC_LITERAL) || ctx.check(TokenType.IDENTIFIER)) &&
      ctx.peek(1)?.value?.toUpperCase() === 'TIMES') {
    stmt.performType = 'times';
    stmt.times = parseOperand(ctx);
    ctx.matchValue('TIMES');
  } else {
    // WITH TEST BEFORE/AFTER may precede UNTIL or VARYING, for either form.
    if (ctx.matchValue('WITH')) {
      ctx.matchValue('TEST');
      if (ctx.matchValue('BEFORE')) {
        stmt.testBefore = true;
      } else if (ctx.matchValue('AFTER')) {
        stmt.testBefore = false;
      }
    }

    if (ctx.matchValue('UNTIL')) {
      stmt.performType = 'until';
      stmt.until = parseCondition(ctx);
    } else if (ctx.matchValue('VARYING')) {
      stmt.performType = 'varying';
      stmt.varying = parseVaryingClause(ctx);
    } else {
      stmt.performType = hasTarget ? 'simple' : 'inline';
    }
  }

  // Only the form with no out-of-line target carries an inline statement
  // body terminated by END-PERFORM.
  if (!hasTarget) {
    stmt.statements = parseStatementBlock(ctx, ['END-PERFORM']);
    ctx.matchValue('END-PERFORM');
  }

  return stmt;
}

/**
 * Parse VARYING clause
 */
function parseVaryingClause(ctx) {
  const varying = new VaryingClause();

  if (ctx.check(TokenType.IDENTIFIER)) {
    varying.variable = ctx.advance().value;
  }

  if (ctx.matchValue('FROM')) {
    varying.from = parseOperand(ctx);
  }

  if (ctx.matchValue('BY')) {
    varying.by = parseOperand(ctx);
  }

  if (ctx.matchValue('UNTIL')) {
    varying.until = parseCondition(ctx);
  }

  // Parse AFTER clauses
  while (ctx.matchValue('AFTER')) {
    const afterClause = new VaryingClause();
    if (ctx.check(TokenType.IDENTIFIER)) {
      afterClause.variable = ctx.advance().value;
    }
    if (ctx.matchValue('FROM')) {
      afterClause.from = parseOperand(ctx);
    }
    if (ctx.matchValue('BY')) {
      afterClause.by = parseOperand(ctx);
    }
    if (ctx.matchValue('UNTIL')) {
      afterClause.until = parseCondition(ctx);
    }
    varying.after.push(afterClause);
  }

  return varying;
}

/**
 * Parse IF statement
 */
function parseIfStatement(ctx) {
  ctx.advance(); // Skip IF

  const stmt = new IfStatement();
  stmt.condition = parseCondition(ctx);

  // Skip optional THEN
  ctx.matchValue('THEN');

  // Parse THEN statements
  stmt.thenStatements = parseStatementBlock(ctx, ['ELSE', 'END-IF']);

  // Check for ELSE
  if (ctx.matchValue('ELSE')) {
    stmt.elseStatements = parseStatementBlock(ctx, ['END-IF']);
  }

  // Skip END-IF
  ctx.matchValue('END-IF');

  return stmt;
}

/**
 * Parse EVALUATE statement
 */
function parseEvaluateStatement(ctx) {
  ctx.advance(); // Skip EVALUATE

  const stmt = new EvaluateStatement();

  // Parse subjects (what we're evaluating)
  do {
    if (ctx.matchValue('TRUE')) {
      stmt.subjects.push({ type: 'TRUE' });
    } else if (ctx.matchValue('FALSE')) {
      stmt.subjects.push({ type: 'FALSE' });
    } else {
      const subject = parseOperand(ctx);
      if (subject) {
        stmt.subjects.push(subject);
      }
    }
  } while (ctx.matchValue('ALSO'));

  // Parse WHEN clauses
  while (ctx.checkValue('WHEN')) {
    ctx.advance(); // Skip WHEN

    // Check for WHEN OTHER
    if (ctx.matchValue('OTHER')) {
      stmt.whenOther = parseStatementBlock(ctx, ['WHEN', 'END-EVALUATE']);
      continue;
    }

    const whenClause = new WhenClause();

    // Parse conditions for this WHEN
    do {
      if (ctx.matchValue('ANY')) {
        whenClause.conditions.push({ type: 'ANY' });
      } else if (ctx.matchValue('TRUE')) {
        whenClause.conditions.push({ type: 'TRUE' });
      } else if (ctx.matchValue('FALSE')) {
        whenClause.conditions.push({ type: 'FALSE' });
      } else if (ctx.matchValue('NOT')) {
        // NOT value or NOT range
        const value = parseOperand(ctx);
        whenClause.conditions.push({ type: 'NOT', value });
      } else {
        const value = parseOperand(ctx);
        if (ctx.matchValue('THRU', 'THROUGH')) {
          const endValue = parseOperand(ctx);
          whenClause.conditions.push({ type: 'RANGE', from: value, to: endValue });
        } else {
          whenClause.conditions.push({ type: 'VALUE', value });
        }
      }
    } while (ctx.matchValue('ALSO'));

    // Parse statements for this WHEN
    whenClause.statements = parseStatementBlock(ctx, ['WHEN', 'END-EVALUATE']);
    stmt.whenClauses.push(whenClause);
  }

  ctx.matchValue('END-EVALUATE');

  return stmt;
}

/**
 * Parse MOVE statement
 */
function parseMoveStatement(ctx) {
  ctx.advance(); // Skip MOVE

  const stmt = new MoveStatement();

  // Check for CORRESPONDING/CORR
  if (ctx.matchValue('CORRESPONDING', 'CORR')) {
    stmt.corresponding = true;
  }

  // Parse source
  stmt.source = parseOperand(ctx);

  // Skip TO
  ctx.matchValue('TO');

  // Parse targets
  while (isIdentifierOperand(ctx)) {
    const target = parseVariableReference(ctx);
    if (target) {
      stmt.targets.push(target);
    } else {
      break;
    }
  }

  return stmt;
}

/**
 * Parse COMPUTE statement
 */
function parseComputeStatement(ctx) {
  ctx.advance(); // Skip COMPUTE

  const stmt = new ComputeStatement();

  // Parse targets
  while (ctx.check(TokenType.IDENTIFIER)) {
    const target = parseVariableReference(ctx);
    if (target) {
      stmt.targets.push(target);
      if (ctx.matchValue('ROUNDED')) {
        stmt.rounded = true;
      }
    }
    if (!ctx.check(TokenType.OP_EQUAL)) {
      break;
    }
  }

  // Skip equals
  ctx.match(TokenType.OP_EQUAL);

  // Parse expression
  stmt.expression = parseArithmeticExpression(ctx);

  // Parse ON SIZE ERROR
  if (ctx.matchValue('ON')) {
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.onSizeError = parseStatementBlock(ctx, ['NOT', 'END-COMPUTE']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.notOnSizeError = parseStatementBlock(ctx, ['END-COMPUTE']);
  }

  ctx.matchValue('END-COMPUTE');

  return stmt;
}

/**
 * Parse ADD statement
 */
function parseAddStatement(ctx) {
  ctx.advance(); // Skip ADD

  const stmt = new AddStatement();

  // Check for CORRESPONDING
  if (ctx.matchValue('CORRESPONDING', 'CORR')) {
    stmt.corresponding = true;
    const source = parseVariableReference(ctx);
    stmt.addends.push(source);
    ctx.matchValue('TO');
    const target = parseVariableReference(ctx);
    stmt.to.push(target);
    return stmt;
  }

  // Parse addends
  while (isOperandStart(ctx)) {
    const addend = parseOperand(ctx);
    if (addend) {
      stmt.addends.push(addend);
    }
    if (ctx.checkValue('TO') || ctx.checkValue('GIVING')) break;
  }

  // Parse TO or GIVING
  if (ctx.matchValue('TO')) {
    while (isOperandStart(ctx)) {
      const target = parseOperand(ctx);
      if (target) {
        stmt.to.push(target);
        if (ctx.matchValue('ROUNDED')) {
          stmt.rounded = true;
        }
      }
      if (ctx.checkValue('GIVING') || ctx.checkValue('ON') || ctx.checkValue('NOT')) break;
    }
  }

  if (ctx.matchValue('GIVING')) {
    while (isIdentifierOperand(ctx)) {
      const target = parseVariableReference(ctx);
      if (target) {
        stmt.giving.push(target);
        if (ctx.matchValue('ROUNDED')) {
          stmt.rounded = true;
        }
      }
      if (ctx.checkValue('ON') || ctx.checkValue('NOT') || ctx.check(TokenType.PERIOD)) break;
    }
  }

  // Parse ON SIZE ERROR
  if (ctx.matchValue('ON')) {
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.onSizeError = parseStatementBlock(ctx, ['NOT', 'END-ADD']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.notOnSizeError = parseStatementBlock(ctx, ['END-ADD']);
  }

  ctx.matchValue('END-ADD');

  return stmt;
}

/**
 * Parse SUBTRACT statement
 */
function parseSubtractStatement(ctx) {
  ctx.advance(); // Skip SUBTRACT

  const stmt = new SubtractStatement();

  // Check for CORRESPONDING
  if (ctx.matchValue('CORRESPONDING', 'CORR')) {
    stmt.corresponding = true;
    const source = parseVariableReference(ctx);
    stmt.subtrahends.push(source);
    ctx.matchValue('FROM');
    const target = parseVariableReference(ctx);
    stmt.from.push(target);
    return stmt;
  }

  // Parse subtrahends
  while (isOperandStart(ctx)) {
    const subtrahend = parseOperand(ctx);
    if (subtrahend) {
      stmt.subtrahends.push(subtrahend);
    }
    if (ctx.checkValue('FROM')) break;
  }

  // Parse FROM
  ctx.matchValue('FROM');
  while (isOperandStart(ctx)) {
    const from = parseOperand(ctx);
    if (from) {
      stmt.from.push(from);
      if (ctx.matchValue('ROUNDED')) {
        stmt.rounded = true;
      }
    }
    if (ctx.checkValue('GIVING') || ctx.checkValue('ON') || ctx.checkValue('NOT')) break;
  }

  // Parse GIVING
  if (ctx.matchValue('GIVING')) {
    while (isIdentifierOperand(ctx)) {
      const target = parseVariableReference(ctx);
      if (target) {
        stmt.giving.push(target);
        if (ctx.matchValue('ROUNDED')) {
          stmt.rounded = true;
        }
      }
      if (ctx.checkValue('ON') || ctx.checkValue('NOT') || ctx.check(TokenType.PERIOD)) break;
    }
  }

  // Parse ON SIZE ERROR
  if (ctx.matchValue('ON')) {
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.onSizeError = parseStatementBlock(ctx, ['NOT', 'END-SUBTRACT']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.notOnSizeError = parseStatementBlock(ctx, ['END-SUBTRACT']);
  }

  ctx.matchValue('END-SUBTRACT');

  return stmt;
}

/**
 * Parse MULTIPLY statement
 */
function parseMultiplyStatement(ctx) {
  ctx.advance(); // Skip MULTIPLY

  const stmt = new MultiplyStatement();

  // Parse multiplicand
  stmt.multiplicand = parseOperand(ctx);

  // Parse BY
  ctx.matchValue('BY');
  while (isOperandStart(ctx)) {
    const by = parseOperand(ctx);
    if (by) {
      stmt.by.push(by);
      if (ctx.matchValue('ROUNDED')) {
        stmt.rounded = true;
      }
    }
    if (ctx.checkValue('GIVING') || ctx.checkValue('ON') || ctx.checkValue('NOT')) break;
  }

  // Parse GIVING
  if (ctx.matchValue('GIVING')) {
    while (isIdentifierOperand(ctx)) {
      const target = parseVariableReference(ctx);
      if (target) {
        stmt.giving.push(target);
        if (ctx.matchValue('ROUNDED')) {
          stmt.rounded = true;
        }
      }
      if (ctx.checkValue('ON') || ctx.checkValue('NOT') || ctx.check(TokenType.PERIOD)) break;
    }
  }

  // Parse ON SIZE ERROR
  if (ctx.matchValue('ON')) {
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.onSizeError = parseStatementBlock(ctx, ['NOT', 'END-MULTIPLY']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.notOnSizeError = parseStatementBlock(ctx, ['END-MULTIPLY']);
  }

  ctx.matchValue('END-MULTIPLY');

  return stmt;
}

/**
 * Parse DIVIDE statement
 */
function parseDivideStatement(ctx) {
  ctx.advance(); // Skip DIVIDE

  const stmt = new DivideStatement();

  // Parse first operand
  const first = parseOperand(ctx);

  // Check for INTO or BY
  if (ctx.matchValue('INTO')) {
    stmt.divisor = first;
    while (isOperandStart(ctx)) {
      const into = parseOperand(ctx);
      if (into) {
        stmt.into.push(into);
        if (ctx.matchValue('ROUNDED')) {
          stmt.rounded = true;
        }
      }
      if (ctx.checkValue('GIVING') || ctx.checkValue('REMAINDER') ||
          ctx.checkValue('ON') || ctx.checkValue('NOT')) break;
    }
  } else if (ctx.matchValue('BY')) {
    stmt.dividend = first;
    stmt.divisor = parseOperand(ctx);
  }

  // Parse GIVING
  if (ctx.matchValue('GIVING')) {
    while (isIdentifierOperand(ctx)) {
      const target = parseVariableReference(ctx);
      if (target) {
        stmt.giving.push(target);
        if (ctx.matchValue('ROUNDED')) {
          stmt.rounded = true;
        }
      }
      if (ctx.checkValue('REMAINDER') || ctx.checkValue('ON') || ctx.checkValue('NOT')) break;
    }
  }

  // Parse REMAINDER
  if (ctx.matchValue('REMAINDER')) {
    if (ctx.check(TokenType.IDENTIFIER)) {
      stmt.remainder = parseVariableReference(ctx);
    }
  }

  // Parse ON SIZE ERROR
  if (ctx.matchValue('ON')) {
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.onSizeError = parseStatementBlock(ctx, ['NOT', 'END-DIVIDE']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('SIZE');
    ctx.matchValue('ERROR');
    stmt.notOnSizeError = parseStatementBlock(ctx, ['END-DIVIDE']);
  }

  ctx.matchValue('END-DIVIDE');

  return stmt;
}

/**
 * Parse STRING statement
 */
function parseStringStatement(ctx) {
  ctx.advance(); // Skip STRING

  const stmt = new StringStatement();

  // Parse sources with DELIMITED BY
  while (!ctx.checkValue('INTO') && !ctx.isAtEnd()) {
    const source = { value: parseOperand(ctx), delimitedBy: null };

    if (ctx.matchValue('DELIMITED')) {
      ctx.matchValue('BY');
      if (ctx.matchValue('SIZE')) {
        source.delimitedBy = { type: 'SIZE' };
      } else {
        source.delimitedBy = { type: 'VALUE', value: parseOperand(ctx) };
      }
    }

    stmt.sources.push(source);
  }

  // Parse INTO
  ctx.matchValue('INTO');
  stmt.into = parseVariableReference(ctx);

  // Parse WITH POINTER
  if (ctx.matchValue('WITH')) {
    ctx.matchValue('POINTER');
    stmt.pointer = parseVariableReference(ctx);
  } else if (ctx.matchValue('POINTER')) {
    stmt.pointer = parseVariableReference(ctx);
  }

  // Parse ON OVERFLOW
  if (ctx.matchValue('ON')) {
    ctx.matchValue('OVERFLOW');
    stmt.onOverflow = parseStatementBlock(ctx, ['NOT', 'END-STRING']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('OVERFLOW');
    stmt.notOnOverflow = parseStatementBlock(ctx, ['END-STRING']);
  }

  ctx.matchValue('END-STRING');

  return stmt;
}

/**
 * Parse UNSTRING statement
 */
function parseUnstringStatement(ctx) {
  ctx.advance(); // Skip UNSTRING

  const stmt = new UnstringStatement();

  // Parse source
  stmt.source = parseVariableReference(ctx);

  // Parse DELIMITED BY
  if (ctx.matchValue('DELIMITED')) {
    ctx.matchValue('BY');
    ctx.matchValue('ALL');
    stmt.delimiters.push(parseOperand(ctx));

    while (ctx.matchValue('OR')) {
      ctx.matchValue('ALL');
      stmt.delimiters.push(parseOperand(ctx));
    }
  }

  // Parse INTO
  ctx.matchValue('INTO');
  while (ctx.check(TokenType.IDENTIFIER)) {
    const target = { target: parseVariableReference(ctx), delimiter: null, count: null };

    if (ctx.matchValue('DELIMITER')) {
      ctx.matchValue('IN');
      target.delimiter = parseVariableReference(ctx);
    }

    if (ctx.matchValue('COUNT')) {
      ctx.matchValue('IN');
      target.count = parseVariableReference(ctx);
    }

    stmt.into.push(target);

    if (ctx.checkValue('WITH') || ctx.checkValue('POINTER') ||
        ctx.checkValue('TALLYING') || ctx.checkValue('ON') ||
        ctx.checkValue('NOT') || ctx.check(TokenType.PERIOD)) break;
  }

  // Parse WITH POINTER
  if (ctx.matchValue('WITH')) {
    ctx.matchValue('POINTER');
    stmt.pointer = parseVariableReference(ctx);
  } else if (ctx.matchValue('POINTER')) {
    stmt.pointer = parseVariableReference(ctx);
  }

  // Parse TALLYING IN
  if (ctx.matchValue('TALLYING')) {
    ctx.matchValue('IN');
    stmt.tallying = parseVariableReference(ctx);
  }

  ctx.matchValue('END-UNSTRING');

  return stmt;
}

/**
 * Parse INSPECT statement
 */
function parseInspectStatement(ctx) {
  ctx.advance(); // Skip INSPECT

  const stmt = new InspectStatement();
  stmt.target = parseVariableReference(ctx);

  // Parse TALLYING, REPLACING, or CONVERTING
  if (ctx.matchValue('TALLYING')) {
    stmt.inspectType = 'tallying';
    // Parse tallying clauses (simplified)
    while (ctx.check(TokenType.IDENTIFIER)) {
      const tally = {
        counter: parseVariableReference(ctx),
        type: null,
        what: null,
      };
      ctx.matchValue('FOR');
      if (ctx.matchValue('CHARACTERS')) {
        tally.type = 'CHARACTERS';
      } else if (ctx.matchValue('ALL')) {
        tally.type = 'ALL';
        tally.what = parseOperand(ctx);
      } else if (ctx.matchValue('LEADING')) {
        tally.type = 'LEADING';
        tally.what = parseOperand(ctx);
      }
      stmt.tallying.push(tally);

      if (ctx.checkValue('REPLACING') || ctx.check(TokenType.PERIOD)) break;
    }
  }

  if (ctx.matchValue('REPLACING')) {
    stmt.inspectType = stmt.inspectType === 'tallying' ? 'tallying-replacing' : 'replacing';
    // Parse replacing clauses (simplified)
    while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
      const replace = { type: null, from: null, to: null };

      if (ctx.matchValue('CHARACTERS')) {
        replace.type = 'CHARACTERS';
      } else if (ctx.matchValue('ALL')) {
        replace.type = 'ALL';
        replace.from = parseOperand(ctx);
      } else if (ctx.matchValue('LEADING')) {
        replace.type = 'LEADING';
        replace.from = parseOperand(ctx);
      } else if (ctx.matchValue('FIRST')) {
        replace.type = 'FIRST';
        replace.from = parseOperand(ctx);
      } else {
        break;
      }

      if (ctx.matchValue('BY')) {
        replace.to = parseOperand(ctx);
      }

      stmt.replacing.push(replace);
    }
  }

  if (ctx.matchValue('CONVERTING')) {
    stmt.inspectType = 'converting';
    const from = parseOperand(ctx);
    ctx.matchValue('TO');
    const to = parseOperand(ctx);
    stmt.converting = { from, to };
  }

  return stmt;
}

/**
 * Parse CALL statement
 */
function parseCallStatement(ctx) {
  ctx.advance(); // Skip CALL

  const stmt = new CallStatement();

  // Parse program name (literal or variable)
  stmt.programName = parseOperand(ctx);

  // Parse USING clause
  if (ctx.matchValue('USING')) {
    let currentMode = 'REFERENCE';

    while (ctx.check(TokenType.IDENTIFIER) || ctx.check(TokenType.STRING_LITERAL) ||
           ctx.checkValue('BY') || ctx.checkValue('REFERENCE') ||
           ctx.checkValue('CONTENT') || ctx.checkValue('VALUE')) {

      // Check for BY REFERENCE/CONTENT/VALUE
      if (ctx.matchValue('BY')) {
        if (ctx.matchValue('REFERENCE')) {
          currentMode = 'REFERENCE';
          continue;
        } else if (ctx.matchValue('CONTENT')) {
          currentMode = 'CONTENT';
          continue;
        } else if (ctx.matchValue('VALUE')) {
          currentMode = 'VALUE';
          continue;
        }
      }

      if (ctx.matchValue('REFERENCE')) {
        currentMode = 'REFERENCE';
        continue;
      }
      if (ctx.matchValue('CONTENT')) {
        currentMode = 'CONTENT';
        continue;
      }
      if (ctx.matchValue('VALUE')) {
        currentMode = 'VALUE';
        continue;
      }

      // Parse parameter
      const param = new CallParameter({
        mode: currentMode,
        value: parseOperand(ctx),
      });

      // Check for LENGTH OF
      if (ctx.matchValue('LENGTH')) {
        ctx.matchValue('OF');
        param.length = parseVariableReference(ctx);
      }

      stmt.using.push(param);

      if (ctx.checkValue('RETURNING') || ctx.checkValue('ON') ||
          ctx.checkValue('NOT') || ctx.check(TokenType.PERIOD)) break;
    }
  }

  // Parse RETURNING
  if (ctx.matchValue('RETURNING')) {
    stmt.returning = parseVariableReference(ctx);
  }

  // Parse ON EXCEPTION
  if (ctx.matchValue('ON')) {
    ctx.matchValue('EXCEPTION');
    stmt.onException = parseStatementBlock(ctx, ['NOT', 'END-CALL']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('EXCEPTION');
    stmt.notOnException = parseStatementBlock(ctx, ['END-CALL']);
  }

  ctx.matchValue('END-CALL');

  return stmt;
}

/**
 * Parse SEARCH / SEARCH ALL statement
 */
function parseSearchStatement(ctx) {
  ctx.advance(); // Skip SEARCH

  const stmt = new SearchStatement();
  stmt.searchAll = ctx.matchValue('ALL');

  stmt.target = parseVariableReference(ctx);

  if (ctx.matchValue('VARYING')) {
    stmt.varying = parseVariableReference(ctx);
  }

  if (ctx.matchValue('AT')) {
    ctx.matchValue('END');
    stmt.atEnd = parseStatementBlock(ctx, ['WHEN', 'END-SEARCH']);
  }

  while (ctx.checkValue('WHEN')) {
    ctx.advance(); // Skip WHEN

    const when = new SearchWhenClause();
    when.condition = parseCondition(ctx);
    when.statements = parseStatementBlock(ctx, ['WHEN', 'END-SEARCH']);
    stmt.whenClauses.push(when);
  }

  ctx.matchValue('END-SEARCH');

  return stmt;
}

/**
 * Parse the shared ON ASCENDING/DESCENDING KEY clause(s) for SORT/MERGE.
 * Grammar: { [ON] {ASCENDING|DESCENDING} [KEY] {data-name}... }...
 */
function parseSortKeys(ctx) {
  const keys = [];

  while (true) {
    ctx.matchValue('ON'); // optional, but conventionally present each time

    let order = null;
    if (ctx.matchValue('ASCENDING')) {
      order = 'ASCENDING';
    } else if (ctx.matchValue('DESCENDING')) {
      order = 'DESCENDING';
    } else {
      break;
    }

    ctx.matchValue('KEY');
    ctx.matchValue('IS');

    const fields = [];
    while (ctx.check(TokenType.IDENTIFIER)) {
      fields.push(parseVariableReference(ctx));
    }

    keys.push({ order, fields });
  }

  return keys;
}

/**
 * Parse an INPUT/OUTPUT PROCEDURE clause: PROCEDURE [IS] name [THRU name]
 */
function parseSortProcedureClause(ctx) {
  ctx.matchValue('PROCEDURE');
  ctx.matchValue('IS');

  const proc = { procedure: null, through: null };
  if (ctx.check(TokenType.IDENTIFIER)) {
    proc.procedure = ctx.advance().value;
  }
  if (ctx.matchValue('THRU', 'THROUGH')) {
    if (ctx.check(TokenType.IDENTIFIER)) {
      proc.through = ctx.advance().value;
    }
  }
  return proc;
}

/**
 * Parse SORT statement (table sort, or file sort with
 * USING/GIVING/INPUT PROCEDURE/OUTPUT PROCEDURE)
 */
function parseSortStatement(ctx) {
  ctx.advance(); // Skip SORT

  const stmt = new SortStatement();

  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.fileName = ctx.advance().value;
  }

  stmt.keys = parseSortKeys(ctx);

  if (ctx.matchValue('WITH')) {
    ctx.matchValue('DUPLICATES');
    ctx.matchValue('IN');
    ctx.matchValue('ORDER');
    stmt.duplicates = true;
  } else if (ctx.matchValue('DUPLICATES')) {
    ctx.matchValue('IN');
    ctx.matchValue('ORDER');
    stmt.duplicates = true;
  }

  if (ctx.matchValue('COLLATING')) {
    ctx.matchValue('SEQUENCE');
    ctx.matchValue('IS');
    if (ctx.check(TokenType.IDENTIFIER)) {
      stmt.collatingSequence = ctx.advance().value;
    }
  }

  if (ctx.matchValue('INPUT')) {
    stmt.inputProcedure = parseSortProcedureClause(ctx);
  } else if (ctx.matchValue('USING')) {
    while (ctx.check(TokenType.IDENTIFIER)) {
      stmt.using.push(ctx.advance().value);
    }
  }

  if (ctx.matchValue('OUTPUT')) {
    stmt.outputProcedure = parseSortProcedureClause(ctx);
  } else if (ctx.matchValue('GIVING')) {
    while (ctx.check(TokenType.IDENTIFIER)) {
      stmt.giving.push(ctx.advance().value);
    }
  }

  return stmt;
}

/**
 * Parse MERGE statement
 */
function parseMergeStatement(ctx) {
  ctx.advance(); // Skip MERGE

  const stmt = new MergeStatement();

  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.fileName = ctx.advance().value;
  }

  stmt.keys = parseSortKeys(ctx);

  if (ctx.matchValue('COLLATING')) {
    ctx.matchValue('SEQUENCE');
    ctx.matchValue('IS');
    if (ctx.check(TokenType.IDENTIFIER)) {
      stmt.collatingSequence = ctx.advance().value;
    }
  }

  if (ctx.matchValue('USING')) {
    while (ctx.check(TokenType.IDENTIFIER)) {
      stmt.using.push(ctx.advance().value);
    }
  }

  if (ctx.matchValue('OUTPUT')) {
    stmt.outputProcedure = parseSortProcedureClause(ctx);
  } else if (ctx.matchValue('GIVING')) {
    while (ctx.check(TokenType.IDENTIFIER)) {
      stmt.giving.push(ctx.advance().value);
    }
  }

  return stmt;
}

/**
 * Parse RELEASE statement (writes a record to a SORT work file from
 * within an INPUT PROCEDURE)
 */
function parseReleaseStatement(ctx) {
  ctx.advance(); // Skip RELEASE

  const stmt = new ReleaseStatement();

  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.recordName = ctx.advance().value;
  }

  if (ctx.matchValue('FROM')) {
    stmt.from = parseVariableReference(ctx);
  }

  return stmt;
}

/**
 * Parse RETURN statement (reads the next sorted/merged record from
 * within an OUTPUT PROCEDURE)
 */
function parseReturnStatement(ctx) {
  ctx.advance(); // Skip RETURN

  const stmt = new ReturnStatement();

  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.fileName = ctx.advance().value;
  }

  ctx.matchValue('RECORD');

  if (ctx.matchValue('INTO')) {
    stmt.into = parseVariableReference(ctx);
  }

  if (ctx.matchValue('AT')) {
    ctx.matchValue('END');
    stmt.atEnd = parseStatementBlock(ctx, ['NOT', 'END-RETURN']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('AT');
    ctx.matchValue('END');
    stmt.notAtEnd = parseStatementBlock(ctx, ['END-RETURN']);
  }

  ctx.matchValue('END-RETURN');

  return stmt;
}

/**
 * Parse file I/O statements
 */
function parseOpenStatement(ctx) {
  ctx.advance(); // Skip OPEN

  const stmt = new OpenStatement();

  while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
    let mode = null;
    let matched = false;

    if (ctx.matchValue('INPUT')) {
      mode = 'INPUT';
      matched = true;
    } else if (ctx.matchValue('OUTPUT')) {
      mode = 'OUTPUT';
      matched = true;
    } else if (ctx.matchValue('I-O')) {
      mode = 'I-O';
      matched = true;
    } else if (ctx.matchValue('EXTEND')) {
      mode = 'EXTEND';
      matched = true;
    }

    // Parse file names for this mode
    let foundFile = false;
    while (ctx.check(TokenType.IDENTIFIER)) {
      stmt.files.push({
        mode,
        fileName: ctx.advance().value,
      });
      foundFile = true;

      if (ctx.checkValue('INPUT') || ctx.checkValue('OUTPUT') ||
          ctx.checkValue('I-O') || ctx.checkValue('EXTEND') ||
          ctx.check(TokenType.PERIOD)) break;
    }

    // If we didn't match a mode or find a file, break to avoid infinite loop
    if (!matched && !foundFile) {
      break;
    }
  }

  return stmt;
}

function parseCloseStatement(ctx) {
  ctx.advance(); // Skip CLOSE

  const stmt = new CloseStatement();

  while (ctx.check(TokenType.IDENTIFIER)) {
    stmt.files.push(ctx.advance().value);
  }

  return stmt;
}

function parseReadStatement(ctx) {
  ctx.advance(); // Skip READ

  const stmt = new ReadStatement();

  // Parse file name
  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.fileName = ctx.advance().value;
  }

  // Parse options
  if (ctx.matchValue('NEXT')) {
    stmt.next = true;
  }
  if (ctx.matchValue('PREVIOUS')) {
    stmt.previous = true;
  }

  ctx.matchValue('RECORD');

  // Parse INTO
  if (ctx.matchValue('INTO')) {
    stmt.into = parseVariableReference(ctx);
  }

  // Parse KEY
  if (ctx.matchValue('KEY')) {
    ctx.matchValue('IS');
    stmt.key = parseVariableReference(ctx);
  }

  // Parse AT END
  if (ctx.matchValue('AT')) {
    ctx.matchValue('END');
    stmt.atEnd = parseStatementBlock(ctx, ['NOT', 'END-READ']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('AT');
    ctx.matchValue('END');
    stmt.notAtEnd = parseStatementBlock(ctx, ['END-READ']);
  }

  // Parse INVALID KEY
  if (ctx.matchValue('INVALID')) {
    ctx.matchValue('KEY');
    stmt.invalidKey = parseStatementBlock(ctx, ['NOT', 'END-READ']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('INVALID');
    ctx.matchValue('KEY');
    stmt.notInvalidKey = parseStatementBlock(ctx, ['END-READ']);
  }

  ctx.matchValue('END-READ');

  return stmt;
}

function parseWriteStatement(ctx) {
  ctx.advance(); // Skip WRITE

  const stmt = new WriteStatement();

  // Parse record name
  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.recordName = ctx.advance().value;
  }

  // Parse FROM
  if (ctx.matchValue('FROM')) {
    stmt.from = parseVariableReference(ctx);
  }

  // Parse ADVANCING
  if (ctx.matchValue('BEFORE', 'AFTER')) {
    const position = ctx.tokens[ctx.position - 1].value.toUpperCase();
    ctx.matchValue('ADVANCING');

    if (ctx.matchValue('PAGE')) {
      stmt.advancing = { position, type: 'PAGE' };
    } else {
      const value = parseOperand(ctx);
      ctx.matchValue('LINE', 'LINES');
      stmt.advancing = { position, type: 'LINES', value };
    }
  }

  // Parse AT END-OF-PAGE
  if (ctx.matchValue('AT')) {
    ctx.matchValue('END-OF-PAGE', 'EOP');
    stmt.atEndOfPage = parseStatementBlock(ctx, ['NOT', 'END-WRITE']);
  }

  // Parse INVALID KEY
  if (ctx.matchValue('INVALID')) {
    ctx.matchValue('KEY');
    stmt.invalidKey = parseStatementBlock(ctx, ['NOT', 'END-WRITE']);
  }

  ctx.matchValue('END-WRITE');

  return stmt;
}

function parseRewriteStatement(ctx) {
  ctx.advance(); // Skip REWRITE

  const stmt = new RewriteStatement();

  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.recordName = ctx.advance().value;
  }

  if (ctx.matchValue('FROM')) {
    stmt.from = parseVariableReference(ctx);
  }

  if (ctx.matchValue('INVALID')) {
    ctx.matchValue('KEY');
    stmt.invalidKey = parseStatementBlock(ctx, ['NOT', 'END-REWRITE']);
  }

  ctx.matchValue('END-REWRITE');

  return stmt;
}

function parseDeleteStatement(ctx) {
  ctx.advance(); // Skip DELETE

  const stmt = new DeleteStatement();

  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.fileName = ctx.advance().value;
  }

  ctx.matchValue('RECORD');

  if (ctx.matchValue('INVALID')) {
    ctx.matchValue('KEY');
    stmt.invalidKey = parseStatementBlock(ctx, ['NOT', 'END-DELETE']);
  }

  ctx.matchValue('END-DELETE');

  return stmt;
}

function parseStartStatement(ctx) {
  ctx.advance(); // Skip START

  const stmt = new StartStatement();

  if (ctx.check(TokenType.IDENTIFIER)) {
    stmt.fileName = ctx.advance().value;
  }

  if (ctx.matchValue('KEY')) {
    ctx.matchValue('IS');

    let operator = '=';
    if (ctx.matchValue('EQUAL')) {
      ctx.matchValue('TO');
      operator = '=';
    } else if (ctx.matchValue('GREATER')) {
      ctx.matchValue('THAN');
      operator = '>';
    } else if (ctx.matchValue('NOT')) {
      ctx.matchValue('LESS');
      ctx.matchValue('THAN');
      operator = '>=';
    } else if (ctx.check(TokenType.OP_EQUAL)) {
      ctx.advance();
      operator = '=';
    } else if (ctx.check(TokenType.OP_GREATER)) {
      ctx.advance();
      operator = '>';
    } else if (ctx.check(TokenType.OP_GREATER_EQUAL)) {
      ctx.advance();
      operator = '>=';
    }

    stmt.key = {
      operator,
      field: parseVariableReference(ctx),
    };
  }

  if (ctx.matchValue('INVALID')) {
    ctx.matchValue('KEY');
    stmt.invalidKey = parseStatementBlock(ctx, ['NOT', 'END-START']);
  }

  ctx.matchValue('END-START');

  return stmt;
}

/**
 * Parse GO TO statement
 */
function parseGoToStatement(ctx) {
  ctx.advance(); // Skip GO
  ctx.matchValue('TO');

  const stmt = new GoToStatement();

  // Parse target paragraphs
  while (ctx.check(TokenType.IDENTIFIER)) {
    stmt.targets.push(ctx.advance().value);
    if (ctx.checkValue('DEPENDING')) break;
  }

  // Parse DEPENDING ON
  if (ctx.matchValue('DEPENDING')) {
    ctx.matchValue('ON');
    if (ctx.check(TokenType.IDENTIFIER)) {
      stmt.dependingOn = parseVariableReference(ctx);
    }
  }

  return stmt;
}

/**
 * Parse STOP statement
 */
function parseStopStatement(ctx) {
  ctx.advance(); // Skip STOP

  const stmt = new StopStatement();

  if (ctx.matchValue('RUN')) {
    stmt.stopType = 'RUN';
    // Check for return code
    if (ctx.check(TokenType.NUMERIC_LITERAL) || ctx.check(TokenType.IDENTIFIER)) {
      stmt.returnCode = parseOperand(ctx);
    }
  } else {
    stmt.stopType = 'literal';
    stmt.returnCode = parseOperand(ctx);
  }

  return stmt;
}

/**
 * Parse GOBACK statement
 */
function parseGobackStatement(ctx) {
  ctx.advance(); // Skip GOBACK

  const stmt = new GobackStatement();

  // Check for return code
  if (ctx.check(TokenType.NUMERIC_LITERAL) || ctx.check(TokenType.IDENTIFIER)) {
    stmt.returnCode = parseOperand(ctx);
  }

  return stmt;
}

/**
 * Parse EXIT statement
 */
function parseExitStatement(ctx) {
  ctx.advance(); // Skip EXIT

  const stmt = new ExitStatement();

  if (ctx.matchValue('PROGRAM')) {
    stmt.exitType = 'PROGRAM';
  } else if (ctx.matchValue('SECTION')) {
    stmt.exitType = 'SECTION';
  } else if (ctx.matchValue('PARAGRAPH')) {
    stmt.exitType = 'PARAGRAPH';
  } else if (ctx.matchValue('PERFORM')) {
    stmt.exitType = 'PERFORM';
  } else {
    stmt.exitType = 'PARAGRAPH';
  }

  return stmt;
}

/**
 * Parse other statements
 */
function parseInitializeStatement(ctx) {
  ctx.advance(); // Skip INITIALIZE

  const stmt = new InitializeStatement();

  // Parse targets
  while (isIdentifierOperand(ctx)) {
    stmt.targets.push(parseVariableReference(ctx));
    if (ctx.checkValue('REPLACING') || ctx.check(TokenType.PERIOD)) break;
  }

  // Parse REPLACING
  if (ctx.matchValue('REPLACING')) {
    while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
      const category = [];
      if (ctx.matchValue('ALPHABETIC')) category.push('ALPHABETIC');
      if (ctx.matchValue('ALPHANUMERIC')) category.push('ALPHANUMERIC');
      if (ctx.matchValue('NUMERIC')) category.push('NUMERIC');

      ctx.matchValue('DATA');
      ctx.matchValue('BY');

      const value = parseOperand(ctx);
      stmt.replacing.push({ category, value });
    }
  }

  return stmt;
}

function parseSetStatement(ctx) {
  ctx.advance(); // Skip SET

  const stmt = new SetStatement();

  // Parse targets
  while (isIdentifierOperand(ctx)) {
    stmt.targets.push(parseVariableReference(ctx));
    if (ctx.checkValue('TO') || ctx.checkValue('UP') || ctx.checkValue('DOWN')) break;
  }

  if (ctx.matchValue('TO')) {
    stmt.setType = 'value';
    if (ctx.matchValue('TRUE')) {
      stmt.value = { type: 'TRUE' };
    } else if (ctx.matchValue('FALSE')) {
      stmt.value = { type: 'FALSE' };
    } else {
      stmt.value = parseOperand(ctx);
    }
  } else if (ctx.matchValue('UP')) {
    stmt.setType = 'index';
    ctx.matchValue('BY');
    stmt.upDown = 'UP';
    stmt.value = parseOperand(ctx);
  } else if (ctx.matchValue('DOWN')) {
    stmt.setType = 'index';
    ctx.matchValue('BY');
    stmt.upDown = 'DOWN';
    stmt.value = parseOperand(ctx);
  }

  return stmt;
}

function parseAcceptStatement(ctx) {
  ctx.advance(); // Skip ACCEPT

  const stmt = new AcceptStatement();
  stmt.target = parseVariableReference(ctx);

  if (ctx.matchValue('FROM')) {
    if (ctx.matchValue('DATE')) {
      stmt.from = 'DATE';
    } else if (ctx.matchValue('TIME')) {
      stmt.from = 'TIME';
    } else if (ctx.matchValue('DAY')) {
      stmt.from = 'DAY';
    } else if (ctx.matchValue('DAY-OF-WEEK')) {
      stmt.from = 'DAY-OF-WEEK';
    } else if (ctx.check(TokenType.IDENTIFIER)) {
      stmt.from = ctx.advance().value;
    }
  }

  return stmt;
}

function parseDisplayStatement(ctx) {
  ctx.advance(); // Skip DISPLAY

  const stmt = new DisplayStatement();

  // Parse values to display
  while (!ctx.isAtEnd()) {
    if (ctx.checkValue('UPON') || ctx.checkValue('WITH') ||
        ctx.checkValue('NO') || ctx.check(TokenType.PERIOD)) break;
    // Don't swallow the next statement's verb as a bogus DISPLAY operand
    // when there's no period between them (e.g. a DISPLAY as the last
    // statement in a WHEN/AT END block, immediately followed by END-SEARCH).
    if (ctx.check(TokenType.IDENTIFIER) && !isIdentifierOperand(ctx)) break;

    const value = parseOperand(ctx);
    if (value) {
      stmt.values.push(value);
    } else {
      break;
    }
  }

  // Parse UPON
  if (ctx.matchValue('UPON')) {
    if (ctx.check(TokenType.IDENTIFIER)) {
      stmt.upon = ctx.advance().value;
    }
  }

  // Parse WITH NO ADVANCING
  if (ctx.matchValue('WITH')) {
    ctx.matchValue('NO');
    ctx.matchValue('ADVANCING');
    stmt.noAdvancing = true;
  } else if (ctx.matchValue('NO')) {
    ctx.matchValue('ADVANCING');
    stmt.noAdvancing = true;
  }

  return stmt;
}

/**
 * Parse an unrecognized statement: capture its tokens verbatim, up to a
 * safe boundary (a period, a recognized statement-start keyword, one of
 * the caller's own block terminators, a paragraph/section name, or EOF),
 * as an UnknownStatement node. This replaces two previous failure modes:
 * silently dropping the tokens (old top-level fallback) and aborting the
 * rest of the enclosing block the moment an unsupported verb was seen
 * (old parseStatementBlock fallback - see tests/corpus/README.md finding
 * #3, where an unimplemented RETURN inside an inline PERFORM truncated
 * everything after it).
 */
function parseUnknownStatement(ctx, terminators = []) {
  const startToken = ctx.current();
  const keyword = startToken ? startToken.value : '';
  const tokens = [];

  // Always make forward progress by consuming at least the offending token.
  tokens.push(ctx.advance().value);

  while (!ctx.isAtEnd()) {
    if (ctx.check(TokenType.PERIOD)) break;
    if (isParagraphName(ctx)) break;

    const value = ctx.current().value?.toUpperCase();
    if (terminators.some((term) => term.toUpperCase() === value)) break;
    if (STATEMENT_KEYWORDS.has(value)) break;

    tokens.push(ctx.advance().value);
  }

  return new UnknownStatement({ keyword, tokens });
}

/**
 * Parse a block of statements until terminator keywords
 */
function parseStatementBlock(ctx, terminators) {
  const statements = [];

  while (!ctx.isAtEnd()) {
    // Check for terminators
    for (const term of terminators) {
      if (ctx.checkValue(term)) {
        return statements;
      }
    }

    // Check for period (end of sentence)
    if (ctx.check(TokenType.PERIOD)) {
      ctx.advance();
      continue;
    }

    // Parse statement
    const stmt = parseStatement(ctx);
    if (stmt) {
      statements.push(stmt);
    } else {
      // Unrecognized verb: capture it as an UnknownStatement instead of
      // dropping its tokens or truncating the rest of this block.
      statements.push(parseUnknownStatement(ctx, terminators));
    }
  }

  return statements;
}

/**
 * Parse a single statement
 */
function parseStatement(ctx) {
  const current = ctx.current();
  if (!current) return null;

  const keyword = current.value?.toUpperCase();

  switch (keyword) {
    case 'PERFORM': return parsePerformStatement(ctx);
    case 'IF': return parseIfStatement(ctx);
    case 'EVALUATE': return parseEvaluateStatement(ctx);
    case 'MOVE': return parseMoveStatement(ctx);
    case 'COMPUTE': return parseComputeStatement(ctx);
    case 'ADD': return parseAddStatement(ctx);
    case 'SUBTRACT': return parseSubtractStatement(ctx);
    case 'MULTIPLY': return parseMultiplyStatement(ctx);
    case 'DIVIDE': return parseDivideStatement(ctx);
    case 'STRING': return parseStringStatement(ctx);
    case 'UNSTRING': return parseUnstringStatement(ctx);
    case 'INSPECT': return parseInspectStatement(ctx);
    case 'CALL': return parseCallStatement(ctx);
    case 'SEARCH': return parseSearchStatement(ctx);
    case 'SORT': return parseSortStatement(ctx);
    case 'MERGE': return parseMergeStatement(ctx);
    case 'RELEASE': return parseReleaseStatement(ctx);
    case 'RETURN': return parseReturnStatement(ctx);
    case 'OPEN': return parseOpenStatement(ctx);
    case 'CLOSE': return parseCloseStatement(ctx);
    case 'READ': return parseReadStatement(ctx);
    case 'WRITE': return parseWriteStatement(ctx);
    case 'REWRITE': return parseRewriteStatement(ctx);
    case 'DELETE': return parseDeleteStatement(ctx);
    case 'START': return parseStartStatement(ctx);
    case 'GO': return parseGoToStatement(ctx);
    case 'STOP': return parseStopStatement(ctx);
    case 'GOBACK': return parseGobackStatement(ctx);
    case 'EXIT': return parseExitStatement(ctx);
    case 'CONTINUE':
      ctx.advance();
      return new ContinueStatement();
    case 'NEXT':
      ctx.advance();
      ctx.matchValue('SENTENCE');
      return new NextSentenceStatement();
    case 'INITIALIZE': return parseInitializeStatement(ctx);
    case 'SET': return parseSetStatement(ctx);
    case 'ACCEPT': return parseAcceptStatement(ctx);
    case 'DISPLAY': return parseDisplayStatement(ctx);
    case 'EXEC': return parseExecStatement(ctx);
    default:
      return null;
  }
}

/**
 * Parse EXEC SQL/CICS statement
 */
function parseExecStatement(ctx) {
  ctx.advance(); // Skip EXEC

  const execType = ctx.current()?.value?.toUpperCase();
  ctx.advance(); // Skip SQL/CICS

  // Collect all tokens until END-EXEC
  const content = [];
  while (!ctx.isAtEnd() && !ctx.checkValue('END-EXEC')) {
    content.push(ctx.advance().value);
  }
  ctx.matchValue('END-EXEC');

  // Return a simple statement representing the EXEC block
  return {
    type: 'EXEC',
    execType,
    content: content.join(' '),
  };
}

/**
 * Parse PROCEDURE DIVISION
 */
export function parseProcedureDivision(tokens) {
  const ctx = new ParserContext(tokens);
  const division = new ProcedureDivision();

  // Find PROCEDURE DIVISION
  while (!ctx.isAtEnd()) {
    if (ctx.checkValue('PROCEDURE') && ctx.peek(1)?.value?.toUpperCase() === 'DIVISION') {
      ctx.advance(); // PROCEDURE
      ctx.advance(); // DIVISION
      break;
    }
    ctx.advance();
  }

  // Parse USING clause
  if (ctx.matchValue('USING')) {
    while (ctx.check(TokenType.IDENTIFIER)) {
      division.using.push(ctx.advance().value);
    }
  }

  // Parse RETURNING clause
  if (ctx.matchValue('RETURNING')) {
    if (ctx.check(TokenType.IDENTIFIER)) {
      division.returning = ctx.advance().value;
    }
  }

  // Skip period
  ctx.skipPeriod();

  // Parse sections and paragraphs
  let currentSection = null;
  let currentParagraph = null;

  while (!ctx.isAtEnd()) {
    // Skip periods
    if (ctx.check(TokenType.PERIOD)) {
      ctx.advance();
      continue;
    }

    // Check for paragraph or section name
    if (isParagraphName(ctx)) {
      const name = ctx.advance().value;

      // Check if it's a SECTION
      if (ctx.checkValue('SECTION')) {
        ctx.advance();
        ctx.skipPeriod();

        currentSection = new Procedure({
          name,
          procedureType: 'section',
        });
        division.sections.push(currentSection);
        currentParagraph = null;
        continue;
      }

      // It's a paragraph
      ctx.skipPeriod();

      currentParagraph = new Procedure({
        name,
        procedureType: 'paragraph',
      });

      if (currentSection) {
        currentSection.paragraphs.push(currentParagraph);
      } else {
        division.paragraphs.push(currentParagraph);
      }
      continue;
    }

    // Parse statement
    const stmt = parseStatement(ctx);
    if (stmt) {
      if (currentParagraph) {
        currentParagraph.statements.push(stmt);
      } else if (currentSection) {
        // Statement directly in section (before any paragraph)
        currentSection.statements.push(stmt);
      }
    } else if (!ctx.isAtEnd()) {
      // Unrecognized verb: capture it as an UnknownStatement (instead of
      // silently discarding one token at a time) so it is visible in the
      // AST rather than vanishing without a trace.
      const unknown = parseUnknownStatement(ctx, []);
      if (currentParagraph) {
        currentParagraph.statements.push(unknown);
      } else if (currentSection) {
        currentSection.statements.push(unknown);
      }
    }
  }

  return division;
}

export {
  ParserContext,
  parseStatement,
  parseCondition,
  parseArithmeticExpression,
  parseVariableReference,
  parseOperand,
};

export default {
  parseProcedureDivision,
  parseStatement,
  parseCondition,
  parseArithmeticExpression,
  parseVariableReference,
  parseOperand,
  ParserContext,
};
