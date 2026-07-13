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
    // Tracks the nearest preceding relation-condition's {subject, operator}
    // within the current AND/OR chain, for abbreviated combined relation
    // condition support (`A = 1 OR 2`, `A > 1 AND < 5`) - see
    // parseAbbreviatedRelationTerm/parseCondition's save/restore.
    this.lastRelation = null;
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
 * Verb-like reserved words that real GnuCOBOL still accepts as a paragraph/
 * section name, but ONLY in the one truly unambiguous position: the very
 * FIRST paragraph/section of a PROCEDURE DIVISION (or of a DECLARATIVES
 * prologue) - i.e. before any other paragraph or section has been
 * established there at all (round-20 finding 1, `isParagraphName`'s
 * `allowReservedWord` callers below). Confirmed against installed GnuCOBOL:
 * `i05-reserved-paragraph-name.cbl` - a PROCEDURE DIVISION consisting of
 * exactly one, implicitly-entered paragraph named EXIT - compiles and runs
 * fine, printing every statement in that paragraph's body (cobc does NOT
 * treat it as a bare EXIT statement there). This is deliberately NOT a
 * blanket "reserved word immediately after any period is a name" rule: the
 * far more common idiom `SOME-EXIT. EXIT.` (a bare EXIT/CONTINUE used as an
 * ordinary no-op statement, usually as a PERFORM-THRU range's own end
 * marker - see aa01/i08/p14/x12 in this corpus) has EXACTLY the same
 * "reserved-word-token then period, nothing else" shape, and MUST keep
 * parsing as the statement, not a second, newly-declared paragraph named
 * EXIT/CONTINUE (which would silently split that paragraph in two and,
 * worse, collide by name if more than one paragraph in the same program
 * uses the idiom). The narrow "nothing established yet" guard is exactly
 * what tells these two identical-looking shapes apart: it is only ever true
 * once, at the very start of a division/prologue's own paragraph-search
 * loop, never once a real paragraph/section is already open and a
 * statement is expected inside it.
 */
const PARAGRAPH_NAME_RESERVED_WORDS = new Set(['EXIT', 'CONTINUE']);

/**
 * Check if current token could be a paragraph/section name.
 *
 * `opts.allowReservedWord`, when true, additionally accepts one of
 * PARAGRAPH_NAME_RESERVED_WORDS in the IDENTIFIER token's place - callers
 * must only ever pass true from the narrow "nothing established yet"
 * position described above (see its callers in parseDeclaratives/
 * parseProcedureDivision) so an ordinary mid-body EXIT/CONTINUE statement
 * is never affected.
 */
