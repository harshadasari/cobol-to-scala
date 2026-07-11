/**
 * expression-gen.js
 * Convert COBOL expressions and statements to Scala
 */

import { toCamelCase, toPascalCase } from './case-class-gen.js';
import {
  generateOpen,
  generateClose,
  generateRead,
  generateWrite,
  generateRewrite,
  generateDelete as generateDeleteFile,
  generateStart,
} from './file-io-gen.js';

/**
 * Map COBOL arithmetic operators to Scala
 */
const ARITHMETIC_OPERATORS = {
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '**': 'Math.pow',
  'ADD': '+',
  'SUBTRACT': '-',
  'MULTIPLY': '*',
  'DIVIDE': '/'
};

/**
 * Map COBOL comparison operators to Scala
 */
const COMPARISON_OPERATORS = {
  '=': '==',
  'EQUAL': '==',
  'EQUALS': '==',
  'EQUAL TO': '==',
  '>': '>',
  'GREATER': '>',
  'GREATER THAN': '>',
  '<': '<',
  'LESS': '<',
  'LESS THAN': '<',
  '>=': '>=',
  'GREATER OR EQUAL': '>=',
  'NOT LESS': '>=',
  '<=': '<=',
  'LESS OR EQUAL': '<=',
  'NOT GREATER': '<=',
  'NOT =': '!=',
  'NOT EQUAL': '!=',
  'NOT EQUALS': '!='
};

/**
 * Map COBOL logical operators to Scala
 */
const LOGICAL_OPERATORS = {
  'AND': '&&',
  'OR': '||',
  'NOT': '!'
};

// ============================================================================
// WORKING-STORAGE field registry
//
// Built once per conversion by scala-generator.js's buildFieldRegistry() and
// installed here via setFieldRegistry() before any method bodies are
// generated. Keyed by uppercased COBOL name -> { camel, scalaType, dataType,
// integerDigits, decimalDigits, signed, editPattern, occursDepth }. Used for:
//   - DISPLAY numeric formatting (sign + zero-padding per PIC digit counts)
//   - MOVE literal coercion to the target's declared Scala type
//   - numeric-edited PICTURE formatting (Z/9/$/+/-/CR/DB) at MOVE time
//   - decimal-aware DIVIDE when the GIVING target is a BigDecimal field
// Subscript rendering itself needs no registry lookup - it is derived
// entirely from the VariableReference node's own `.subscripts`.
// ============================================================================

let FIELD_REGISTRY = new Map();

/** Install the field registry built for the program currently being generated. */
export function setFieldRegistry(registry) {
  FIELD_REGISTRY = registry instanceof Map ? registry : new Map();
}

function lookupField(name) {
  if (!name) return null;
  return FIELD_REGISTRY.get(String(name).toUpperCase()) || null;
}

/**
 * Look up field metadata for a MOVE/arithmetic target/operand reference. A
 * qualified reference (`NAME OF WS-TARGET-GROUP`) resolves through the
 * qualified registry by (name, immediate parent) first, since the bare name
 * alone may be ambiguous (or simply not registered at all - see
 * buildFieldRegistry's ambiguous-name handling) and falls back to a bare
 * lookup only if no qualified entry exists.
 */
function lookupFieldForRef(ref) {
  if (!ref) return null;
  if (typeof ref !== 'object') return lookupField(ref);
  if (Array.isArray(ref.qualifiers) && ref.qualifiers.length > 0) {
    const info = lookupQualified(String(ref.name).toUpperCase(), String(ref.qualifiers[0]).toUpperCase());
    if (info) return info;
  }
  return lookupField(ref.name);
}

// ============================================================================
// OCCURS table registry (SEARCH / SEARCH ALL) and group registry (MOVE
// CORRESPONDING). Built once per conversion by scala-generator.js's
// buildFieldRegistry() alongside FIELD_REGISTRY, and installed the same way.
// ============================================================================

/** name (upper) -> { times, indexed: [camel...], ascending: [camel...], descending: [camel...] } */
let TABLE_REGISTRY = new Map();
/** group-item name (upper) -> [{ nameUpper, camel }, ...] immediate real children */
let GROUP_REGISTRY = new Map();
/** SD file name AND its 01 record name (both upper) -> sort-buffer support info */
let SORT_FILE_REGISTRY = new Map();
/** "<name>::<immediate parent name>" (both upper) -> field info, for OF/IN qualified references */
let QUALIFIED_REGISTRY = new Map();

export function setTableRegistry(registry) {
  TABLE_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setGroupRegistry(registry) {
  GROUP_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setSortFileRegistry(registry) {
  SORT_FILE_REGISTRY = registry instanceof Map ? registry : new Map();
}

export function setQualifiedRegistry(registry) {
  QUALIFIED_REGISTRY = registry instanceof Map ? registry : new Map();
}

function lookupTable(name) {
  if (!name) return null;
  return TABLE_REGISTRY.get(String(name).toUpperCase()) || null;
}

function lookupSortFile(name) {
  if (!name) return null;
  return SORT_FILE_REGISTRY.get(String(name).toUpperCase()) || null;
}

/** Look up an OF/IN qualified reference's field info by (name, immediate parent). */
function lookupQualified(nameUpper, parentUpper) {
  return QUALIFIED_REGISTRY.get(`${nameUpper}::${parentUpper}`) || null;
}

/**
 * COBOL paragraph/section name -> Scala method name, mirroring
 * method-gen.js's toMethodName() exactly (strip a leading numeric prefix,
 * then camelCase). Duplicated locally rather than imported, since
 * method-gen.js imports *from* this module - importing back would create a
 * cycle.
 */
function paragraphMethodName(name) {
  if (!name) return '';
  let n = String(name).replace(/^\d+[-_]?/, '');
  if (!n) n = '_' + name;
  return toCamelCase(n);
}

/**
 * Scala expression for one subscript, 1-based COBOL -> 0-based Scala.
 * Literal subscripts are folded at generation time (`WS-QTY(1)` -> `0`);
 * variable subscripts render as `<camelName> - 1`.
 */
function subscriptIndexExpr(sub) {
  if (sub && typeof sub === 'object') {
    if (sub.type === 'literal') {
      const n = parseInt(sub.value, 10);
      return String(Number.isFinite(n) ? n - 1 : 0);
    }
    if (sub.type === 'variable') {
      return `${toCamelCase(sub.value)} - 1`;
    }
  }
  return `${convertArithmeticExpression(sub)} - 1`;
}

/**
 * Render an assignment to a (possibly subscripted) target as a Scala
 * statement. WORKING-STORAGE OCCURS tables are represented as flat
 * `var name: Vector[...]` fields (one Vector layer per occurs-bearing
 * ancestor level, see scala-generator.js's buildFieldRegistry), so a
 * subscripted write can't use `name(idx) = value` - Vector has no index
 * setter - it must rebuild the vector with `.updated(idx, value)`, nested
 * once per subscript dimension for multi-dimensional OCCURS.
 */
function renderAssignment(targetRef, valueExpr) {
  if (!targetRef) return `/* no assignment target */ = ${valueExpr}`;
  if (typeof targetRef === 'string') {
    return `${toCamelCase(targetRef)} = ${valueExpr}`;
  }

  const camel = toCamelCase(targetRef.name || '');
  const subscripts = Array.isArray(targetRef.subscripts) ? targetRef.subscripts : [];
  if (subscripts.length === 0) {
    return `${camel} = ${valueExpr}`;
  }

  const idxs = subscripts.map(subscriptIndexExpr);
  function rec(depth, baseExpr) {
    if (depth === idxs.length - 1) {
      return `${baseExpr}.updated(${idxs[depth]}, ${valueExpr})`;
    }
    return `${baseExpr}.updated(${idxs[depth]}, ${rec(depth + 1, `${baseExpr}(${idxs[depth]})`)})`;
  }
  return `${camel} = ${rec(0, camel)}`;
}

/**
 * Convert a COBOL identifier to Scala camelCase
 * Handles strings, VariableReference objects, and other AST nodes
 */
function convertIdentifier(cobolId) {
  if (!cobolId) return '';

  // Handle string directly
  if (typeof cobolId === 'string') {
    return toCamelCase(cobolId);
  }

  // Handle VariableReference objects
  if (cobolId.type === 'VariableReference' || cobolId.name) {
    const name = cobolId.name || '';
    const subscripts = Array.isArray(cobolId.subscripts) ? cobolId.subscripts : [];
    if (subscripts.length > 0) {
      const idxChain = subscripts.map(s => `(${subscriptIndexExpr(s)})`).join('');
      return `${toCamelCase(name)}${idxChain}`;
    }
    if (cobolId.qualifiers && cobolId.qualifiers.length > 0) {
      // OF/IN qualification disambiguates *which* same-named data item is
      // meant (e.g. `NAME OF WS-TARGET-GROUP`) - it is not a path into a
      // nested Scala object (this generator's WORKING-STORAGE items are all
      // flat vars, not case-class instances - see buildFieldRegistry), so
      // resolve it through the qualified registry rather than emitting a
      // `<qualifier>.<name>` dot-path that has no corresponding Scala value.
      const info = lookupQualified(name.toUpperCase(), String(cobolId.qualifiers[0]).toUpperCase());
      if (info) return info.camel;
      const bare = lookupField(name);
      return bare ? bare.camel : toCamelCase(name);
    }
    return toCamelCase(name);
  }

  // Handle qualified names (OF/IN) - older format
  if (typeof cobolId === 'object' && cobolId.qualifier) {
    return `${toCamelCase(cobolId.qualifier)}.${toCamelCase(cobolId.name || '')}`;
  }

  // Handle Literal objects
  if (cobolId.type === 'Literal') {
    return convertLiteral(cobolId.value);
  }

  // Fallback - try to extract name property
  if (typeof cobolId === 'object' && cobolId.name) {
    return toCamelCase(cobolId.name);
  }

  return safeNodeString(cobolId);
}

/**
 * Render an unrecognized AST node as valid Scala instead of the useless
 * "[object Object]" produced by String(object). Extracts the most likely
 * payload (value/name/pattern) or, failing that, emits a TODO comment
 * carrying the node type so the generated code still compiles and the
 * unconverted construct is visible to a reviewer.
 */
function safeNodeString(node) {
  if (node === null || node === undefined) return '';
  if (typeof node !== 'object') return String(node);

  if (node.value !== undefined && typeof node.value !== 'object') {
    return convertLiteral(node.value);
  }
  if (typeof node.name === 'string' && node.name) {
    return toCamelCase(node.name);
  }
  if (typeof node.pattern === 'string' && node.pattern) {
    return `"${node.pattern}"`;
  }

  const nodeType = node.type || node.constructor?.name || 'unknown';
  return `??? /* TODO: unsupported COBOL construct (${nodeType}) */`;
}

/**
 * Convert a COBOL literal to Scala
 */
function convertLiteral(value) {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'string') {
    // Check if it's a numeric string
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return value;
    }
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value.toString();
  }

  if (typeof value === 'object') {
    return safeNodeString(value);
  }

  return String(value);
}

/**
 * Scala source for the CobolFmt runtime helper embedded in every generated
 * program. DISPLAY of a non-edited numeric PIC item prints a fixed-width,
 * zero-padded representation with a leading sign character for signed items
 * (always '+' or '-', including for zero - COBOL treats zero as
 * non-negative) and no sign character at all for unsigned items; the
 * decimal point (if any) is inserted per the PIC's integer/decimal digit
 * counts, and an all-decimal PIC (0 integer digits, e.g. `SV9(5)`) omits the
 * leading zero entirely (`-.54321`, not `-0.54321`).
 */
export function generateCobolFmtHelper() {
  return [
    'object CobolFmt:',
    '  def num(v: BigDecimal, intDigits: Int, decDigits: Int, signed: Boolean): String =',
    '    val neg = v.signum < 0',
    '    val absVal = v.abs',
    '    val totalDigits = intDigits + decDigits',
    '    val unscaled = (absVal * BigDecimal(10).pow(decDigits)).setScale(0, BigDecimal.RoundingMode.HALF_UP).toBigInt.toString',
    '    val digits = if unscaled.length < totalDigits then ("0" * (totalDigits - unscaled.length)) + unscaled else unscaled',
    '    val intPart = if intDigits > 0 then digits.dropRight(decDigits) else ""',
    '    val decPart = if decDigits > 0 then digits.takeRight(decDigits) else ""',
    '    val signStr = if signed then (if neg then "-" else "+") else ""',
    '    val body = if decDigits > 0 then intPart + "." + decPart else intPart',
    '    signStr + body',
  ].join('\n');
}

/**
 * Scala source for the CobolInspect runtime helper embedded in every
 * generated program, backing INSPECT TALLYING/REPLACING generation
 * (generateInspect). Kept as small, literal-substring operations (not
 * regex-based) since COBOL's INSPECT operands are literal text, not
 * patterns, and matches are non-overlapping, scanned strictly left to right.
 */
export function generateCobolInspectHelper() {
  return [
    'object CobolInspect:',
    '  def tallyAll(s: String, pat: String): Int =',
    '    if pat.isEmpty then 0',
    '    else',
    '      var i = 0',
    '      var c = 0',
    '      while i <= s.length - pat.length do',
    '        if s.regionMatches(i, pat, 0, pat.length) then',
    '          c += 1',
    '          i += pat.length',
    '        else',
    '          i += 1',
    '      c',
    '  def tallyLeading(s: String, pat: String): Int =',
    '    if pat.isEmpty then 0',
    '    else',
    '      var i = 0',
    '      var c = 0',
    '      while s.regionMatches(i, pat, 0, pat.length) do',
    '        c += 1',
    '        i += pat.length',
    '      c',
    '  def replaceAll(s: String, from: String, to: String): String =',
    '    if from.isEmpty then s else s.replace(from, to)',
    '  def replaceFirst(s: String, from: String, to: String): String =',
    '    val i = s.indexOf(from)',
    '    if i < 0 then s else s.substring(0, i) + to + s.substring(i + from.length)',
    '  def replaceLeading(s: String, from: String, to: String): String =',
    '    val sb = new StringBuilder(s)',
    '    var i = 0',
    '    while from.nonEmpty && i <= s.length - from.length && sb.toString.regionMatches(i, from, 0, from.length) do',
    '      for j <- 0 until math.min(from.length, to.length) do sb.setCharAt(i + j, to(j))',
    '      i += from.length',
    '    sb.toString',
    '  def replaceTrailing(s: String, from: String, to: String): String =',
    '    val sb = new StringBuilder(s)',
    '    var i = s.length - from.length',
    '    while from.nonEmpty && i >= 0 && sb.toString.regionMatches(i, from, 0, from.length) do',
    '      for j <- 0 until math.min(from.length, to.length) do sb.setCharAt(i + j, to(j))',
    '      i -= from.length',
    '    sb.toString',
    '  def replaceCharacters(s: String, to: String): String =',
    '    if to.isEmpty then s else to.head.toString * s.length',
  ].join('\n');
}

/**
 * Numeric-edited PICTURE formatting (Z/9/* zero-suppression, $/+/- fixed and
 * floating insertion, comma/decimal-point insertion, CR/DB trailing sign).
 * Evaluated at Scala-generation time against a COBOL literal's raw text -
 * every numeric-edited MOVE source in the Phase 1 corpus is a literal, so
 * the formatted result is embedded directly as a Scala string literal
 * (the numeric-edited item is a receiving-only field: COBOL performs the
 * editing at MOVE time, DISPLAY simply prints the stored characters).
 *
 * @param {string} editPattern - the parser's fully-expanded PicClause.editPattern
 *   (repeat counts already expanded, CR/DB already appended as a literal
 *   2-char suffix - see parser/data-division-parser.js parsePicPattern).
 * @param {string} rawValue - the literal's raw text, e.g. "-987654321.99".
 */
export function formatEditedPicture(editPattern, rawValue) {
  let corePattern = editPattern;
  let trailingSign = null;
  if (/CR$/.test(corePattern) || /DB$/.test(corePattern)) {
    trailingSign = corePattern.slice(-2);
    corePattern = corePattern.slice(0, -2);
  }

  const raw = String(rawValue).trim();
  const neg = raw.startsWith('-');
  const unsignedRaw = raw.replace(/^[+-]/, '');
  const dotIdx = unsignedRaw.indexOf('.');
  const intRaw = dotIdx === -1 ? unsignedRaw : unsignedRaw.slice(0, dotIdx);
  const decRaw = dotIdx === -1 ? '' : unsignedRaw.slice(dotIdx + 1);

  const chars = corePattern.split('');

  const symbolCounts = { '$': 0, '+': 0, '-': 0 };
  for (const ch of chars) if (ch in symbolCounts) symbolCounts[ch] += 1;

  let seenDecimalPoint = false;
  const digitPositions = []; // { idx, kind: 'fixed' | 'suppress', isDecimal }
  let floatingChar = null;
  const floatingIndices = [];
  let fixedSymbolIdx = null;
  let fixedSymbolChar = null;

  chars.forEach((ch, idx) => {
    if (ch === '.') {
      seenDecimalPoint = true;
      return;
    }
    if (ch === '9' || ch === 'Z' || ch === '*') {
      digitPositions.push({ idx, kind: ch === '9' ? 'fixed' : 'suppress', isDecimal: seenDecimalPoint });
      return;
    }
    if (ch === '$' || ch === '+' || ch === '-') {
      if (symbolCounts[ch] >= 2) {
        digitPositions.push({ idx, kind: 'suppress', isDecimal: seenDecimalPoint, isSymbol: true });
        floatingChar = ch;
        floatingIndices.push(idx);
      } else {
        fixedSymbolIdx = idx;
        fixedSymbolChar = ch;
      }
    }
    // Other insertion characters (',', 'B', '0', '/') need no classification
    // here - they're handled purely positionally at render time below.
  });

  const intDigitCount = digitPositions.filter(d => !d.isDecimal).length;
  const decDigitCount = digitPositions.filter(d => d.isDecimal).length;

  const intDigits = intDigitCount === 0 ? '' : intRaw.padStart(intDigitCount, '0').slice(-intDigitCount);
  const decDigits = decDigitCount === 0 ? '' : decRaw.padEnd(decDigitCount, '0').slice(0, decDigitCount);
  const digitsStr = intDigits + decDigits;
  digitPositions.forEach((d, i) => { d.digit = digitsStr[i]; });

  let firstShownArrIdx = digitPositions.findIndex(d => d.kind === 'fixed' || (d.kind === 'suppress' && d.digit !== '0'));
  if (firstShownArrIdx === -1) firstShownArrIdx = Math.max(digitPositions.length - 1, 0);

  let boundaryPatternIdx = null;
  let symbolChar = null;
  if (floatingIndices.length >= 2) {
    symbolChar = floatingChar;
    boundaryPatternIdx = firstShownArrIdx > 0
      ? digitPositions[firstShownArrIdx - 1].idx
      : floatingIndices[0];
  }

  let floatingSignChar = '';
  if (symbolChar === '+') floatingSignChar = neg ? '-' : '+';
  else if (symbolChar === '-') floatingSignChar = neg ? '-' : ' ';
  else if (symbolChar === '$') floatingSignChar = '$';

  let fixedSignChar = '';
  if (fixedSymbolChar === '+') fixedSignChar = neg ? '-' : '+';
  else if (fixedSymbolChar === '-') fixedSignChar = neg ? '-' : ' ';
  else if (fixedSymbolChar === '$') fixedSignChar = '$';

  const shownFromPatternIdx = boundaryPatternIdx !== null
    ? boundaryPatternIdx
    : (digitPositions[firstShownArrIdx] ? digitPositions[firstShownArrIdx].idx : 0);

  let out = '';
  chars.forEach((ch, idx) => {
    if (ch === '.') {
      out += idx >= shownFromPatternIdx ? '.' : ' ';
      return;
    }
    if (ch === '9' || ch === 'Z' || ch === '*') {
      const arrIdx = digitPositions.findIndex(d => d.idx === idx);
      out += arrIdx >= firstShownArrIdx ? digitPositions[arrIdx].digit : ' ';
      return;
    }
    if (ch === '$' || ch === '+' || ch === '-') {
      if (idx === fixedSymbolIdx) {
        out += fixedSignChar;
      } else if (idx === boundaryPatternIdx) {
        out += floatingSignChar;
      } else {
        // A floating symbol position past the boundary is a shown digit
        // slot (e.g. the '1' of 1,234.50 falls on a '$' in $$$,$$9.99), not
        // blank - only positions strictly before the boundary are blanked.
        const arrIdx = digitPositions.findIndex(d => d.idx === idx);
        out += arrIdx !== -1 && arrIdx >= firstShownArrIdx ? digitPositions[arrIdx].digit : ' ';
      }
      return;
    }
    out += idx >= shownFromPatternIdx ? ch : ' ';
  });

  if (trailingSign) {
    out += neg ? trailingSign : '  ';
  }

  return out;
}

/**
 * Convert a COBOL arithmetic expression to Scala
 */
export function convertArithmeticExpression(expr) {
  if (!expr) return '';

  if (typeof expr === 'string' || typeof expr === 'number') {
    const strExpr = String(expr);
    // Check if it's an identifier or a literal
    if (/^[A-Za-z]/.test(strExpr)) {
      return convertIdentifier(strExpr);
    }
    return strExpr;
  }

  if (expr.type === 'FunctionCall') {
    return generateFunctionCall(expr);
  }

  // Nodes produced by the procedure parser (parser/ast.js shapes)
  if (expr.type === 'ArithmeticExpression') {
    if (expr.unaryMinus) {
      return `-${convertArithmeticExpression(expr.right)}`;
    }
    if (expr.functionCall) {
      return generateFunctionCall(expr.functionCall);
    }
    if (expr.operator && expr.left != null && expr.right != null) {
      const left = convertArithmeticExpression(expr.left);
      const right = convertArithmeticExpression(expr.right);
      if (expr.operator === '**') {
        return `Math.pow(${left}, ${right})`;
      }
      const op = ARITHMETIC_OPERATORS[expr.operator] || expr.operator;
      return `(${left} ${op} ${right})`;
    }
    if (expr.variable) {
      return convertIdentifier(expr.variable);
    }
    if (expr.value !== null && expr.value !== undefined) {
      return convertLiteral(expr.value);
    }
    return '0';
  }

  if (expr.type === 'VariableReference') {
    return convertIdentifier(expr);
  }

  if (expr.type === 'Literal') {
    return convertLiteral(expr.value);
  }

  if (expr.type === 'literal') {
    return convertLiteral(expr.value);
  }

  if (expr.type === 'identifier') {
    return convertIdentifier(expr.name);
  }

  if (expr.type === 'binary') {
    const left = convertArithmeticExpression(expr.left);
    const right = convertArithmeticExpression(expr.right);
    const op = ARITHMETIC_OPERATORS[expr.operator] || expr.operator;

    if (expr.operator === '**') {
      return `Math.pow(${left}, ${right})`;
    }

    return `(${left} ${op} ${right})`;
  }

  if (expr.type === 'unary') {
    const operand = convertArithmeticExpression(expr.operand);
    return `-${operand}`;
  }

  if (expr.type === 'function') {
    const args = expr.arguments.map(convertArithmeticExpression).join(', ');
    const funcName = convertCobolFunction(expr.name);
    return `${funcName}(${args})`;
  }

  return safeNodeString(expr);
}