function isParagraphName(ctx, opts = {}) {
  const isReservedNameCandidate = opts.allowReservedWord &&
    PARAGRAPH_NAME_RESERVED_WORDS.has(ctx.current()?.value?.toUpperCase());

  if (!ctx.check(TokenType.IDENTIFIER) && !isReservedNameCandidate) return false;

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
  // This first parenthesized group is EITHER a subscript list OR reference
  // modification (start:length) - both share the identical `(` lookahead,
  // and only diverge once a `:` shows up right after the first expression
  // (a subscript list is comma-separated arithmetic expressions; a bare `:`
  // can never appear inside one). The previous implementation parsed this
  // group as subscripts unconditionally: `WS-FIELD(3:5)` got the `3` parsed
  // and consumed as a lone subscript (via parseArithmeticExpression, which
  // stops right before the `:` it doesn't recognize), left the cursor
  // sitting on `:5)` since neither the subscript loop nor the *separate*
  // refMod block below (which only ever ran when *this* first `(...)` was
  // untouched) expected a dangling `:` there, and silently corrupted every
  // token read after it for the rest of the statement - refMod was never
  // actually reachable through a bare `identifier(start:length)` reference
  // at all. Detecting the `:` here - reusing the very expression already
  // parsed as the refMod start, rather than a bare literal/identifier only
  // (COBOL allows any arithmetic expression in either refMod slot, e.g.
  // `WS-FIELD(WS-START:WS-LEN)`) - fixes both the corruption and the
  // previous start/length TODO of "just a literal or identifier".
  if (ctx.check(TokenType.OP_LPAREN)) {
    ctx.advance();
    let sawRefMod = false;
    while (!ctx.isAtEnd() && !ctx.check(TokenType.OP_RPAREN)) {
      if (ctx.check(TokenType.COMMA)) {
        ctx.advance();
        continue;
      }
      const sub = parseArithmeticExpression(ctx);
      if (ctx.check(TokenType.OP_COLON)) {
        ctx.advance();
        const length = ctx.check(TokenType.OP_RPAREN) ? null : parseArithmeticExpression(ctx);
        ref.refMod = { start: sub, length };
        sawRefMod = true;
        break;
      }
      if (sub) {
        ref.subscripts.push(sub);
      } else {
        break;
      }
    }
    ctx.match(TokenType.OP_RPAREN);

    // A subscripted table element can *also* carry its own reference
    // modification in a second, separate parenthesized group immediately
    // after the subscript list, e.g. `WS-TABLE(WS-I)(WS-START:WS-LEN)`.
    if (!sawRefMod && ctx.check(TokenType.OP_LPAREN)) {
      ctx.advance();
      const start = ctx.check(TokenType.OP_RPAREN) ? null : parseArithmeticExpression(ctx);
      let length = null;
      if (ctx.check(TokenType.OP_COLON)) {
        ctx.advance();
        length = ctx.check(TokenType.OP_RPAREN) ? null : parseArithmeticExpression(ctx);
      }
      ctx.match(TokenType.OP_RPAREN);
      ref.refMod = { start, length };
    }
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
 * Parse a condition expression.
 *
 * Isolates ctx.lastRelation (the abbreviated-combined-relation chain state -
 * see parseNotCondition/isAbbreviatedRelationContinuation) to exactly this
 * condition's own scope: reset to null on entry (a fresh chain starts here,
 * regardless of whatever an *enclosing* condition's chain state was - this
 * matters because parsePrimaryCondition's parenthesized-condition branch
 * recurses back into parseCondition for the inner group, which must not
 * inherit the outer group's dangling relation state) and restored on exit
 * (so a parenthesized sub-condition's chain never leaks back out either -
 * COBOL's abbreviation never reaches across a `(...)` boundary in either
 * direction).
 */
function parseCondition(ctx) {
  const savedLastRelation = ctx.lastRelation;
  ctx.lastRelation = null;
  const result = parseOrCondition(ctx);
  ctx.lastRelation = savedLastRelation;
  return result;
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

/**
 * True when the tokens right here (immediately after an AND/OR and an
 * optional NOT) can only be the continuation object of an *abbreviated
 * combined relation condition* (`A = 1 OR 2`, `A > 1 AND < 5`) - never the
 * start of a brand new, independent combinable-condition - so
 * parseNotCondition knows to reuse ctx.lastRelation's carried subject
 * (always) and operator (unless a new one is given right here) instead of
 * calling parsePrimaryCondition. Per the COBOL abbreviation grammar:
 *   - a relational-operator token here unambiguously means "elided subject,
 *     explicit new operator" - no COBOL condition can otherwise *start* with
 *     a bare relational operator.
 *   - a literal / figurative constant / FUNCTION call here unambiguously
 *     means "elided subject AND operator" - none of those can themselves
 *     start a standalone condition (only an IDENTIFIER-led class/sign/
 *     condition-name/relation condition, or a parenthesized one, can).
 *   - an IDENTIFIER or `(` here is deliberately left to the normal,
 *     non-abbreviated path: it might be a level-88 condition-name
 *     conjunction (`A = 1 AND WS-FLAG-DONE`, a genuine second condition) or
 *     the start of a brand new full relation condition (`A > 1 AND B < 2`);
 *     telling those apart from an elided-subject continuation needs the data
 *     dictionary (is the identifier a registered condition-name?), which
 *     isn't available at parse time - CONDITION_REGISTRY is only built later,
 *     from the Data Division (see generator/expression-gen.js) - so this
 *     parser conservatively always treats a bare IDENTIFIER/`(` as starting
 *     its own new combinable-condition, matching how abbreviation is
 *     actually written in practice (with literals/bare operators, not bare
 *     condition-name identifiers immediately after AND/OR).
 */
/**
 * True when the current token can only start a literal / figurative-constant
 * / FUNCTION-call operand - never an IDENTIFIER, never a fresh class/sign/
 * condition-name test (none of those apply to a non-identifier operand).
 * Shared by isAbbreviatedRelationContinuation's tail check and
 * parsePrimaryCondition's non-identifier-subject relational condition
 * (round-4 finding 1's `IF HIGH-VALUES > LOW-VALUES` case: COBOL's relational
 * operand is a full arithmetic-expression, which may legally be just a
 * literal/figurative constant with no identifier at all).
 */
function isLiteralOrFigurativeOrFunctionStart(ctx) {
  return (
    ctx.check(TokenType.STRING_LITERAL) || ctx.check(TokenType.NUMERIC_LITERAL) ||
    ['ZERO', 'ZEROS', 'ZEROES', 'SPACE', 'SPACES', 'HIGH-VALUE', 'HIGH-VALUES',
     'LOW-VALUE', 'LOW-VALUES', 'QUOTE', 'QUOTES', 'FUNCTION'].some(v => ctx.checkValue(v))
  );
}

function isAbbreviatedRelationContinuation(ctx) {
  if (
    ctx.check(TokenType.OP_EQUAL) || ctx.check(TokenType.OP_GREATER) || ctx.check(TokenType.OP_LESS) ||
    ctx.check(TokenType.OP_GREATER_EQUAL) || ctx.check(TokenType.OP_LESS_EQUAL) || ctx.check(TokenType.OP_NOT_EQUAL)
  ) {
    return true;
  }
  if (['EQUAL', 'EQUALS', 'GREATER', 'LESS'].some(v => ctx.checkValue(v))) return true;
  if (ctx.check(TokenType.IDENTIFIER) || ctx.check(TokenType.OP_LPAREN)) return false;
  return isLiteralOrFigurativeOrFunctionStart(ctx);
}

function parseNotCondition(ctx) {
  let negated = false;
  if (ctx.matchValue('NOT')) {
    negated = true;
  }

  // Abbreviated combined relation condition continuation - see
  // isAbbreviatedRelationContinuation's doc comment. Only reachable when a
  // relation-condition earlier in this same AND/OR chain left its
  // {subject, operator} in ctx.lastRelation (set by parsePrimaryCondition).
  if (ctx.lastRelation && isAbbreviatedRelationContinuation(ctx)) {
    const chain = ctx.lastRelation;
    const explicitOperator = matchRelationalOperator(ctx, false);
    const operator = explicitOperator || chain.operator;
    const object = parseEvaluateValue(ctx);
    const condition = new RelationalCondition({ subject: chain.subject, relationalOperator: operator, object });
    if (negated) condition.negated = true;
    ctx.lastRelation = { subject: chain.subject, operator };
    return condition;
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

/**
 * Match a relational operator token (symbolic: =, >, <, >=, <=, <>; or word
 * form: EQUAL [TO], GREATER [THAN [OR EQUAL [TO]]], LESS [THAN [OR EQUAL
 * [TO]]]), returning the operator text to use (already flipped if `notMod` -
 * an already-consumed leading "IS NOT" - applies), or null if the current
 * token isn't a relational operator at all (cursor left untouched). Shared by
 * parsePrimaryCondition (IF/PERFORM UNTIL/WHILE conditions) and
 * parseEvaluateObject (EVALUATE TRUE/FALSE WHEN <condition> - see its doc
 * comment) so both recognize the exact same operator grammar.
 */
function matchRelationalOperator(ctx, notMod) {
  if (ctx.check(TokenType.OP_EQUAL) || ctx.matchValue('EQUAL', 'EQUALS')) {
    ctx.match(TokenType.OP_EQUAL);
    ctx.matchValue('TO');
    return notMod ? '<>' : '=';
  }
  if (ctx.check(TokenType.OP_GREATER) || ctx.matchValue('GREATER')) {
    ctx.match(TokenType.OP_GREATER);
    ctx.matchValue('THAN');
    if (ctx.matchValue('OR')) {
      ctx.matchValue('EQUAL');
      ctx.matchValue('TO');
      return notMod ? '<' : '>=';
    }
    return notMod ? '<=' : '>';
  }
  if (ctx.check(TokenType.OP_LESS) || ctx.matchValue('LESS')) {
    ctx.match(TokenType.OP_LESS);
    ctx.matchValue('THAN');
    if (ctx.matchValue('OR')) {
      ctx.matchValue('EQUAL');
      ctx.matchValue('TO');
      return notMod ? '>' : '<=';
    }
    return notMod ? '>=' : '<';
  }
  if (ctx.check(TokenType.OP_GREATER_EQUAL)) {
    ctx.advance();
    return notMod ? '<' : '>=';
  }
  if (ctx.check(TokenType.OP_LESS_EQUAL)) {
    ctx.advance();
    return notMod ? '>' : '<=';
  }
  if (ctx.check(TokenType.OP_NOT_EQUAL)) {
    ctx.advance();
    return notMod ? '=' : '<>';
  }
  return null;
}

function parsePrimaryCondition(ctx) {
  // Parenthesized condition - always terminates any abbreviated-relation
  // chain from an enclosing AND/OR (COBOL abbreviation never reaches across
  // a `(...)` boundary): parseCondition itself isolates the *inner* group's
  // chain state, but the outer chain must also not treat this whole
  // parenthesized (possibly compound) condition as a fresh relation to
  // abbreviate from afterwards.
  if (ctx.check(TokenType.OP_LPAREN)) {
    ctx.advance();
    const cond = parseCondition(ctx);
    ctx.match(TokenType.OP_RPAREN);
    ctx.lastRelation = null;
    return cond;
  }

  // Class condition
  if (ctx.check(TokenType.IDENTIFIER)) {
    // The condition's subject is a full arithmetic expression, not just a
    // single term - COBOL allows e.g. `IF WS-A * WS-B > WS-C` - so this uses
    // parseEvaluateValue (parseOperand plus any following arithmetic
    // continuation) rather than a bare parseOperand, which silently
    // truncated the subject to just its first operand. An IDENTIFIER
    // followed immediately by an arithmetic operator can only be an
    // expression subject here (no COBOL class/sign/condition-name test ever
    // has one), so reusing the same "leading operand + arithmetic
    // continuation" parser EVALUATE subjects/objects already use is exactly
    // right for every condition shape below, not just the relational one.
    const subject = parseEvaluateValue(ctx);

    // Check for IS [NOT]
    ctx.matchValue('IS');
    const notMod = ctx.matchValue('NOT');

    // Class test
    if (ctx.matchValue('NUMERIC')) {
      ctx.lastRelation = null;
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'NUMERIC',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ALPHABETIC')) {
      ctx.lastRelation = null;
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'ALPHABETIC',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ALPHABETIC-LOWER')) {
      ctx.lastRelation = null;
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'ALPHABETIC-LOWER',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ALPHABETIC-UPPER')) {
      ctx.lastRelation = null;
      return makeCondition({
        conditionType: 'class',
        subject,
        classType: 'ALPHABETIC-UPPER',
        negated: notMod,
      });
    }

    // Sign test
    if (ctx.matchValue('POSITIVE')) {
      ctx.lastRelation = null;
      return makeCondition({
        conditionType: 'sign',
        subject,
        signType: 'POSITIVE',
        negated: notMod,
      });
    }
    if (ctx.matchValue('NEGATIVE')) {
      ctx.lastRelation = null;
      return makeCondition({
        conditionType: 'sign',
        subject,
        signType: 'NEGATIVE',
        negated: notMod,
      });
    }
    if (ctx.matchValue('ZERO', 'ZEROS', 'ZEROES')) {
      ctx.lastRelation = null;
      return makeCondition({
        conditionType: 'sign',
        subject,
        signType: 'ZERO',
        negated: notMod,
      });
    }

    // Relational condition
    const operator = matchRelationalOperator(ctx, notMod);

    if (operator) {
      // The object is likewise a full expression (`IF WS-A > WS-B + 1`),
      // and may itself be a literal/figurative constant/FUNCTION call -
      // parseEvaluateValue handles all of those exactly like parseOperand
      // did, plus the arithmetic continuation.
      const object = parseEvaluateValue(ctx);
      // Record this relation for abbreviated combined relation condition
      // support (`A > 1 AND < 5` / `A = 1 OR 2`) - see
      // isAbbreviatedRelationContinuation/parseNotCondition.
      ctx.lastRelation = { subject, operator };
      return new RelationalCondition({
        subject,
        relationalOperator: operator,
        object,
      });
    }

    // Condition name (88 level)
    ctx.lastRelation = null;
    return makeCondition({
      conditionType: 'simple',
      subject,
    });
  }

  // Relational condition whose subject is itself a literal/figurative
  // constant/FUNCTION call, with no identifier at all - e.g.
  // `IF HIGH-VALUES > LOW-VALUES`. Class/sign/condition-name tests never
  // apply to a non-identifier subject, so this only ever attempts the
  // relational form; if no relational operator follows, this isn't a
  // supported condition shape (falls through to the `return null` below,
  // same as before this fix, rather than guessing).
  if (isLiteralOrFigurativeOrFunctionStart(ctx)) {
    const subject = parseEvaluateValue(ctx);
    ctx.matchValue('IS');
    const notMod = ctx.matchValue('NOT');
    const operator = matchRelationalOperator(ctx, notMod);
    if (operator) {
      const object = parseEvaluateValue(ctx);
      ctx.lastRelation = { subject, operator };
      return new RelationalCondition({
        subject,
        relationalOperator: operator,
        object,
      });
    }
    ctx.lastRelation = null;
    return null;
  }

  ctx.lastRelation = null;
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

    // OF/IN qualifier disambiguating a bare paragraph name that collides
    // across sections (round-12 bonus finding, z12: `PERFORM PARA-ONE OF
    // SECTION-B`) - real COBOL requires this qualification whenever the
    // bare name would otherwise be ambiguous. Previously not consumed at
    // all: the OF/IN token and the section name after it fell straight
    // through every remaining clause check below (none of which recognize
    // OF/IN either) completely unconsumed, corrupting the rest of the
    // PROCEDURE DIVISION parse - see generator/method-gen.js's
    // generatePerformFromAST/generator/expression-gen.js's generatePerform
    // for how targetSection now routes to the collision-aware
    // resolveParagraphMethodName instead of a plain unqualified method name.
    if (ctx.matchValue('OF', 'IN')) {
      if (ctx.check(TokenType.IDENTIFIER)) {
        stmt.targetSection = ctx.advance().value;
      }
    }

    if (ctx.matchValue('THRU', 'THROUGH')) {
      if (ctx.check(TokenType.IDENTIFIER)) {
        stmt.throughParagraph = ctx.advance().value;

        if (ctx.matchValue('OF', 'IN')) {
          if (ctx.check(TokenType.IDENTIFIER)) {
            stmt.throughSection = ctx.advance().value;
          }
        }
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
 * Parse an EVALUATE subject or WHEN-object's leading value: like parseOperand
 * (preserving its string/figurative-constant/FUNCTION/ALL support), but also
 * consumes a following arithmetic continuation (`WS-A + WS-B`, `WS-TOTAL -
 * 1`, ...) so a full arithmetic-expression subject/object isn't silently
 * truncated to just its first operand - see parseEvaluateStatement's doc
 * comment.
 */
function parseEvaluateValue(ctx) {
  let left = parseOperand(ctx);
  while (
    ctx.check(TokenType.OP_PLUS) || ctx.check(TokenType.OP_MINUS) ||
    ctx.check(TokenType.OP_MULTIPLY) || ctx.check(TokenType.OP_DIVIDE) ||
    ctx.check(TokenType.OP_POWER)
  ) {
    const operator = ctx.advance().value;
    const right = parseOperand(ctx);
    left = new ArithmeticExpression({ operator, left, right });
  }
  return left;
}

/**
 * Parse one EVALUATE WHEN-clause object (COBOL's "evaluate-object"):
 *   ANY | TRUE | FALSE
 *   | [NOT] condition-1                      (relational/class/sign/88-name)
 *   | [NOT] value [THRU value]
 *
 * The COBOL general format only allows a bare condition-1 (as opposed to a
 * plain value/range) when the *paired* evaluate-subject is TRUE or FALSE -
 * `EVALUATE TRUE WHEN WS-A > WS-B` / `WHEN WS-X IS NUMERIC` is the idiomatic
 * replacement for an IF/ELSE-IF chain - but this parser doesn't thread the
 * paired subject's shape down into here (and permissively recognizes the
 * condition-1 grammar regardless); evaluateConditionExpr (expression-gen.js)
 * is what actually applies TRUE/FALSE-subject semantics to whichever shape
 * comes back. Returns one of the `whenClause.conditions[]` shapes
 * expression-gen.js's evaluateConditionExpr switches on: `{type: 'ANY'|
 * 'TRUE'|'FALSE'}`, `{type: 'RELATION', operator, left, right}`,
 * `{type: 'CLASS'|'SIGN', ..., subject, negated}`, `{type: 'RANGE'|
 * 'NOT-RANGE', from, to}`, or `{type: 'VALUE'|'NOT', value}`.
 */
function parseEvaluateObject(ctx) {
  if (ctx.matchValue('ANY')) return { type: 'ANY' };
  if (ctx.matchValue('TRUE')) return { type: 'TRUE' };
  if (ctx.matchValue('FALSE')) return { type: 'FALSE' };

  const negated = ctx.matchValue('NOT');
  const value = parseEvaluateValue(ctx);

  if (ctx.matchValue('IS')) {
    const classNot = ctx.matchValue('NOT') || negated;
    if (ctx.matchValue('NUMERIC')) {
      return { type: 'CLASS', classType: 'NUMERIC', subject: value, negated: classNot };
    }
    if (ctx.matchValue('ALPHABETIC-LOWER')) {
      return { type: 'CLASS', classType: 'ALPHABETIC-LOWER', subject: value, negated: classNot };
    }
    if (ctx.matchValue('ALPHABETIC-UPPER')) {
      return { type: 'CLASS', classType: 'ALPHABETIC-UPPER', subject: value, negated: classNot };
    }
    if (ctx.matchValue('ALPHABETIC')) {
      return { type: 'CLASS', classType: 'ALPHABETIC', subject: value, negated: classNot };
    }
    if (ctx.matchValue('POSITIVE')) {
      return { type: 'SIGN', signType: 'POSITIVE', subject: value, negated: classNot };
    }
    if (ctx.matchValue('NEGATIVE')) {
      return { type: 'SIGN', signType: 'NEGATIVE', subject: value, negated: classNot };
    }
    if (ctx.matchValue('ZERO', 'ZEROS', 'ZEROES')) {
      return { type: 'SIGN', signType: 'ZERO', subject: value, negated: classNot };
    }
    // Not actually a recognized IS-clause (shouldn't happen with valid
    // COBOL) - fall through and treat what was parsed as a plain value.
    return negated ? { type: 'NOT', value } : { type: 'VALUE', value };
  }

  const operator = matchRelationalOperator(ctx, false);
  if (operator) {
    const object = parseEvaluateValue(ctx);
    return { type: 'RELATION', operator, left: value, right: object, negated };
  }

  if (ctx.matchValue('THRU', 'THROUGH')) {
    const endValue = parseEvaluateValue(ctx);
    return negated ? { type: 'NOT-RANGE', from: value, to: endValue } : { type: 'RANGE', from: value, to: endValue };
  }

  return negated ? { type: 'NOT', value } : { type: 'VALUE', value };
}

/**
 * Parse EVALUATE statement
 */
function parseEvaluateStatement(ctx) {
  ctx.advance(); // Skip EVALUATE

  const stmt = new EvaluateStatement();

  // Parse subjects (what we're evaluating). COBOL's general format allows
  // any arithmetic-expression here, not just a bare identifier/literal (e.g.
  // `EVALUATE WS-A + WS-B`) - parseEvaluateValue (below) parses a leading
  // operand and folds in any following arithmetic operator/operand pairs, so
  // the `+ WS-B` part isn't silently dropped (which previously left the
  // parser cursor sitting mid-expression, and everything from there through
  // the rest of the EVALUATE - every WHEN clause's own keywords included -
  // got swallowed as unrecognized statement fragments instead of ever
  // becoming part of this EvaluateStatement at all).
  do {
    if (ctx.matchValue('TRUE')) {
      stmt.subjects.push({ type: 'TRUE' });
    } else if (ctx.matchValue('FALSE')) {
      stmt.subjects.push({ type: 'FALSE' });
    } else {
      const subject = parseEvaluateValue(ctx);
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
      whenClause.conditions.push(parseEvaluateObject(ctx));
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

  // Parse targets: `COMPUTE A B ROUNDED C = expr` supports multiple targets,
  // each with its OWN optional trailing ROUNDED (round-10 finding 6) - the
  // `while (ctx.check(TokenType.IDENTIFIER))` condition alone already stops
  // correctly the moment the next token is `=` (not an IDENTIFIER), so
  // nothing else is needed to keep collecting every target ahead of it; a
  // stray `if (!ctx.check(TokenType.OP_EQUAL)) break;` here used to abort the
  // loop after the very FIRST target (since the second target's own name is
  // itself an IDENTIFIER, not `=`), silently discarding every target after
  // the first - see this function's own AST-level fix: ROUNDED is stashed on
  // the individual target's own VariableReference node (`target.rounded`),
  // not just a single statement-wide flag, so `COMPUTE A B ROUNDED C = ...`
  // rounds only B, truncating A and C, exactly like real COBOL.
  while (ctx.check(TokenType.IDENTIFIER)) {
    const target = parseVariableReference(ctx);
    if (!target) break;
    if (ctx.matchValue('ROUNDED')) {
      target.rounded = true;
      stmt.rounded = true; // true when ANY target was ROUNDED (back-compat)
    }
    stmt.targets.push(target);
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
    // round-10 finding 5: `ADD CORRESPONDING a TO b ROUNDED` never consumed
    // its own trailing ROUNDED at all - the unconsumed token then leaked out
    // as a bogus standalone UnknownStatement, and generateAddCorresponding
    // always truncated (never rounded) regardless. ROUNDED has no per-target
    // form here (CORRESPONDING has exactly one implicit target group), so a
    // single statement-level flag is enough - see generateAddCorresponding's
    // now-honored storeNumericByInfo call.
    if (ctx.matchValue('ROUNDED')) {
      stmt.rounded = true;
    }
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
    // round-10 finding 5 (same audit applied to SUBTRACT CORRESPONDING).
    if (ctx.matchValue('ROUNDED')) {
      stmt.rounded = true;
    }
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

  // Parse DELIMITED BY. Each delimiter is recorded as { node, all } - `all`
  // is true when this specific delimiter (DELIMITED BY [ALL] id-1 [OR [ALL]
  // id-2 ...] - each OR'd alternative has its own optional ALL) was written
  // with the ALL keyword, so codegen can collapse consecutive occurrences of
  // *that* delimiter into a single logical one (round-4 finding 11) instead
  // of silently discarding the flag the way a bare `ctx.matchValue('ALL')`
  // (previously unassigned) did.
  if (ctx.matchValue('DELIMITED')) {
    ctx.matchValue('BY');
    let all = !!ctx.matchValue('ALL');
    stmt.delimiters.push({ node: parseOperand(ctx), all });

    while (ctx.matchValue('OR')) {
      all = !!ctx.matchValue('ALL');
      stmt.delimiters.push({ node: parseOperand(ctx), all });
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

  // Parse ON OVERFLOW / NOT ON OVERFLOW (round-6 finding 6) - mirrors
  // parseStringStatement's identical clause exactly. Previously entirely
  // unconsumed: the ON OVERFLOW/NOT ON OVERFLOW keyword and its statement
  // block were left sitting in the token stream after UNSTRING's own
  // recognized clauses ran out, so the *next* parse step (whatever follows
  // in the paragraph) tried to parse "ON OVERFLOW ... END-UNSTRING" itself
  // as a fresh, unrelated statement - corrupting the statement stream (the
  // overflow branch's body leaked out as unconditional top-level siblings,
  // and a dangling END-UNSTRING confused whatever came after).
  if (ctx.matchValue('ON')) {
    ctx.matchValue('OVERFLOW');
    stmt.onOverflow = parseStatementBlock(ctx, ['NOT', 'END-UNSTRING']);
  }

  if (ctx.matchValue('NOT')) {
    ctx.matchValue('ON');
    ctx.matchValue('OVERFLOW');
    stmt.notOnOverflow = parseStatementBlock(ctx, ['END-UNSTRING']);
  }

  ctx.matchValue('END-UNSTRING');

  return stmt;
}

/**
 * Parse an optional `BEFORE INITIAL <value>` / `AFTER INITIAL <value>` phrase
 * (round-4 finding 3) trailing one INSPECT TALLYING/REPLACING sub-clause, or
 * the whole CONVERTING clause - restricts that one operation to the portion
 * of the INSPECT target before/after the first occurrence of `<value>`,
 * leaving the rest of the target completely untouched by *that* clause (a
 * later clause in the same INSPECT statement, or a later BEFORE/AFTER region
 * with a different boundary, is unaffected and evaluated fresh). Returns
 * `{ type: 'BEFORE'|'AFTER', value }` or null when absent - see
 * generator/expression-gen.js's `generateInspect`/`applyInspectRegion`/
 * `inspectTallyScanExpr` for how this is honored at codegen time.
 */
function parseInspectRegion(ctx) {
  if (ctx.checkValue('BEFORE') || ctx.checkValue('AFTER')) {
    const type = ctx.advance().value.toUpperCase();
    ctx.matchValue('INITIAL');
    const value = parseOperand(ctx);
    return { type, value };
  }
  return null;
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
        region: null,
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
      tally.region = parseInspectRegion(ctx);
      stmt.tallying.push(tally);

      if (ctx.checkValue('REPLACING') || ctx.check(TokenType.PERIOD)) break;
    }
  }

  if (ctx.matchValue('REPLACING')) {
    stmt.inspectType = stmt.inspectType === 'tallying' ? 'tallying-replacing' : 'replacing';
    // Parse replacing clauses (simplified)
    while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
      const replace = { type: null, from: null, to: null, region: null };

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
      replace.region = parseInspectRegion(ctx);

      stmt.replacing.push(replace);
    }
  }

  if (ctx.matchValue('CONVERTING')) {
    stmt.inspectType = 'converting';
    const from = parseOperand(ctx);
    ctx.matchValue('TO');
    const to = parseOperand(ctx);
    const region = parseInspectRegion(ctx);
    stmt.converting = { from, to, region };
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
           ctx.checkValue('CONTENT') || ctx.checkValue('VALUE') ||
           ctx.check(TokenType.OMITTED) ||
           ctx.check(TokenType.COMMA)) {

      // round-7 finding 1a: `CALL "X" USING BY REFERENCE A, B, C` (commas
      // between operands - legal COBOL, and the overwhelmingly common style
      // for a multi-argument CALL) previously wasn't consumed anywhere in
      // this loop at all. The loop's own continuation condition didn't even
      // list TokenType.COMMA, so it unconditionally exited after the first
      // operand the moment it saw one - silently truncating `stmt.using` to
      // just its first parameter and leaving every token from the first
      // comma onward (", B, C.") completely unconsumed. Those leftover
      // tokens then corrupted the *rest* of the PROCEDURE DIVISION parse:
      // the very next statement/paragraph-name scan picked them up
      // mid-stream, and - since a bare identifier immediately followed by a
      // PERIOD satisfies isParagraphName's own pattern - a trailing operand
      // like "WS-SUM." could even be misdetected as a brand new paragraph
      // name, silently splitting one paragraph into two. Skipping a comma
      // and continuing (rather than treating it as an operand or a
      // terminator) fixes this without changing behavior for any
      // comma-free USING list (single-argument CALLs, unaffected either
      // way).
      if (ctx.check(TokenType.COMMA)) {
        ctx.advance();
        continue;
      }

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

      // round-12 finding 4: CALL ... USING ... OMITTED ... - a positional
      // operand explicitly not supplied (legal COBOL; common for a
      // subprogram that ignores one of its own middle LINKAGE parameters).
      // The pre-fix loop condition above didn't even recognize the OMITTED
      // token, so it silently exited the whole USING loop right here,
      // leaving OMITTED and everything after it (further operands, RETURNING,
      // the terminating period, ...) unconsumed to corrupt the rest of the
      // statement parse. Push a placeholder parameter (no value - there is
      // nothing to reference) rather than dropping the position entirely, so
      // every argument *after* it still lines up with the right callee
      // parameter slot - see generator/expression-gen.js's generateCall for
      // the codegen side (a type-correct zero/spaces default, no write-back).
      if (ctx.match(TokenType.OMITTED)) {
        stmt.using.push(new CallParameter({ mode: currentMode, value: null, omitted: true }));
        if (ctx.checkValue('RETURNING') || ctx.checkValue('ON') ||
            ctx.checkValue('NOT') || ctx.check(TokenType.PERIOD)) break;
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

  // Parse FROM. round-18 finding 2's g12 companion gap: `WRITE rec FROM
  // "literal text"` (or a numeric/figurative-constant literal) is entirely
  // legal COBOL - the literal is implicitly MOVEd into `rec` before it's
  // written, exactly like `WRITE rec FROM some-identifier` already does for
  // a variable source - but `parseVariableReference` only ever recognizes
  // an IDENTIFIER token and returns null for anything else, silently
  // dropping `stmt.from` to null AND leaving the literal's own token(s)
  // unconsumed in the stream, which the outer PROCEDURE DIVISION loop then
  // misparsed as a separate, unrelated garbage UnknownStatement immediately
  // afterward. `parseOperand` recognizes a literal (string/numeric/
  // figurative) in addition to every shape `parseVariableReference` already
  // did (it falls through to `parseVariableReference` for a plain
  // IDENTIFIER - see its own definition above), so this is a pure
  // extension, not a behavior change, for the pre-existing
  // identifier-FROM case.
  if (ctx.matchValue('FROM')) {
    stmt.from = parseOperand(ctx);
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

  // Same `FROM <literal>` companion gap as parseWriteStatement's own FROM
  // parse above (parseOperand recognizes a literal in addition to every
  // identifier shape parseVariableReference already did).
  if (ctx.matchValue('FROM')) {
    stmt.from = parseOperand(ctx);
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
 * Parse a block of statements until terminator keywords OR a period.
 *
 * COBOL rule (round-14 finding 3): a PERIOD ends the *sentence*, which
 * terminates ALL open conditional scopes at once - not just the innermost
 * one. Every caller of this function represents one such implicit scope
 * (an IF's THEN/ELSE arm, a READ's AT END/INVALID KEY arm, an EVALUATE
 * WHEN arm, ON SIZE ERROR/OVERFLOW/EXCEPTION arms, ...) that COBOL lets end
 * either explicitly (its own END-IF/END-READ/WHEN/END-EVALUATE/... keyword,
 * already in `terminators`) or implicitly via a bare period when no
 * explicit terminator is present in the source at all.
 *
 * The previous implementation treated a period as "skip and keep collecting
 * into THIS block" - so an IF with no END-IF (or a READ AT END with no
 * END-READ, etc.) silently absorbed every following statement in the
 * paragraph into its own THEN-arm/AT-END-arm, rather than ending there.
 *
 * The fix: a period is just another terminator, except it must NOT be
 * consumed here - the token is left in place so it propagates upward
 * through every nested parseStatementBlock call (each one also stops
 * without consuming it) until it reaches whichever sentence-level loop
 * owns period consumption: parseProcedureDivision's/parseDeclaratives'
 * own top-level per-paragraph loops, which each explicitly skip a period
 * exactly once. This guarantees the period is consumed exactly once,
 * regardless of how many scopes it closes on the way up.
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

    // A period ends the whole sentence - close this (and every enclosing)
    // implicit scope WITHOUT consuming it; leave it for the sentence-level
    // loop (parseProcedureDivision/parseDeclaratives) to consume once.
    if (ctx.check(TokenType.PERIOD)) {
      return statements;
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
 * Parse a DECLARATIVES SECTION's mandatory USE statement (round-10 finding
 * 1). Scope is deliberately pragmatic - only the `USE [AFTER] [STANDARD]
 * ERROR PROCEDURE ON <target-list>` form (the overwhelmingly common one,
 * covering file-status-driven error handling) is fully understood; every
 * other USE form (`USE FOR DEBUGGING ON ...`, `USE BEFORE REPORTING ...`,
 * `USE GLOBAL ...`) is still consumed token-by-token up to the terminating
 * period (so it can never corrupt the rest of the parse) but tagged `{ kind:
 * 'UNSUPPORTED' }` - the section's own body still parses and generates as an
 * ordinary (if unreachable) method, an honest TODO rather than a silent
 * wrong wiring.
 *
 * `ON <target-list>` accepts any mix of one or more file-names and/or the
 * INPUT/OUTPUT/I-O/EXTEND keywords (optionally comma-separated) - e.g. `ON
 * IN-FILE, OUT-FILE` or `ON INPUT OUTPUT`.
 */
function parseUseStatement(ctx) {
  if (!ctx.matchValue('USE')) return null;

  const isAfter = ctx.matchValue('AFTER');
  ctx.matchValue('STANDARD');
  const isErrorForm = ctx.matchValue('ERROR') || ctx.matchValue('EXCEPTION');

  if (isErrorForm) {
    ctx.matchValue('PROCEDURE');
    ctx.matchValue('ON');

    const targets = [];
    while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
      if (ctx.check(TokenType.COMMA)) {
        ctx.advance();
        continue;
      }
      if (ctx.matchValue('INPUT')) {
        targets.push({ kind: 'INPUT' });
        continue;
      }
      if (ctx.matchValue('OUTPUT')) {
        targets.push({ kind: 'OUTPUT' });
        continue;
      }
      if (ctx.matchValue('I-O')) {
        targets.push({ kind: 'I-O' });
        continue;
      }
      if (ctx.matchValue('EXTEND')) {
        targets.push({ kind: 'EXTEND' });
        continue;
      }
      if (ctx.check(TokenType.IDENTIFIER)) {
        targets.push({ kind: 'FILE', name: ctx.advance().value });
        continue;
      }
      // Tolerate anything unexpected (defensive - keeps forward progress).
      ctx.advance();
    }

    return { kind: 'ERROR', after: isAfter, targets };
  }

  // Unsupported USE form: skip to the period without interpreting it.
  while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
    ctx.advance();
  }
  return { kind: 'UNSUPPORTED' };
}

/**
 * Parse the `DECLARATIVES. ... END DECLARATIVES.` prologue (round-10 finding
 * 1) - zero or more SECTIONs, each starting with a mandatory USE statement
 * (parseUseStatement) immediately after its own `<name> SECTION.` header,
 * followed by zero or more ordinary named paragraphs. Structurally identical
 * to how parseProcedureDivision's own main loop builds an ordinary section
 * (Procedure objects, procedureType 'section', nested paragraphs) - the only
 * difference is the extra mandatory USE clause per section, and the fact
 * that the caller stores these on `division.declaratives` instead of
 * `division.sections`, which is what actually keeps them out of normal
 * top-to-bottom program flow (see method-gen.js's flattenProcedureUnits -
 * it only ever walks `sections`/`paragraphs`).
 */
function parseDeclaratives(ctx) {
  ctx.advance(); // DECLARATIVES
  ctx.skipPeriod();

  const declaratives = [];
  let currentSection = null;
  let currentParagraph = null;

  while (!ctx.isAtEnd() && !(ctx.checkValue('END') && ctx.peek(1)?.value?.toUpperCase() === 'DECLARATIVES')) {
    if (ctx.check(TokenType.PERIOD)) {
      ctx.advance();
      continue;
    }

    // allowReservedWord: only before the FIRST section/paragraph of this
    // DECLARATIVES prologue has been recorded - see PARAGRAPH_NAME_RESERVED_
    // WORDS' doc comment. A USE section is mandatory here in real COBOL, so
    // this is a very narrow window in practice, but it stays symmetric with
    // the identical guard in parseProcedureDivision's own main loop below.
    if (isParagraphName(ctx, { allowReservedWord: !currentSection && !currentParagraph && declaratives.length === 0 })) {
      const name = ctx.advance().value;

      if (ctx.checkValue('SECTION')) {
        ctx.advance();
        ctx.skipPeriod();

        currentSection = new Procedure({ name, procedureType: 'section' });
        currentSection.useClause = parseUseStatement(ctx);
        ctx.skipPeriod();
        declaratives.push(currentSection);
        currentParagraph = null;
        continue;
      }

      ctx.skipPeriod();
      currentParagraph = new Procedure({ name, procedureType: 'paragraph' });
      if (currentSection) {
        currentSection.paragraphs.push(currentParagraph);
      }
      continue;
    }

    const stmt = parseStatement(ctx);
    if (stmt) {
      if (currentParagraph) {
        currentParagraph.statements.push(stmt);
      } else if (currentSection) {
        currentSection.statements.push(stmt);
      }
    } else if (!ctx.isAtEnd()) {
      const unknown = parseUnknownStatement(ctx, []);
      if (currentParagraph) {
        currentParagraph.statements.push(unknown);
      } else if (currentSection) {
        currentSection.statements.push(unknown);
      }
    }
  }

  ctx.matchValue('END');
  ctx.matchValue('DECLARATIVES');
  ctx.skipPeriod();

  return declaratives;
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

  // Parse USING clause. Same comma-consumption bug as CALL's own USING loop
  // (round-7 finding 1a's other half - the CALL *site* isn't the only place
  // COBOL allows/requires commas between USING operands; the *callee's own*
  // `PROCEDURE DIVISION USING LK-A, LK-B, LK-SUM` declaration does too, and
  // this loop's condition never listed TokenType.COMMA either, so it
  // silently stopped after the first parameter name here as well. Also
  // tolerates an optional `BY REFERENCE`/`BY VALUE` mode prefix per operand
  // (legal COBOL here, though this generator's own CALL-site mapping treats
  // every USING parameter as BY REFERENCE regardless - see
  // generator/expression-gen.js's generateCall).
  if (ctx.matchValue('USING')) {
    while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
      if (ctx.check(TokenType.COMMA)) {
        ctx.advance();
        continue;
      }
      if (ctx.matchValue('BY')) {
        ctx.matchValue('REFERENCE') || ctx.matchValue('VALUE') || ctx.matchValue('CONTENT');
        continue;
      }
      if (ctx.checkValue('REFERENCE') || ctx.checkValue('VALUE') || ctx.checkValue('CONTENT')) {
        ctx.advance();
        continue;
      }
      if (!ctx.check(TokenType.IDENTIFIER)) break;
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

  // round-10 finding 1: DECLARATIVES ... END DECLARATIVES, if present, is
  // syntactically required to come immediately here (before any ordinary
  // section/paragraph) - see parseDeclaratives.
  if (ctx.checkValue('DECLARATIVES')) {
    division.declaratives = parseDeclaratives(ctx);
  }

  // Parse sections and paragraphs
  let currentSection = null;
  let currentParagraph = null;

  while (!ctx.isAtEnd()) {
    // Skip periods
    if (ctx.check(TokenType.PERIOD)) {
      ctx.advance();
      continue;
    }

    // Check for paragraph or section name. allowReservedWord (round-20
    // finding 1): only true before the FIRST section/paragraph of the whole
    // PROCEDURE DIVISION has been recorded - i.e. this token is either
    // immediately after `PROCEDURE DIVISION.` itself (optionally after a
    // DECLARATIVES prologue) or nowhere at all, never once a real
    // paragraph/section is already open - see PARAGRAPH_NAME_RESERVED_WORDS'
    // doc comment for why this guard is what keeps an ordinary `SOME-EXIT.
    // EXIT.` statement idiom completely unaffected.
    if (isParagraphName(ctx, { allowReservedWord: !currentParagraph && !currentSection && division.paragraphs.length === 0 && division.sections.length === 0 })) {
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
      if (!currentParagraph && !currentSection) {
        // g14 finding: a PROCEDURE DIVISION whose very first thing (after
        // any USING/RETURNING clause) is a STATEMENT, not a paragraph- or
        // section-name declaration, is entirely legal COBOL - an unnamed,
        // implicit top-level "main" body (no PARAGRAPH-NAME/SECTION header
        // at all anywhere before it). Previously neither the
        // `currentParagraph` nor `currentSection` branch below matched in
        // this state, so the statement was silently discarded - repeated for
        // every subsequent statement until (if ever) a real paragraph/
        // section name appeared, meaning a whole no-paragraph-name PROCEDURE
        // DIVISION produced ZERO paragraphs/sections and an entirely empty
        // generated run()/entry() body. Synthesizing an implicit top-level
        // paragraph here - exactly the same "leading anonymous block becomes
        // its own unit" idea round-7 finding 8's sectionLeadingUnit already
        // applies one level down, inside a SECTION - routes these statements
        // into `division.paragraphs` (as its own first unit, so
        // flattenProcedureUnits/generateAllMethods/findMainProcedure all see
        // it exactly like any other paragraph, including as the program's
        // true entry point) instead of vanishing. The synthetic name can
        // never collide with a real COBOL paragraph name (COBOL paragraph-
        // names are a single word/hyphenated token, never containing
        // spaces).
        currentParagraph = new Procedure({
          name: IMPLICIT_MAIN_PARAGRAPH_NAME,
          procedureType: 'paragraph',
        });
        division.paragraphs.push(currentParagraph);
      }
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
      if (!currentParagraph && !currentSection) {
        // Same no-paragraph-name-yet case as above, for an unrecognized
        // leading verb.
        currentParagraph = new Procedure({
          name: IMPLICIT_MAIN_PARAGRAPH_NAME,
          procedureType: 'paragraph',
        });
        division.paragraphs.push(currentParagraph);
      }
      if (currentParagraph) {
        currentParagraph.statements.push(unknown);
      } else if (currentSection) {
        currentSection.statements.push(unknown);
      }
    }
  }

  return division;
}

/**
 * Synthetic paragraph name for an entirely unnamed PROCEDURE DIVISION body
 * (round-18 finding "g14" - see parseProcedureDivision's own doc comment at
 * the "Parse statement" branch above). Hyphen-separated, matching ordinary
 * COBOL paragraph-name shape (and round-7 finding 8's own
 * `${section.name}-SECTION-BODY` synthetic-name convention one level down),
 * since `toMethodName`/`toPascalCase` (generator/case-class-gen.js) only
 * ever split a name on `-`/`_` - a name containing a space or other
 * character COBOL's own word-forming rules disallow would otherwise survive
 * unsplit into the generated Scala method name (e.g. `def implicit main
 * paragraph()`), which is not valid Scala syntax at all.
 */
const IMPLICIT_MAIN_PARAGRAPH_NAME = 'IMPLICIT-MAIN-PARAGRAPH';

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