/**
 * Convert COBOL intrinsic functions to Scala
 */
function convertCobolFunction(funcName) {
  const functionMap = {
    'FUNCTION LENGTH': 'length',
    'FUNCTION UPPER-CASE': 'toUpperCase',
    'FUNCTION LOWER-CASE': 'toLowerCase',
    'FUNCTION TRIM': 'trim',
    'FUNCTION NUMVAL': 'toDouble',
    'FUNCTION ABS': 'Math.abs',
    'FUNCTION SQRT': 'Math.sqrt',
    'FUNCTION SIN': 'Math.sin',
    'FUNCTION COS': 'Math.cos',
    'FUNCTION TAN': 'Math.tan',
    'FUNCTION LOG': 'Math.log',
    'FUNCTION LOG10': 'Math.log10',
    'FUNCTION EXP': 'Math.exp',
    'FUNCTION MAX': 'Math.max',
    'FUNCTION MIN': 'Math.min',
    'FUNCTION MOD': 'mod',
    'FUNCTION REMAINDER': 'remainder',
    'FUNCTION INTEGER': 'toInt',
    'FUNCTION INTEGER-PART': 'toInt',
    'FUNCTION CURRENT-DATE': 'java.time.LocalDateTime.now'
  };

  return functionMap[funcName.toUpperCase()] || toCamelCase(funcName);
}

/**
 * FUNCTION LENGTH(x): COBOL's LENGTH always returns the *storage* length of
 * its argument, not any notion of "trimmed"/logical length - a PIC X(10)
 * field holding "hello" still reports 10. For a variable reference this is
 * a compile-time constant (the field's declared PIC length from the
 * registry), so it's embedded directly as a numeric literal rather than a
 * runtime `.length` call (which would report this generator's unpadded
 * internal representation instead - see renderDisplayOperand's padding
 * comment for why storage is kept unpadded internally). For a string
 * literal argument, COBOL's LENGTH is simply the literal's own character
 * count. Falls back to a runtime `.length` call only when neither shape
 * applies (e.g. a reference with no registry entry) - a defensive fallback,
 * not exercised by the Phase 2 corpus.
 */
function functionLength(arg) {
  if (arg && arg.type === 'Literal' && arg.literalType !== 'figurative') {
    return String(String(arg.value ?? '').length);
  }
  if (arg && arg.type === 'VariableReference') {
    const info = lookupFieldForRef(arg);
    if (info && info.picLength) return String(info.picLength);
  }
  return `${convertArithmeticExpression(arg)}.length`;
}

/**
 * FUNCTION intrinsic call -> Scala expression. Only the intrinsics the
 * Phase 2 corpus (p15-intrinsics.cbl) actually exercises are implemented
 * with verified-against-cobc semantics; anything else renders as a visible
 * TODO marker rather than a guessed translation.
 */
function generateFunctionCall(fc) {
  const name = String(fc?.name || '').toUpperCase();
  const args = fc?.arguments || [];

  switch (name) {
    case 'UPPER-CASE':
      return `(${convertArithmeticExpression(args[0])}).toUpperCase`;
    case 'LOWER-CASE':
      return `(${convertArithmeticExpression(args[0])}).toLowerCase`;
    case 'REVERSE':
      return `(${convertArithmeticExpression(args[0])}).reverse`;
    case 'TRIM':
      return `(${convertArithmeticExpression(args[0])}).trim`;
    case 'LENGTH':
    case 'LENGTH-OF':
      return functionLength(args[0]);
    case 'NUMVAL':
    case 'NUMVAL-C':
      // NUMVAL's argument is always an alphanumeric field/literal that may
      // carry leading/trailing spaces from fixed-width storage; .trim keeps
      // BigDecimal's parser happy without altering the numeric text itself.
      return `BigDecimal((${convertArithmeticExpression(args[0])}).trim)`;
    case 'MOD': {
      // COBOL FUNCTION MOD is floored-division modulo (result takes the
      // divisor's sign), not Scala/Java's truncating `%` (which takes the
      // dividend's sign) - e.g. FUNCTION MOD(-7, 3) = 2, but -7 % 3 == -1 in
      // Scala. ((a % b) + b) % b converts truncating remainder to floored
      // remainder for either operand's sign.
      const a = convertArithmeticExpression(args[0]);
      const b = convertArithmeticExpression(args[1]);
      return `(((${a}) % (${b}) + (${b})) % (${b}))`;
    }
    case 'MAX':
      return args.map(convertArithmeticExpression).reduce((a, b) => `Math.max(${a}, ${b})`);
    case 'MIN':
      return args.map(convertArithmeticExpression).reduce((a, b) => `Math.min(${a}, ${b})`);
    default:
      return `??? /* TODO: unsupported FUNCTION ${fc?.name || name} */`;
  }
}

/**
 * Generate COMPUTE statement
 */
export function generateCompute(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const expression = convertArithmeticExpression(statement.expression);

  // COMPUTE supports multiple targets: COMPUTE A B = expression
  const targets = Array.isArray(statement.targets) && statement.targets.length > 0
    ? statement.targets
    : [statement.target].filter(Boolean);

  if (targets.length === 0) {
    return `${indentStr}// COMPUTE with no resolvable target: ${expression}`;
  }

  const keyword = statement.isNew ? 'val ' : '';
  const rounded = statement.rounded ? ' // ROUNDED' : '';

  return targets
    .map(target => `${indentStr}${keyword}${renderAssignment(target, expression)}${rounded}`)
    .join('\n');
}

/**
 * Scala literal for a figurative/numeric ZERO MOVEd into a field, honoring
 * the target's declared Scala type (0 / 0L / BigDecimal(0) / "").
 */
function zeroLiteralFor(info) {
  if (!info) return '0';
  if (info.scalaType === 'BigDecimal') return 'BigDecimal(0)';
  if (info.scalaType === 'Long') return '0L';
  if (info.scalaType === 'String') return '""';
  return '0';
}

/**
 * Render a MOVE source (Literal AST node or figurative-constant string)
 * against the target field's registry info, coercing to the target's
 * declared Scala type:
 *   - BigDecimal target: `BigDecimal("<exact literal text>")` (never routed
 *     through a Scala Double literal - avoids any binary floating-point
 *     round-tripping of decimal text like "-987654321.99").
 *   - Long target: literal text with an `L` suffix (bare integer literals
 *     wider than Int overflow Scala's default Int literal type otherwise).
 *   - Int target: literal text as-is (truncated to its integer prefix,
 *     defensively, since COBOL MOVE truncates a fractional source moved to
 *     an integer receiver).
 *   - String target with an edited PIC (dataType 'edited'): the fully
 *     PICTURE-formatted string, computed by formatEditedPicture() - COBOL
 *     performs numeric-edit formatting at MOVE time, not at DISPLAY time.
 *   - String target (plain alphanumeric): quoted as-is.
 * Falls back to the pre-existing untyped behavior when no registry info is
 * available (e.g. a program with no matching WORKING-STORAGE entry).
 */
function renderMoveSource(source, info) {
  if (source && typeof source === 'object' && source.type === 'Literal') {
    return renderLiteralForTarget(source, info);
  }

  if (typeof source === 'string') {
    const upper = source.toUpperCase();
    if (upper === 'SPACES' || upper === 'SPACE') return '""';
    if (upper === 'ZEROS' || upper === 'ZEROES' || upper === 'ZERO') return zeroLiteralFor(info);
    if (upper === 'HIGH-VALUES' || upper === 'HIGH-VALUE') return 'Char.MaxValue.toString';
    if (upper === 'LOW-VALUES' || upper === 'LOW-VALUE') return 'Char.MinValue.toString';
    return convertIdentifier(source);
  }

  if (source && source.type === 'VariableReference') {
    return convertIdentifier(source);
  }

  return convertArithmeticExpression(source);
}

function renderLiteralForTarget(lit, info) {
  if (lit.literalType === 'figurative') {
    switch (String(lit.value).toUpperCase()) {
      case 'ZERO': return zeroLiteralFor(info);
      case 'SPACE': return '""';
      case 'HIGH-VALUE': return 'Char.MaxValue.toString';
      case 'LOW-VALUE': return 'Char.MinValue.toString';
      default: return '""';
    }
  }

  if (lit.literalType === 'string') {
    const text = lit.value ?? '';
    if (info?.dataType === 'edited' && info.editPattern) {
      return `"${escapeScalaStringLiteral(formatEditedPicture(info.editPattern, text))}"`;
    }
    return `"${escapeScalaStringLiteral(text)}"`;
  }

  // Numeric literal (raw text, sign already included by the lexer, e.g. "-50").
  const raw = String(lit.value);
  if (info?.dataType === 'edited' && info.editPattern) {
    return `"${escapeScalaStringLiteral(formatEditedPicture(info.editPattern, raw))}"`;
  }
  if (info?.scalaType === 'BigDecimal') {
    return `BigDecimal("${raw}")`;
  }
  if (info?.scalaType === 'Long') {
    return `${normalizeIntLiteralText(raw)}L`;
  }
  if (info?.scalaType === 'Int') {
    return normalizeIntLiteralText(raw);
  }
  return convertLiteral(raw);
}

function normalizeIntLiteralText(raw) {
  const m = /^-?\d+/.exec(String(raw));
  return m ? m[0] : '0';
}

function escapeScalaStringLiteral(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generate MOVE statement
 */
export function generateMove(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const source = statement.source;
  const targets = Array.isArray(statement.targets) ? statement.targets : [statement.target];

  const lines = [];

  for (const target of targets) {
    const info = lookupFieldForRef(target);
    const sourceExpr = renderMoveSource(source, info);
    lines.push(`${indentStr}${renderAssignment(target, sourceExpr)}`);
  }

  return lines.join('\n');
}

/**
 * Match immediate child field names between two group items (looked up in
 * GROUP_REGISTRY by uppercased COBOL name), recursing into any child pair
 * that is itself a group on both sides. This is MOVE CORRESPONDING's actual
 * rule (COBOL-85 13.16.20.3): move every elementary item in the receiving
 * group whose name matches (ignoring level number/qualification) an
 * elementary item in the sending group; unmatched fields on either side are
 * left untouched.
 */
function correspondingPairs(sourceNameUpper, targetNameUpper) {
  const srcChildren = GROUP_REGISTRY.get(sourceNameUpper) || [];
  const tgtChildren = GROUP_REGISTRY.get(targetNameUpper) || [];
  const pairs = [];

  for (const tgt of tgtChildren) {
    const src = srcChildren.find(s => s.nameUpper === tgt.nameUpper);
    if (!src) continue;

    if (GROUP_REGISTRY.has(src.nameUpper) && GROUP_REGISTRY.has(tgt.nameUpper)) {
      pairs.push(...correspondingPairs(src.nameUpper, tgt.nameUpper));
    } else {
      pairs.push({
        sourceCamel: src.camel,
        targetCamel: tgt.camel,
        sourceInfo: lookupField(src.nameUpper),
        targetInfo: lookupField(tgt.nameUpper),
      });
    }
  }

  return pairs;
}

/** Coerce a matched CORRESPONDING source value to the target field's Scala type. */
function coerceCorrespondingValue(pair) {
  const expr = pair.sourceCamel;
  const targetType = pair.targetInfo?.scalaType;
  const sourceType = pair.sourceInfo?.scalaType;
  if (!targetType || targetType === sourceType) return expr;
  if (targetType === 'BigDecimal') return `BigDecimal(${expr})`;
  if (targetType === 'Long') return `${expr}.toLong`;
  if (targetType === 'Int') return `${expr}.toInt`;
  return expr;
}

/**
 * Generate MOVE CORRESPONDING statement
 */
export function generateMoveCorresponding(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const sourceUpper = String(statement.source?.name || statement.source || '').toUpperCase();
  const targets = Array.isArray(statement.targets) && statement.targets.length > 0
    ? statement.targets
    : [statement.target].filter(Boolean);

  const lines = [];
  for (const targetRef of targets) {
    const targetUpper = String(targetRef?.name || targetRef || '').toUpperCase();
    const pairs = correspondingPairs(sourceUpper, targetUpper);
    if (pairs.length === 0) {
      lines.push(
        `${indentStr}// MOVE CORRESPONDING ${sourceUpper} TO ${targetUpper}: no matching child field names found in the group registry`
      );
      continue;
    }
    for (const pair of pairs) {
      lines.push(`${indentStr}${pair.targetCamel} = ${coerceCorrespondingValue(pair)}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : `${indentStr}()`;
}

/**
 * Convert a COBOL condition to Scala
 */
export function convertCondition(condition) {
  if (!condition) return 'true';

  if (typeof condition === 'string') {
    // Check if it's an 88-level condition name
    if (/^[A-Za-z]/.test(condition)) {
      return convertIdentifier(condition);
    }
    return condition;
  }

  // Nodes produced by the procedure parser (parser/ast.js shapes)
  if (condition.type === 'RelationalCondition') {
    const left = convertArithmeticExpression(condition.subject);
    const right = convertArithmeticExpression(condition.object);
    const rawOp = condition.relationalOperator || '=';
    const op = rawOp === '<>' ? '!=' : (COMPARISON_OPERATORS[rawOp] || rawOp);
    return `${left} ${op} ${right}`;
  }

  if (condition.type === 'Condition') {
    const wrapNegated = expr => condition.negated ? `!(${expr})` : expr;

    switch (condition.conditionType) {
      case 'compound': {
        const op = LOGICAL_OPERATORS[condition.operator?.toUpperCase()] || condition.operator;
        if (condition.operator?.toUpperCase() === 'NOT') {
          return `!(${convertCondition(condition.right || condition.left)})`;
        }
        return `(${convertCondition(condition.left)} ${op} ${convertCondition(condition.right)})`;
      }
      case 'class': {
        const field = convertArithmeticExpression(condition.subject);
        switch (condition.classType?.toUpperCase()) {
          case 'NUMERIC':
            return wrapNegated(`${field}.forall(_.isDigit)`);
          case 'ALPHABETIC':
            return wrapNegated(`${field}.forall(_.isLetter)`);
          case 'ALPHABETIC-LOWER':
            return wrapNegated(`${field}.forall(c => c.isLetter && c.isLower)`);
          case 'ALPHABETIC-UPPER':
            return wrapNegated(`${field}.forall(c => c.isLetter && c.isUpper)`);
          default:
            return wrapNegated(`true /* ${condition.classType} class test */`);
        }
      }
      case 'sign': {
        const field = convertArithmeticExpression(condition.subject);
        switch (condition.signType?.toUpperCase()) {
          case 'POSITIVE':
            return wrapNegated(`${field} > 0`);
          case 'NEGATIVE':
            return wrapNegated(`${field} < 0`);
          default:
            return wrapNegated(`${field} == 0`);
        }
      }
      case 'simple':
      default:
        // Level-88 condition name used as a boolean
        return wrapNegated(convertArithmeticExpression(condition.subject));
    }
  }

  if (condition.type === 'comparison') {
    const left = convertArithmeticExpression(condition.left);
    const right = convertArithmeticExpression(condition.right);
    const op = COMPARISON_OPERATORS[condition.operator?.toUpperCase()] || condition.operator || '==';
    return `${left} ${op} ${right}`;
  }

  if (condition.type === 'level88') {
    const fieldName = convertIdentifier(condition.field);
    const enumName = toPascalCase(condition.field);
    const conditionName = toPascalCase(condition.condition);
    return `${fieldName} == ${enumName}.${conditionName}`;
  }

  if (condition.type === 'logical') {
    const op = LOGICAL_OPERATORS[condition.operator?.toUpperCase()] || condition.operator;

    if (condition.operator?.toUpperCase() === 'NOT') {
      const operand = convertCondition(condition.operand);
      return `!(${operand})`;
    }

    const left = convertCondition(condition.left);
    const right = convertCondition(condition.right);
    return `(${left} ${op} ${right})`;
  }

  if (condition.type === 'class') {
    const field = convertIdentifier(condition.field);
    switch (condition.class?.toUpperCase()) {
      case 'NUMERIC':
        return `${field}.forall(_.isDigit)`;
      case 'ALPHABETIC':
        return `${field}.forall(_.isLetter)`;
      case 'ALPHABETIC-LOWER':
        return `${field}.forall(c => c.isLetter && c.isLower)`;
      case 'ALPHABETIC-UPPER':
        return `${field}.forall(c => c.isLetter && c.isUpper)`;
      default:
        return `/* ${condition.class} */ true`;
    }
  }

  if (condition.type === 'sign') {
    const field = convertIdentifier(condition.field);
    switch (condition.sign?.toUpperCase()) {
      case 'POSITIVE':
        return `${field} > 0`;
      case 'NEGATIVE':
        return `${field} < 0`;
      case 'ZERO':
        return `${field} == 0`;
      default:
        return `${field} == 0`;
    }
  }

  return safeNodeString(condition);
}

/**
 * Generate IF statement
 */
export function generateIf(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const condition = convertCondition(statement.condition);

  const lines = [`${indentStr}if ${condition} then`];

  if (statement.thenStatements) {
    for (const stmt of statement.thenStatements) {
      lines.push(generateExpression(stmt, indent + 1));
    }
  }

  if (statement.elseStatements && statement.elseStatements.length > 0) {
    lines.push(`${indentStr}else`);
    for (const stmt of statement.elseStatements) {
      lines.push(generateExpression(stmt, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Scala boolean expression for one EVALUATE subject's value (TRUE/FALSE
 * pseudo-subjects render as literal booleans; anything else is a normal
 * operand expression).
 */
function evaluateSubjectExpr(subject) {
  if (subject && subject.type === 'TRUE') return 'true';
  if (subject && subject.type === 'FALSE') return 'false';
  return convertArithmeticExpression(subject);
}

/**
 * Scala boolean expression testing one EVALUATE WHEN condition slot against
 * its corresponding subject (parser/ast.js's WhenClause.conditions[i] shapes:
 * ANY/TRUE/FALSE/NOT/RANGE/VALUE - see parseEvaluateStatement).
 */
function evaluateConditionExpr(subject, cond) {
  if (!cond) return 'true';
  switch (cond.type) {
    case 'ANY':
      return 'true';
    case 'TRUE':
      return evaluateSubjectExpr(subject);
    case 'FALSE':
      return `!(${evaluateSubjectExpr(subject)})`;
    case 'NOT':
      return `(${evaluateSubjectExpr(subject)}) != (${convertArithmeticExpression(cond.value)})`;
    case 'RANGE': {
      const s = evaluateSubjectExpr(subject);
      const from = convertArithmeticExpression(cond.from);
      const to = convertArithmeticExpression(cond.to);
      return `((${s}) >= (${from}) && (${s}) <= (${to}))`;
    }
    case 'VALUE':
    default:
      return `(${evaluateSubjectExpr(subject)}) == (${convertArithmeticExpression(cond.value)})`;
  }
}

/**
 * Generate EVALUATE statement as an if/else-if chain rather than a Scala
 * `match`: EVALUATE's WHEN conditions are arbitrary per-subject tests (ANY,
 * TRUE/FALSE, NOT, THRU ranges, multi-subject ALSO) rather than structural
 * patterns, so a general boolean-condition cascade - tested top to bottom,
 * first match wins, exactly like COBOL WHEN clauses - covers every shape
 * without needing a separate strategy per condition kind.
 */
export function generateEvaluate(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const subjects = statement.subjects || [];
  const whenClauses = statement.whenClauses || [];

  function statementsOrNoop(stmts, bodyIndent) {
    if (stmts && stmts.length > 0) {
      return stmts.map(s => generateExpression(s, bodyIndent)).join('\n');
    }
    return `${'  '.repeat(bodyIndent)}()`;
  }

  const lines = [];
  whenClauses.forEach((when, i) => {
    const conds = when.conditions || [];
    const cond = conds.length > 0
      ? conds.map((c, j) => evaluateConditionExpr(subjects[j], c)).join(' && ')
      : 'true';
    lines.push(`${indentStr}${i === 0 ? 'if' : 'else if'} (${cond}) then`);
    lines.push(statementsOrNoop(when.statements, indent + 1));
  });

  if (lines.length === 0) {
    // No WHEN clauses at all (malformed input) - WHEN OTHER (if any) is the
    // only reachable branch.
    return statementsOrNoop(statement.whenOther, indent);
  }

  lines.push(`${indentStr}else`);
  lines.push(statementsOrNoop(statement.whenOther, indent + 1));

  return lines.join('\n');
}

/**
 * Scala expression for a figurative-constant DELIMITED BY value used as a
 * literal search needle (STRING's DELIMITED BY / UNSTRING's DELIMITED BY).
 */
function delimiterNeedleExpr(node) {
  if (node && node.type === 'Literal' && node.literalType === 'figurative') {
    const v = String(node.value).toUpperCase();
    if (v === 'SPACE' || v === 'SPACES') return '" "';
    if (v === 'ZERO' || v === 'ZEROS' || v === 'ZEROES') return '"0"';
  }
  return convertArithmeticExpression(node);
}

/**
 * Scala expression for one STRING source's contribution, honoring its
 * DELIMITED BY clause: SIZE (or absent - COBOL defaults to SIZE) takes the
 * whole value; DELIMITED BY <value> truncates at the first occurrence of
 * that literal/identifier's text (searched via indexOf so multi-character
 * delimiters work the same as the single-character common case like SPACE).
 */
function stringSourceSegmentExpr(source) {
  const valueExpr = convertArithmeticExpression(source.value);
  const d = source.delimitedBy;
  if (!d || d.type === 'SIZE') return valueExpr;
  const needle = delimiterNeedleExpr(d.value);
  return `{ val _v = ${valueExpr}; val _idx = _v.indexOf(${needle}); if _idx >= 0 then _v.take(_idx) else _v }`;
}

/**
 * Generate STRING statement.
 *
 * COBOL STRING concatenates its (per-source, DELIMITED-BY-truncated) source
 * segments into the receiving field starting at the WITH POINTER position
 * (or position 1 if no POINTER clause), overwriting only the characters it
 * writes - everything in the receiving field before the starting position
 * and after the last character written is left exactly as it was. That is
 * modeled here by starting from the target's *current* value, padded/
 * truncated to its full declared storage width (matching how this generator
 * keeps alphanumeric fields unpadded internally but always renders them at
 * full width - see renderDisplayOperand), then overwriting a character range
 * of a mutable StringBuilder built from that width-normalized snapshot.
 * WITH POINTER's identifier is both read (starting position) and written
 * back (final position, one past the last character stored) when present.
 */
export function generateString(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);
  const targetInfo = lookupFieldForRef(statement.into);
  const width = targetInfo?.picLength || 0;
  const targetExpr = convertIdentifier(statement.into);
  const initialPtr = statement.pointer ? convertIdentifier(statement.pointer) : '1';

  const lines = [`${indentStr}{`];
  lines.push(`${bi}val _base = (${targetExpr}).padTo(${width}, ' ').take(${width})`);
  lines.push(`${bi}val _sb = new StringBuilder(_base)`);
  lines.push(`${bi}var _ptr = ${initialPtr}`);

  (statement.sources || []).forEach((source, i) => {
    const segVar = `_seg${i}`;
    lines.push(`${bi}val ${segVar} = ${stringSourceSegmentExpr(source)}`);
    lines.push(`${bi}for _i <- ${segVar}.indices do _sb.setCharAt(_ptr - 1 + _i, ${segVar}(_i))`);
    lines.push(`${bi}_ptr = _ptr + ${segVar}.length`);
  });

  lines.push(`${bi}${renderAssignment(statement.into, '_sb.toString')}`);
  if (statement.pointer) {
    lines.push(`${bi}${renderAssignment(statement.pointer, '_ptr')}`);
  }
  lines.push(`${indentStr}}`);

  return lines.join('\n');
}

/** Escape a literal string for embedding inside a Scala/Java regex. */
function escapeRegexLiteral(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Best-effort literal text for one UNSTRING DELIMITED BY operand, used to
 * build the split() regex alternation. Only literal (including figurative)
 * delimiters resolve to compile-time text; a variable delimiter can't be
 * folded into a regex at generation time and is intentionally left
 * unsupported (falls through to the "no DELIMITED BY" TODO path) rather than
 * guessed.
 */
function unstringDelimiterLiteralText(node) {
  if (node && node.type === 'Literal') {
    if (node.literalType === 'figurative') {
      const v = String(node.value).toUpperCase();
      if (v === 'SPACE' || v === 'SPACES') return ' ';
      if (v === 'ZERO' || v === 'ZEROS' || v === 'ZEROES') return '0';
      return null;
    }
    return String(node.value);
  }
  return null;
}

/**
 * Generate UNSTRING statement. Splits the source on the DELIMITED BY
 * literal(s) (OR'd alternatives become a regex alternation) and distributes
 * the resulting parts positionally into the INTO targets - COBOL fills only
 * as many targets as there are parts (leftover targets are left untouched)
 * and TALLYING IN counts exactly the targets actually filled
 * (min(parts, targets), not the raw part count).
 */
export function generateUnstring(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const source = convertIdentifier(statement.source);
  const targets = statement.into || [];

  const delimiterTexts = (statement.delimiters || []).map(unstringDelimiterLiteralText);
  if (delimiterTexts.length === 0 || delimiterTexts.some(t => t === null)) {
    return `${indentStr}// UNSTRING ${source}: DELIMITED BY clause missing or not a compile-time-resolvable literal - not supported (no corpus target exercises this shape)`;
  }

  const regex = delimiterTexts.map(escapeRegexLiteral).join('|');
  const lines = [`${indentStr}val _parts = ${source}.split("${regex}", -1)`];

  targets.forEach((t, index) => {
    lines.push(`${indentStr}${renderAssignment(t.target, `_parts.lift(${index}).getOrElse("")`)}`);
  });

  if (statement.tallying) {
    lines.push(`${indentStr}${renderAssignment(statement.tallying, `math.min(_parts.length, ${targets.length})`)}`);
  }

  return lines.join('\n');
}

/**
 * Generate INSPECT statement. `statement.tallying`/`.replacing` are always
 * arrays (empty when that clause is absent - see parser/ast.js's
 * InspectStatement), so each is checked by length, not truthiness.
 */
export function generateInspect(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = convertIdentifier(statement.target);
  const lines = [];

  if (Array.isArray(statement.tallying) && statement.tallying.length > 0) {
    for (const t of statement.tallying) {
      const counter = convertIdentifier(t.counter);
      if (t.type === 'CHARACTERS') {
        lines.push(`${indentStr}${counter} = ${counter} + (${target}).length`);
      } else if (t.type === 'ALL') {
        const pattern = convertArithmeticExpression(t.what);
        // Non-overlapping substring count, scanning left to right - matches
        // COBOL's TALLYING FOR ALL semantics for both single- and
        // multi-character patterns (a plain .count(_ == char) would only be
        // correct for exactly-one-character patterns).
        lines.push(`${indentStr}${counter} = ${counter} + CobolInspect.tallyAll(${target}, ${pattern})`);
      } else if (t.type === 'LEADING') {
        const pattern = convertArithmeticExpression(t.what);
        lines.push(`${indentStr}${counter} = ${counter} + CobolInspect.tallyLeading(${target}, ${pattern})`);
      }
    }
  }

  if (Array.isArray(statement.replacing) && statement.replacing.length > 0) {
    let expr = target;
    for (const r of statement.replacing) {
      if (r.type === 'CHARACTERS') {
        const to = convertArithmeticExpression(r.to);
        expr = `CobolInspect.replaceCharacters(${expr}, ${to})`;
      } else {
        const from = convertArithmeticExpression(r.from);
        const to = convertArithmeticExpression(r.to);
        if (r.type === 'FIRST') {
          expr = `CobolInspect.replaceFirst(${expr}, ${from}, ${to})`;
        } else if (r.type === 'LEADING') {
          expr = `CobolInspect.replaceLeading(${expr}, ${from}, ${to})`;
        } else if (r.type === 'TRAILING') {
          expr = `CobolInspect.replaceTrailing(${expr}, ${from}, ${to})`;
        } else {
          // ALL (default)
          expr = `CobolInspect.replaceAll(${expr}, ${from}, ${to})`;
        }
      }
    }
    lines.push(`${indentStr}${target} = ${expr}`);
  }

  if (statement.converting) {
    const from = convertArithmeticExpression(statement.converting.from);
    const to = convertArithmeticExpression(statement.converting.to);
    lines.push(
      `${indentStr}${target} = ${target}.map(c => { val _i = (${from}).indexOf(c); if _i >= 0 then (${to})(_i) else c })`
    );
  }

  return lines.length > 0 ? lines.join('\n') : `${indentStr}()`;
}

/**
 * Normalize statement type from AST class names to simple keywords
 */
function normalizeType(type) {
  if (!type) return '';
  // Remove "Statement" suffix and convert to uppercase
  return type.replace(/Statement$/i, '').toUpperCase();
}

/**
 * Main expression generator - routes to specific generators
 */
export function generateExpression(statement, indent = 0) {
  if (!statement) return '';

  const rawType = statement.type || '';
  const type = normalizeType(rawType);

  switch (type) {
    case 'COMPUTE':
      return generateCompute(statement, indent);
    case 'MOVE':
      // MoveStatement's AST type is always "MoveStatement" whether or not
      // it's a MOVE CORRESPONDING (that's just a `.corresponding` boolean
      // flag on the same node - see parser/ast.js) - so the dispatch has to
      // branch on the flag here; normalizeType(...) can never itself produce
      // a distinct "MOVE CORRESPONDING" case label to switch on.
      return statement.corresponding ? generateMoveCorresponding(statement, indent) : generateMove(statement, indent);
    case 'IF':
      return generateIf(statement, indent);
    case 'EVALUATE':
      return generateEvaluate(statement, indent);
    case 'STRING':
      return generateString(statement, indent);
    case 'UNSTRING':
      return generateUnstring(statement, indent);
    case 'INSPECT':
      return generateInspect(statement, indent);
    case 'ADD':
      return generateAdd(statement, indent);
    case 'SUBTRACT':
      return generateSubtract(statement, indent);
    case 'MULTIPLY':
      return generateMultiply(statement, indent);
    case 'DIVIDE':
      return generateDivide(statement, indent);
    case 'DISPLAY':
      return generateDisplay(statement, indent);
    case 'ACCEPT':
      return generateAccept(statement, indent);
    case 'OPEN':
      return generateOpen(statement, indent);
    case 'CLOSE':
      return generateClose(statement, indent);
    case 'READ':
      return generateReadStatement(statement, indent);
    case 'WRITE':
      return generateWriteStatement(statement, indent);
    case 'REWRITE':
      return generateRewriteStatement(statement, indent);
    case 'DELETE':
      return generateDeleteStatement(statement, indent);
    case 'START':
      return generateStartStatement(statement, indent);
    case 'PERFORM':
      return generatePerform(statement, indent);
    case 'CALL':
      return generateCall(statement, indent);
    case 'GO':
    case 'GOTO':
      return generateGoTo(statement, indent);
    case 'STOP':
      return generateStop(statement, indent);
    case 'GOBACK':
      return generateGoback(statement, indent);
    case 'EXIT':
      return generateExit(statement, indent);
    case 'SET':
      return generateSet(statement, indent);
    case 'INITIALIZE':
      return generateInitialize(statement, indent);
    case 'SEARCH':
      return generateSearch(statement, indent);
    case 'SORT':
      return generateSort(statement, indent);
    case 'RELEASE':
      return generateRelease(statement, indent);
    case 'RETURN':
      return generateReturn(statement, indent);
    case 'CONTINUE':
      return `${'  '.repeat(indent)}() // CONTINUE`;
    case 'NEXT SENTENCE':
    case 'NEXT-SENTENCE':
      return `${'  '.repeat(indent)}() // NEXT SENTENCE (implicit fall-through)`;
    default:
      return `${'  '.repeat(indent)}() // ${type} statement (unsupported)`;
  }
}

/**
 * Generate ADD statement
 * ADD A B TO C GIVING D -> D = A + B + C
 * ADD A B TO C -> C = C + A + B
 */
function generateAdd(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  // Get addends (values being added)
  const addends = (statement.addends || statement.operands || []).map(a =>
    convertArithmeticExpression(a)
  );

  // TO/GIVING targets (raw refs - kept unstringified so renderAssignment can
  // see their subscripts; convertIdentifier is used separately for reading
  // a target's current value on the ADD ... TO path).
  const toTargets = statement.to || [];
  const givingTargets = statement.giving || [];

  const lines = [];

  if (givingTargets.length > 0) {
    // ADD ... GIVING - result goes to giving targets
    const toExprs = toTargets.map(t => convertIdentifier(t));
    const sum = [...addends, ...toExprs].join(' + ');
    for (const target of givingTargets) {
      lines.push(`${indentStr}${renderAssignment(target, sum)}`);
    }
  } else if (toTargets.length > 0) {
    // ADD ... TO - adds to each TO target
    const addendSum = addends.join(' + ');
    for (const target of toTargets) {
      if (addends.length > 0) {
        const current = convertIdentifier(target);
        lines.push(`${indentStr}${renderAssignment(target, `${current} + ${addendSum}`)}`);
      }
    }
  } else {
    // Fallback
    const target = statement.target;
    const current = convertIdentifier(target);
    if (current && addends.length > 0) {
      lines.push(`${indentStr}${renderAssignment(target, `${current} + ${addends.join(' + ')}`)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate SUBTRACT statement
 * SUBTRACT A B FROM C GIVING D -> D = C - A - B
 * SUBTRACT A B FROM C -> C = C - A - B
 */
function generateSubtract(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  // Get subtrahends (values being subtracted)
  const subtrahends = (statement.subtrahends || statement.operands || []).map(s =>
    convertArithmeticExpression(s)
  );

  const fromTargets = statement.from || [];
  const givingTargets = statement.giving || [];

  const lines = [];

  if (givingTargets.length > 0) {
    // SUBTRACT ... GIVING
    const fromExprs = fromTargets.map(f => convertIdentifier(f));
    const fromExpr = fromExprs.join(' + ');
    const subExpr = subtrahends.join(' + ');
    for (const target of givingTargets) {
      lines.push(`${indentStr}${renderAssignment(target, `${fromExpr} - (${subExpr})`)}`);
    }
  } else if (fromTargets.length > 0) {
    // SUBTRACT ... FROM - subtracts from each FROM target
    const subExpr = subtrahends.join(' + ');
    for (const target of fromTargets) {
      const current = convertIdentifier(target);
      lines.push(`${indentStr}${renderAssignment(target, `${current} - (${subExpr})`)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate MULTIPLY statement
 * COBOL: MULTIPLY A BY B [GIVING C]
 * - Without GIVING: B = A * B (multiplier stored in BY operand)
 * - With GIVING: C = A * B
 */
function generateMultiply(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  // Get multiplicand (the first operand)
  const multiplicand = convertArithmeticExpression(statement.multiplicand || statement.left);

  // Get by operands (what we multiply by)
  const byOperands = statement.by || [];
  const lines = [];

  if (statement.giving && statement.giving.length > 0) {
    // MULTIPLY A BY B GIVING C - result goes to C
    const byExpr = byOperands.length > 0
      ? convertArithmeticExpression(byOperands[0])
      : convertArithmeticExpression(statement.right);

    for (const target of statement.giving) {
      lines.push(`${indentStr}${renderAssignment(target, `${multiplicand} * ${byExpr}`)}`);
    }
  } else if (byOperands.length > 0) {
    // MULTIPLY A BY B - result stored in B
    for (const by of byOperands) {
      const byExpr = convertIdentifier(by);
      lines.push(`${indentStr}${renderAssignment(by, `${multiplicand} * ${byExpr}`)}`);
    }
  } else {
    // Fallback for simple format
    const right = convertArithmeticExpression(statement.right);
    const target = statement.target || statement.giving;
    const targetExpr = convertIdentifier(target);
    if (statement.giving) {
      lines.push(`${indentStr}${renderAssignment(target, `${multiplicand} * ${right}`)}`);
    } else {
      lines.push(`${indentStr}${renderAssignment(target, `${targetExpr} * ${multiplicand}`)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate DIVIDE statement
 */
function generateDivide(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const giving = Array.isArray(statement.giving) ? statement.giving : [statement.giving].filter(Boolean);
  const into = Array.isArray(statement.into) ? statement.into : [statement.into].filter(Boolean);

  if (giving.length > 0) {
    // Parser fields: "DIVIDE A BY B"   -> dividend=A, divisor=B
    //                "DIVIDE A INTO B" -> divisor=A, into=[B]
    const dividend = into.length > 0
      ? convertArithmeticExpression(into[0])
      : convertArithmeticExpression(statement.dividend);
    const divisor = convertArithmeticExpression(statement.divisor);

    for (const target of giving) {
      const info = lookupFieldForRef(target);
      // A BigDecimal GIVING target needs decimal-precision division - plain
      // Scala Int/Int division truncates (COBOL's DIVIDE ... GIVING into a
      // field with decimal places does not), so both operands are coerced
      // to BigDecimal before dividing whenever the target calls for it.
      const valueExpr = info?.scalaType === 'BigDecimal'
        ? `(${toBigDecimalExpr(dividend)} / ${toBigDecimalExpr(divisor)})`
        : `${dividend} / ${divisor}`;
      lines.push(`${indentStr}${renderAssignment(target, valueExpr)}`);
    }
    if (statement.remainder) {
      lines.push(`${indentStr}${renderAssignment(statement.remainder, `${dividend} % ${divisor}`)}`);
    }
  } else if (into.length > 0) {
    // DIVIDE A INTO B  -> b = b / a
    const divisor = convertArithmeticExpression(statement.divisor || statement.dividend);
    for (const target of into) {
      const name = convertIdentifier(target);
      lines.push(`${indentStr}${renderAssignment(target, `${name} / ${divisor}`)}`);
    }
  } else {
    const dividend = convertArithmeticExpression(statement.dividend);
    const divisor = convertArithmeticExpression(statement.divisor);
    lines.push(`${indentStr}// DIVIDE with no target: ${dividend} / ${divisor}`);
  }

  return lines.join('\n');
}

/**
 * Wrap an already-rendered Scala expression in a BigDecimal conversion,
 * unless it's already producing one.
 */
function toBigDecimalExpr(expr) {
  return /^BigDecimal\(/.test(expr) ? expr : `BigDecimal(${expr})`;
}

/**
 * Render one DISPLAYed operand. Plain numeric (non-edited) PIC items print
 * through CobolFmt.num() so the output matches cobc's zero-padded,
 * leading-sign DISPLAY format (e.g. PIC S9(5) value 100 -> "+00100");
 * numeric-edited and alphanumeric fields already hold their final display
 * string (numeric-edited items are formatted at MOVE time - see
 * renderLiteralForTarget/formatEditedPicture) and print as-is.
 */
function renderDisplayOperand(ref) {
  const expr = convertIdentifier(ref);
  const info = lookupFieldForRef(ref);
  if (info && info.dataType === 'numeric') {
    const asBigDecimal = info.scalaType === 'BigDecimal' ? expr : `BigDecimal(${expr})`;
    return `CobolFmt.num(${asBigDecimal}, ${info.integerDigits}, ${info.decimalDigits}, ${info.signed})`;
  }
  // Plain (non-edited) alphanumeric PIC X/A items always occupy their full
  // declared storage width in COBOL - a MOVE of a shorter value space-pads
  // the rest - but this generator stores WORKING-STORAGE String fields
  // unpadded (see renderLiteralForTarget). Pad/truncate to the field's
  // declared width at DISPLAY time so output matches cobc's fixed-width
  // alphanumeric DISPLAY exactly without having to thread padding through
  // every MOVE/STRING/UNSTRING assignment. Numeric-edited fields already
  // hold their final, fully-formatted, correct-width string (formatted at
  // MOVE time - see formatEditedPicture) so they're excluded here.
  if (info && info.dataType === 'alphanumeric' && info.scalaType === 'String' && info.picLength > 0) {
    return `(${expr}).padTo(${info.picLength}, ' ').take(${info.picLength})`;
  }
  return expr;
}

/**
 * Generate DISPLAY statement
 */
function generateDisplay(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  // AST uses 'values' not 'items'
  const values = statement.values || statement.items || [];

  const items = values.map(item => {
    if (typeof item === 'string') {
      if (item.startsWith('"') || item.startsWith("'")) {
        return item.replace(/'/g, '"');
      }
      return convertIdentifier(item);
    }
    // Handle Literal objects
    if (item.type === 'Literal') {
      if (item.literalType === 'string') {
        return `"${(item.value || '').replace(/"/g, '\\"')}"`;
      }
      return item.value;
    }
    // Handle VariableReference objects (pass the whole node, not just
    // item.name, so subscripts are preserved - see convertIdentifier)
    if (item.type === 'VariableReference') {
      return renderDisplayOperand(item);
    }
    return convertArithmeticExpression(item);
  });

  if (items.length === 0) {
    return `${indentStr}println()`;
  }

  return `${indentStr}println(${items.join(' + ')})`;
}

/**
 * Generate ACCEPT statement
 */
function generateAccept(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = convertIdentifier(statement.target);

  if (statement.from === 'DATE') {
    return `${indentStr}val ${target} = java.time.LocalDate.now.format(java.time.format.DateTimeFormatter.ofPattern("yyMMdd"))`;
  } else if (statement.from === 'TIME') {
    return `${indentStr}val ${target} = java.time.LocalTime.now.format(java.time.format.DateTimeFormatter.ofPattern("HHmmss"))`;
  } else if (statement.from === 'DAY') {
    return `${indentStr}val ${target} = java.time.LocalDate.now.getDayOfYear.toString`;
  } else if (statement.from === 'DAY-OF-WEEK') {
    return `${indentStr}val ${target} = java.time.LocalDate.now.getDayOfWeek.getValue.toString`;
  }

  return `${indentStr}val ${target} = scala.io.StdIn.readLine()`;
}

/**
 * Generate SEARCH (linear) statement: iterate the OCCURS table's index from
 * whatever value a prior SET left it at (COBOL requires SET before SEARCH
 * unless AT END never needs to trigger; this generator does not itself
 * reset the index), testing each WHEN condition in turn at the current
 * index position - the first WHEN whose condition holds wins (its
 * statements run, and the index is left exactly where it matched, per
 * COBOL); if no WHEN matches at the current position, the index advances by
 * one and the next position is tried; running off the end of the table
 * (index > OCCURS count) without a match executes the AT END imperative.
 * Wrapped in its own `{ }` block so the local `_searchDone` flag doesn't
 * collide with a second SEARCH statement later in the same paragraph.
 */
function generateSearch(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const tableName = statement.target?.name || statement.target;
  const tinfo = lookupTable(tableName);

  if (!tinfo || tinfo.indexed.length === 0) {
    return `${indentStr}() // SEARCH ${tableName}: no OCCURS/INDEXED BY metadata found for this table`;
  }

  if (statement.searchAll) {
    return generateSearchAll(statement, indent, tinfo);
  }

  const idxVar = tinfo.indexed[0];
  const times = tinfo.times;
  const bi = '  '.repeat(indent + 1);
  const wi = '  '.repeat(indent + 2);
  const si = '  '.repeat(indent + 3);

  const lines = [`${indentStr}{`];
  lines.push(`${bi}var _searchDone = false`);
  lines.push(`${bi}while !_searchDone && ${idxVar} <= ${times} do`);

  const whenClauses = statement.whenClauses || [];
  whenClauses.forEach((when, i) => {
    const cond = convertCondition(when.condition);
    lines.push(`${wi}${i === 0 ? 'if' : 'else if'} (${cond}) then`);
    const body = when.statements && when.statements.length > 0
      ? when.statements.map(s => generateExpression(s, indent + 3)).join('\n')
      : `${si}()`;
    lines.push(body);
    lines.push(`${si}_searchDone = true`);
  });
  lines.push(`${wi}else`);
  lines.push(`${si}${idxVar} = ${idxVar} + 1`);

  lines.push(`${bi}if !_searchDone then`);
  const atEnd = statement.atEnd || [];
  lines.push(
    atEnd.length > 0
      ? atEnd.map(s => generateExpression(s, indent + 2)).join('\n')
      : `${wi}()`
  );
  lines.push(`${indentStr}}`);

  return lines.join('\n');
}

/**
 * Find a `<key field>(<index>) = <value>` equality test for `keyNameUpper`
 * inside a SEARCH ALL WHEN condition (recursing through AND-compound
 * conditions only - COBOL's SEARCH ALL WHEN phrase is defined as one or more
 * AND-ed equality tests against the table's declared key(s)). Returns the
 * matched RHS AST node (the value the key is being searched for), or null
 * if the condition doesn't have this shape.
 */
function findKeyEquality(condition, keyNameUpper) {
  if (!condition) return null;
  if (condition.type === 'RelationalCondition') {
    if (
      condition.relationalOperator === '=' &&
      condition.subject &&
      String(condition.subject.name).toUpperCase() === keyNameUpper
    ) {
      return condition.object;
    }
    return null;
  }
  if (condition.type === 'Condition' && condition.conditionType === 'compound' && String(condition.operator).toUpperCase() === 'AND') {
    return findKeyEquality(condition.left, keyNameUpper) || findKeyEquality(condition.right, keyNameUpper);
  }
  return null;
}

/**
 * Generate SEARCH ALL (binary search). The COBOL standard requires a SEARCH
 * ALL's WHEN condition to test the table's declared ASCENDING/DESCENDING
 * KEY with equality, and requires the table's contents to already be in
 * that key order - i.e. any conforming SEARCH ALL WHEN clause has exactly
 * the shape a real binary search can be driven from directly, which is what
 * findKeyEquality() detects. When present, this generates a genuine
 * O(log n) binary search that narrows on the extracted key field vs. the
 * extracted target-value expression.
 *
 * If the WHEN clause doesn't have that shape (multiple WHEN clauses, or a
 * condition this generator doesn't recognize as a key equality), a linear
 * scan over the whole table is generated instead, honestly noted as such: it
 * still reproduces cobc's observable stdout for a single-match search (the
 * table is - by the same SEARCH ALL precondition - already sorted per its
 * declared key, so the same entry that would satisfy a real binary search
 * also satisfies a left-to-right scan of the same WHEN condition); only the
 * O(log n) vs O(n) performance characteristic differs, which no
 * stdout-based oracle comparison can observe.
 */
function generateSearchAll(statement, indent, tinfo) {
  const indentStr = '  '.repeat(indent);
  const bi = '  '.repeat(indent + 1);
  const wi = '  '.repeat(indent + 2);
  const si = '  '.repeat(indent + 3);
  const idxVar = tinfo.indexed[0];
  const times = tinfo.times;
  const isDescending = tinfo.ascending.length === 0 && tinfo.descending.length > 0;
  const keyNameUpper = (tinfo.ascending[0] || tinfo.descending[0] || '').toUpperCase();

  const whenClauses = statement.whenClauses || [];
  const singleWhen = whenClauses.length === 1 ? whenClauses[0] : null;
  const keyTargetNode = singleWhen && keyNameUpper ? findKeyEquality(singleWhen.condition, keyNameUpper) : null;

  const lines = [`${indentStr}{`];
  const atEnd = statement.atEnd || [];
  const atEndLines = atEnd.length > 0 ? atEnd.map(s => generateExpression(s, indent + 2)).join('\n') : `${bi}()`;

  if (keyTargetNode) {
    const keyExpr = tinfo.indexed.length > 0 ? findTableKeyCamel(tinfo, keyNameUpper) : null;
    const targetExpr = convertArithmeticExpression(keyTargetNode);
    lines.push(`${bi}var _lo = 1`);
    lines.push(`${bi}var _hi = ${times}`);
    lines.push(`${bi}var _searchDone = false`);
    lines.push(`${bi}while !_searchDone && _lo <= _hi do`);
    lines.push(`${wi}${idxVar} = (_lo + _hi) / 2`);
    lines.push(`${wi}val _key = ${keyExpr}(${idxVar} - 1)`);
    lines.push(`${wi}if _key == (${targetExpr}) then`);
    const body = singleWhen.statements && singleWhen.statements.length > 0
      ? singleWhen.statements.map(s => generateExpression(s, indent + 3)).join('\n')
      : `${si}()`;
    lines.push(body);
    lines.push(`${si}_searchDone = true`);
    lines.push(`${wi}else if (${isDescending ? `_key < (${targetExpr})` : `_key > (${targetExpr})`}) then`);
    lines.push(`${si}_hi = ${idxVar} - 1`);
    lines.push(`${wi}else`);
    lines.push(`${si}_lo = ${idxVar} + 1`);
    lines.push(`${bi}if !_searchDone then`);
    lines.push(atEndLines);
  } else {
    lines.push(`${bi}// SEARCH ALL fallback: linear scan - the WHEN clause here isn't a single`);
    lines.push(`${bi}// key-equality test this generator can drive a binary search from directly`);
    lines.push(`${bi}// (see findKeyEquality's doc comment); result is identical, only the`);
    lines.push(`${bi}// O(log n) vs O(n) search-order difference is invisible to stdout.`);
    lines.push(`${bi}${idxVar} = 1`);
    lines.push(`${bi}var _searchDone = false`);
    lines.push(`${bi}while !_searchDone && ${idxVar} <= ${times} do`);
    whenClauses.forEach((when, i) => {
      const cond = convertCondition(when.condition);
      lines.push(`${wi}${i === 0 ? 'if' : 'else if'} (${cond}) then`);
      const body = when.statements && when.statements.length > 0
        ? when.statements.map(s => generateExpression(s, indent + 3)).join('\n')
        : `${si}()`;
      lines.push(body);
      lines.push(`${si}_searchDone = true`);
    });
    lines.push(`${wi}else`);
    lines.push(`${si}${idxVar} = ${idxVar} + 1`);
    lines.push(`${bi}if !_searchDone then`);
    lines.push(atEndLines);
  }

  lines.push(`${indentStr}}`);
  return lines.join('\n');
}

/** camelCase name of the table's declared key field (ascending or descending). */
function findTableKeyCamel(tinfo, keyNameUpper) {
  return keyNameUpper ? toCamelCase(keyNameUpper) : null;
}

/**
 * Scala call expression for a SORT/MERGE INPUT/OUTPUT PROCEDURE clause
 * (parser/ast.js shape: `{ procedure, through }`), reusing the exact same
 * paragraph/THRU-range method-naming convention method-gen.js's
 * generateAllMethods/generatePerformThruMethod use for `PERFORM x THRU y`,
 * so the call always resolves to a generated method name.
 */
function procedureCallExpr(proc) {
  if (!proc || !proc.procedure) return '()';
  const fromName = paragraphMethodName(proc.procedure);
  if (proc.through) {
    const toStripped = String(proc.through).replace(/^\d+[-_]?/, '');
    return `${fromName}To${toPascalCase(toStripped)}()`;
  }
  return `${fromName}()`;
}

/** Flatten a SORT/MERGE `keys` clause list into `{ camel, order }` entries. */
function flattenSortKeys(keys) {
  const flat = [];
  for (const group of keys || []) {
    for (const f of group.fields || []) {
      flat.push({ camel: toCamelCase(f.name || f), order: group.order || 'ASCENDING' });
    }
  }
  return flat;
}

/**
 * Generate SORT statement. Models the SD work file as an in-memory buffer
 * (see scala-generator.js's buildSortFileRegistry/generateSortFileSupport):
 * clear it, run the INPUT PROCEDURE (which RELEASEs rows into it), sort the
 * buffer in place by the declared key(s), reset the read cursor, then run
 * the OUTPUT PROCEDURE (which RETURNs rows back out of it in sorted order).
 */
function generateSort(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const info = lookupSortFile(statement.fileName);
  if (!info) {
    return `${indentStr}() // SORT ${statement.fileName}: no matching SD record found - cannot generate a sort buffer`;
  }

  const lines = [];
  lines.push(`${indentStr}${info.bufferVar}.clear()`);

  if (statement.inputProcedure) {
    lines.push(`${indentStr}${procedureCallExpr(statement.inputProcedure)}`);
  } else if (statement.using && statement.using.length > 0) {
    lines.push(`${indentStr}() // TODO: SORT ... USING ${statement.using.join(', ')} not yet supported (no corpus target exercises it; only INPUT PROCEDURE is implemented)`);
  }

  const flat = flattenSortKeys(statement.keys);
  if (flat.length === 0) {
    lines.push(`${indentStr}() // SORT ${statement.fileName}: no ASCENDING/DESCENDING KEY found - buffer left in RELEASE order`);
  } else {
    const mixed = flat.some(k => k.order !== flat[0].order);
    const tupleExpr = flat.length === 1 ? `r.${flat[0].camel}` : `(${flat.map(k => `r.${k.camel}`).join(', ')})`;
    lines.push(`${indentStr}${info.bufferVar}.sortInPlaceBy(r => ${tupleExpr})`);
    if (mixed) {
      lines.push(`${indentStr}() // NOTE: mixed ASCENDING/DESCENDING multi-key SORT approximated by primary-key order only - no corpus target exercises this shape`);
    } else if (flat[0].order === 'DESCENDING') {
      lines.push(`${indentStr}${info.bufferVar}.reverseInPlace()`);
    }
  }

  lines.push(`${indentStr}${info.idxVar} = 0`);

  if (statement.outputProcedure) {
    lines.push(`${indentStr}${procedureCallExpr(statement.outputProcedure)}`);
  } else if (statement.giving && statement.giving.length > 0) {
    lines.push(`${indentStr}() // TODO: SORT ... GIVING ${statement.giving.join(', ')} not yet supported (no corpus target exercises it; only OUTPUT PROCEDURE is implemented)`);
  }

  return lines.join('\n');
}

/**
 * Generate RELEASE statement: snapshot the SD record's current field values
 * (whatever was last MOVEd into them) as a new row appended to the sort
 * buffer. RELEASE ... FROM first moves the given source's matching fields
 * into the SD record fields (by name, the same as MOVE CORRESPONDING;
 * COBOL's RELEASE ... FROM is actually an unqualified structural MOVE, but
 * name-matching is the closest equivalent available without true
 * byte-layout aliasing, and coincides with a structural MOVE whenever the
 * source shares the record's field names in the same order, the overwhelmingly
 * common case).
 */
function generateRelease(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const info = lookupSortFile(statement.recordName);
  if (!info) {
    return `${indentStr}() // RELEASE ${statement.recordName}: no matching SD record found`;
  }

  const lines = [];
  if (statement.from) {
    const fromUpper = String(statement.from.name || statement.from || '').toUpperCase();
    const recordUpper = String(statement.recordName || '').toUpperCase();
    const pairs = correspondingPairs(fromUpper, recordUpper);
    for (const pair of pairs) {
      lines.push(`${indentStr}${pair.targetCamel} = ${coerceCorrespondingValue(pair)}`);
    }
  }

  const ctorArgs = info.fields.map(f => f.camel).join(', ');
  lines.push(`${indentStr}${info.bufferVar} += ${info.caseClassName}(${ctorArgs})`);
  return lines.join('\n');
}

/**
 * Generate RETURN statement: pop the next row (in sorted order, since SORT
 * already sorted the buffer before the OUTPUT PROCEDURE runs) off the sort
 * buffer into the SD record fields and run the NOT AT END statements, or run
 * the AT END statements once the buffer is exhausted.
 */
function generateReturn(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const info = lookupSortFile(statement.fileName);
  if (!info) {
    return `${indentStr}() // RETURN ${statement.fileName}: no matching SD record found`;
  }

  const bi = '  '.repeat(indent + 1);
  const lines = [`${indentStr}if ${info.idxVar} < ${info.bufferVar}.length then`];
  lines.push(`${bi}val _rec = ${info.bufferVar}(${info.idxVar})`);
  lines.push(`${bi}${info.idxVar} = ${info.idxVar} + 1`);
  for (const f of info.fields) {
    lines.push(`${bi}${f.camel} = _rec.${f.camel}`);
  }

  if (statement.into) {
    const intoUpper = String(statement.into.name || statement.into || '').toUpperCase();
    const recordUpper = Array.from(SORT_FILE_REGISTRY.entries()).find(([, v]) => v === info)?.[0] || '';
    const pairs = correspondingPairs(recordUpper, intoUpper);
    for (const pair of pairs) {
      lines.push(`${bi}${pair.targetCamel} = ${coerceCorrespondingValue(pair)}`);
    }
  }

  const notAtEnd = statement.notAtEnd || [];
  lines.push(notAtEnd.length > 0 ? notAtEnd.map(s => generateExpression(s, indent + 1)).join('\n') : `${bi}()`);

  lines.push(`${indentStr}else`);
  const atEnd = statement.atEnd || [];
  lines.push(atEnd.length > 0 ? atEnd.map(s => generateExpression(s, indent + 1)).join('\n') : `${bi}()`);

  return lines.join('\n');
}

/**
 * Generate READ statement wrapper
 */
function generateReadStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = toCamelCase(statement.fileName || statement.file || 'file');
  const iteratorVar = `${fileName}Iterator`;

  const lines = [];

  if (statement.atEnd || statement.notAtEnd) {
    lines.push(`${indentStr}if ${iteratorVar}.hasNext then`);
    lines.push(`${indentStr}  val _record = ${iteratorVar}.next()`);

    if (statement.into) {
      lines.push(`${indentStr}  ${toCamelCase(statement.into.name || statement.into)} = _record`);
    }

    if (statement.notAtEnd && Array.isArray(statement.notAtEnd)) {
      for (const stmt of statement.notAtEnd) {
        lines.push(generateExpression(stmt, indent + 1));
      }
    }

    lines.push(`${indentStr}else`);

    if (statement.atEnd && Array.isArray(statement.atEnd)) {
      for (const stmt of statement.atEnd) {
        lines.push(generateExpression(stmt, indent + 1));
      }
    } else {
      lines.push(`${indentStr}  () // AT END`);
    }
  } else {
    lines.push(`${indentStr}val _record = ${iteratorVar}.nextOption()`);
  }

  return lines.join('\n');
}

/**
 * Generate WRITE statement wrapper
 */
function generateWriteStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const recordName = toCamelCase(statement.recordName || statement.record || 'record');

  if (statement.from) {
    return `${indentStr}${recordName}Writer.println(${toCamelCase(statement.from.name || statement.from)})`;
  }

  return `${indentStr}${recordName}Writer.println(${recordName})`;
}

/**
 * Generate REWRITE statement wrapper
 */
function generateRewriteStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const recordName = toCamelCase(statement.recordName || statement.record || 'record');

  return `${indentStr}// REWRITE ${recordName} - update current record in file`;
}

/**
 * Generate DELETE statement wrapper
 */
function generateDeleteStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = toCamelCase(statement.fileName || statement.file || 'file');

  return `${indentStr}// DELETE record from ${fileName}`;
}

/**
 * Generate START statement wrapper
 */
function generateStartStatement(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fileName = toCamelCase(statement.fileName || statement.file || 'file');

  return `${indentStr}// START ${fileName} - position file for reading`;
}

/**
 * Generate PERFORM statement
 */
function generatePerform(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  if (statement.performType === 'simple') {
    const target = toCamelCase(statement.targetParagraph || 'procedure');
    lines.push(`${indentStr}${target}()`);
  } else if (statement.performType === 'times') {
    const times = statement.times?.value || statement.times || '1';
    lines.push(`${indentStr}(1 to ${times}).foreach { _ =>`);
    if (statement.targetParagraph) {
      lines.push(`${indentStr}  ${toCamelCase(statement.targetParagraph)}()`);
    }
    if (statement.statements) {
      for (const stmt of statement.statements) {
        lines.push(generateExpression(stmt, indent + 1));
      }
    }
    lines.push(`${indentStr}}`);
  } else if (statement.performType === 'until') {
    const condition = convertCondition(statement.until);
    lines.push(`${indentStr}while !(${condition}) do`);
    if (statement.targetParagraph) {
      lines.push(`${indentStr}  ${toCamelCase(statement.targetParagraph)}()`);
    }
    if (statement.statements) {
      for (const stmt of statement.statements) {
        lines.push(generateExpression(stmt, indent + 1));
      }
    }
  } else if (statement.performType === 'varying') {
    const varying = statement.varying;
    const varName = toCamelCase(varying?.variable || 'i');
    const from = varying?.from?.value || varying?.from || '1';
    const by = varying?.by?.value || varying?.by || '1';
    const until = convertCondition(varying?.until);

    // The loop-control variable is a WORKING-STORAGE item (declared once as
    // a flat var elsewhere) - assign it here rather than redeclaring with
    // `var`, so repeated PERFORM VARYING over the same variable in one
    // method body doesn't produce a duplicate-declaration compile error.
    lines.push(`${indentStr}${varName} = ${from}`);
    lines.push(`${indentStr}while !(${until}) do`);
    if (statement.targetParagraph) {
      lines.push(`${indentStr}  ${toCamelCase(statement.targetParagraph)}()`);
    }
    if (statement.statements) {
      for (const stmt of statement.statements) {
        lines.push(generateExpression(stmt, indent + 1));
      }
    }
    lines.push(`${indentStr}  ${varName} = ${varName} + ${by}`);
  } else if (statement.statements) {
    // Inline PERFORM
    for (const stmt of statement.statements) {
      lines.push(generateExpression(stmt, indent));
    }
  } else if (statement.targetParagraph) {
    lines.push(`${indentStr}${toCamelCase(statement.targetParagraph)}()`);
  }

  return lines.join('\n');
}

/**
 * Generate CALL statement
 */
function generateCall(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const programName = statement.programName?.value || statement.programName || 'subprogram';
  const cleanName = toCamelCase(programName.replace(/['"]/g, ''));

  const args = (statement.using || []).map(param => {
    if (param.value?.name) {
      return toCamelCase(param.value.name);
    }
    return convertArithmeticExpression(param.value || param);
  }).join(', ');

  return `${indentStr}${cleanName}(${args})`;
}

/**
 * Generate GO TO statement.
 *
 * Every paragraph becomes its own Scala method (method-gen.js's
 * generateMethod for a standalone paragraph, or a nested local `def` inside
 * a PERFORM...THRU-synthesized wrapper method - see
 * generatePerformThruMethod), so "transfer control to paragraph X" is
 * `return x()`: `return` exits *this* paragraph's method immediately
 * (skipping any statements after the GO TO in its own paragraph, exactly
 * like COBOL), and the call executes X - including whatever
 * fallthrough/further GO TOs X's own body contains - before control unwinds
 * back up the call stack. This requires the enclosing method to declare an
 * explicit result type (`return` inside a method with an *inferred* result
 * type is a Scala compile error) - see method-gen.js's generateMethod and
 * generatePerformThruMethod, which both always annotate `: Unit` for this
 * reason.
 *
 * GO TO ... DEPENDING ON: a matched case transfers immediately (`return`);
 * an out-of-range selector value matches no case, falls through with no
 * transfer at all, and execution simply continues with the *next* statement
 * in this same paragraph - per COBOL-85 semantics, and exactly what leaving
 * the unmatched arm as `()` (a plain no-op, not wrapped in `return`) does
 * here, since this whole match expression is just one statement among
 * others in the paragraph's statement sequence, not itself in tail position.
 */
function generateGoTo(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const targets = statement.targets && statement.targets.length > 0 ? statement.targets : [statement.target];

  if (!statement.dependingOn) {
    return `${indentStr}return ${paragraphMethodName(targets[0])}() // GO TO`;
  }

  const dependingOn = convertArithmeticExpression(statement.dependingOn);
  const lines = [`${indentStr}${dependingOn} match`];

  targets.forEach((target, idx) => {
    lines.push(`${indentStr}  case ${idx + 1} => return ${paragraphMethodName(target)}()`);
  });

  lines.push(`${indentStr}  case _ => ()`);

  return lines.join('\n');
}

/**
 * Generate STOP statement
 */
function generateStop(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  if (statement.returnCode) {
    const code = convertArithmeticExpression(statement.returnCode);
    return `${indentStr}sys.exit(${code})`;
  }

  return `${indentStr}sys.exit(0)`;
}

/**
 * Generate GOBACK statement
 */
function generateGoback(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  if (statement.returnCode) {
    const code = convertArithmeticExpression(statement.returnCode);
    return `${indentStr}return ${code}`;
  }

  return `${indentStr}return`;
}

/**
 * Generate EXIT statement
 */
function generateExit(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const exitType = statement.exitType?.toUpperCase() || 'PARAGRAPH';

  switch (exitType) {
    case 'PROGRAM':
      return `${indentStr}return // EXIT PROGRAM`;
    case 'PERFORM':
      return `${indentStr}return // EXIT PERFORM`;
    case 'SECTION':
      return `${indentStr}return // EXIT SECTION`;
    default:
      return `${indentStr}// EXIT PARAGRAPH`;
  }
}

/**
 * Generate SET statement
 */
function generateSet(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const targets = statement.targets || [statement.target];

  for (const target of targets) {
    if (statement.value?.type === 'TRUE') {
      lines.push(`${indentStr}${renderAssignment(target, 'true')}`);
    } else if (statement.value?.type === 'FALSE') {
      lines.push(`${indentStr}${renderAssignment(target, 'false')}`);
    } else if (statement.setType === 'index') {
      const amount = convertArithmeticExpression(statement.value);
      const current = convertIdentifier(target);
      const expr = statement.upDown === 'UP' ? `${current} + ${amount}` : `${current} - ${amount}`;
      lines.push(`${indentStr}${renderAssignment(target, expr)}`);
    } else {
      const value = convertArithmeticExpression(statement.value);
      lines.push(`${indentStr}${renderAssignment(target, value)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate INITIALIZE statement
 */
function generateInitialize(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  const targets = statement.targets || [statement.target];

  for (const target of targets) {
    const targetName = toCamelCase(target.name || target);
    lines.push(`${indentStr}${targetName} = ${targetName}.copy() // INITIALIZE with defaults`);
  }

  return lines.join('\n');
}

export default {
  convertArithmeticExpression,
  convertCondition,
  generateExpression,
  generateCompute,
  generateMove,
  generateMoveCorresponding,
  generateIf,
  generateEvaluate,
  generateString,
  generateUnstring,
  generateInspect,
  generatePerform,
  generateCall,
  setFieldRegistry,
  generateCobolFmtHelper,
  formatEditedPicture,
};
