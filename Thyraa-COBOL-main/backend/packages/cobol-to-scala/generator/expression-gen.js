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
    if (cobolId.qualifiers && cobolId.qualifiers.length > 0) {
      const qualPath = cobolId.qualifiers.map(q => toCamelCase(q)).join('.');
      return `${qualPath}.${toCamelCase(name)}`;
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

  return String(cobolId);
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

  return String(value);
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

  return String(expr);
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
 * Generate COMPUTE statement
 */
export function generateCompute(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = convertIdentifier(statement.target);
  const expression = convertArithmeticExpression(statement.expression);

  // Determine if it's a val or var assignment
  const keyword = statement.isNew ? 'val' : '';

  if (keyword) {
    return `${indentStr}${keyword} ${target} = ${expression}`;
  }
  return `${indentStr}${target} = ${expression}`;
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
    const targetName = convertIdentifier(target);
    let sourceExpr;

    if (typeof source === 'object' && source.type === 'literal') {
      sourceExpr = convertLiteral(source.value);
    } else if (typeof source === 'string') {
      // Check for special values
      if (source.toUpperCase() === 'SPACES') {
        sourceExpr = '""';
      } else if (source.toUpperCase() === 'ZEROS' || source.toUpperCase() === 'ZEROES') {
        sourceExpr = '0';
      } else if (source.toUpperCase() === 'HIGH-VALUES') {
        sourceExpr = 'Char.MaxValue.toString';
      } else if (source.toUpperCase() === 'LOW-VALUES') {
        sourceExpr = 'Char.MinValue.toString';
      } else {
        sourceExpr = convertIdentifier(source);
      }
    } else {
      sourceExpr = convertArithmeticExpression(source);
    }

    lines.push(`${indentStr}${targetName} = ${sourceExpr}`);
  }

  return lines.join('\n');
}

/**
 * Generate MOVE CORRESPONDING statement
 */
export function generateMoveCorresponding(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const source = convertIdentifier(statement.source);
  const target = convertIdentifier(statement.target);

  return `${indentStr}// MOVE CORRESPONDING ${source} TO ${target}
${indentStr}${target} = ${target}.copy(
${indentStr}  // Copy matching fields from ${source}
${indentStr})`;
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

  return String(condition);
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
 * Generate EVALUATE (switch/match) statement
 */
export function generateEvaluate(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const subject = convertArithmeticExpression(statement.subject);

  const lines = [`${indentStr}${subject} match`];

  if (statement.cases) {
    for (const caseItem of statement.cases) {
      if (caseItem.isOther) {
        lines.push(`${indentStr}  case _ =>`);
      } else {
        const values = Array.isArray(caseItem.values) ? caseItem.values : [caseItem.value];
        const patterns = values.map(v => {
          if (typeof v === 'object' && v.through) {
            // Range case
            return `n if n >= ${convertLiteral(v.from)} && n <= ${convertLiteral(v.through)}`;
          }
          return convertLiteral(v);
        }).join(' | ');

        lines.push(`${indentStr}  case ${patterns} =>`);
      }

      if (caseItem.statements) {
        for (const stmt of caseItem.statements) {
          lines.push(generateExpression(stmt, indent + 2));
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate STRING statement
 */
export function generateString(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = convertIdentifier(statement.target);

  const parts = statement.sources.map(source => {
    if (source.delimitedBy === 'SIZE') {
      return convertIdentifier(source.value);
    } else if (source.delimitedBy) {
      return `${convertIdentifier(source.value)}.takeWhile(_ != ${convertLiteral(source.delimitedBy)})`;
    }
    return convertIdentifier(source.value);
  });

  return `${indentStr}${target} = ${parts.join(' + ')}`;
}

/**
 * Generate UNSTRING statement
 */
export function generateUnstring(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const source = convertIdentifier(statement.source);
  const delimiter = statement.delimiters?.[0] || ' ';
  const targets = statement.targets.map(t => convertIdentifier(t.name));

  const lines = [
    `${indentStr}val _parts = ${source}.split(${convertLiteral(delimiter)})`
  ];

  targets.forEach((target, index) => {
    lines.push(`${indentStr}${target} = _parts.lift(${index}).getOrElse("")`);
  });

  return lines.join('\n');
}

/**
 * Generate INSPECT statement
 */
export function generateInspect(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = convertIdentifier(statement.target);

  if (statement.tallying) {
    // INSPECT TALLYING (count)
    const counter = convertIdentifier(statement.tallying.counter);
    const pattern = convertLiteral(statement.tallying.pattern);
    return `${indentStr}${counter} = ${target}.count(_ == ${pattern}.head)`;
  }

  if (statement.replacing) {
    // INSPECT REPLACING
    const replacements = statement.replacing.map(r => {
      const from = convertLiteral(r.from);
      const to = convertLiteral(r.to);
      if (r.type === 'ALL') {
        return `.replace(${from}, ${to})`;
      } else if (r.type === 'FIRST') {
        return `.replaceFirst(${from}, ${to})`;
      } else if (r.type === 'LEADING') {
        return `.replaceFirst(s"^${from}+", ${to})`;
      } else if (r.type === 'TRAILING') {
        return `.replaceFirst(s"${from}+$$", ${to})`;
      }
      return `.replace(${from}, ${to})`;
    });

    return `${indentStr}${target} = ${target}${replacements.join('')}`;
  }

  if (statement.converting) {
    // INSPECT CONVERTING
    const from = convertLiteral(statement.converting.from);
    const to = convertLiteral(statement.converting.to);
    return `${indentStr}${target} = ${target}.map(c => ${from}.indexOf(c) match { case -1 => c; case i => ${to}(i) })`;
  }

  return `${indentStr}// INSPECT ${target}`;
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
      return generateMove(statement, indent);
    case 'MOVE CORRESPONDING':
    case 'MOVE-CORRESPONDING':
      return generateMoveCorresponding(statement, indent);
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
    case 'CONTINUE':
      return `${'  '.repeat(indent)}// CONTINUE`;
    case 'NEXT SENTENCE':
    case 'NEXT-SENTENCE':
      return `${'  '.repeat(indent)}// NEXT SENTENCE (implicit fall-through)`;
    default:
      return `${'  '.repeat(indent)}// ${type} statement`;
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

  // Get TO targets
  const toTargets = (statement.to || []).map(t => convertIdentifier(t));

  // Get GIVING targets
  const givingTargets = (statement.giving || []).map(g => convertIdentifier(g));

  const lines = [];

  if (givingTargets.length > 0) {
    // ADD ... GIVING - result goes to giving targets
    const sum = [...addends, ...toTargets].join(' + ');
    for (const target of givingTargets) {
      lines.push(`${indentStr}${target} = ${sum}`);
    }
  } else if (toTargets.length > 0) {
    // ADD ... TO - adds to each TO target
    const addendSum = addends.join(' + ');
    for (const target of toTargets) {
      if (addends.length > 0) {
        lines.push(`${indentStr}${target} = ${target} + ${addendSum}`);
      }
    }
  } else {
    // Fallback
    const target = convertIdentifier(statement.target);
    if (target && addends.length > 0) {
      lines.push(`${indentStr}${target} = ${target} + ${addends.join(' + ')}`);
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

  // Get FROM targets
  const fromTargets = (statement.from || []).map(f => convertIdentifier(f));

  // Get GIVING targets
  const givingTargets = (statement.giving || []).map(g => convertIdentifier(g));

  const lines = [];

  if (givingTargets.length > 0) {
    // SUBTRACT ... GIVING
    const fromExpr = fromTargets.join(' + ');
    const subExpr = subtrahends.join(' + ');
    for (const target of givingTargets) {
      lines.push(`${indentStr}${target} = ${fromExpr} - (${subExpr})`);
    }
  } else if (fromTargets.length > 0) {
    // SUBTRACT ... FROM - subtracts from each FROM target
    const subExpr = subtrahends.join(' + ');
    for (const target of fromTargets) {
      lines.push(`${indentStr}${target} = ${target} - (${subExpr})`);
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
      const targetName = convertIdentifier(target.name || target);
      lines.push(`${indentStr}${targetName} = ${multiplicand} * ${byExpr}`);
    }
  } else if (byOperands.length > 0) {
    // MULTIPLY A BY B - result stored in B
    for (const by of byOperands) {
      const byName = convertIdentifier(by.name || by);
      lines.push(`${indentStr}${byName} = ${multiplicand} * ${byName}`);
    }
  } else {
    // Fallback for simple format
    const right = convertArithmeticExpression(statement.right);
    const target = convertIdentifier(statement.target || statement.giving);
    if (statement.giving) {
      lines.push(`${indentStr}${target} = ${multiplicand} * ${right}`);
    } else {
      lines.push(`${indentStr}${target} = ${target} * ${multiplicand}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate DIVIDE statement
 */
function generateDivide(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const dividend = convertArithmeticExpression(statement.dividend);
  const divisor = convertArithmeticExpression(statement.divisor);
  const target = convertIdentifier(statement.target || statement.giving);

  let result = `${indentStr}`;

  if (statement.giving) {
    result += `val ${target} = ${dividend} / ${divisor}`;
  } else {
    result += `${target} = ${dividend} / ${divisor}`;
  }

  if (statement.remainder) {
    const remainder = convertIdentifier(statement.remainder);
    result += `\n${indentStr}val ${remainder} = ${dividend} % ${divisor}`;
  }

  return result;
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
    // Handle VariableReference objects
    if (item.type === 'VariableReference') {
      return convertIdentifier(item.name);
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

    lines.push(`${indentStr}var ${varName} = ${from}`);
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
 * Generate GO TO statement
 */
function generateGoTo(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const targets = statement.targets || [statement.target];

  if (targets.length === 1) {
    return `${indentStr}return ${toCamelCase(targets[0])}() // GO TO`;
  }

  // GO TO ... DEPENDING ON
  const dependingOn = convertIdentifier(statement.dependingOn?.name || statement.dependingOn);
  const lines = [`${indentStr}${dependingOn} match`];

  targets.forEach((target, idx) => {
    lines.push(`${indentStr}  case ${idx + 1} => ${toCamelCase(target)}()`);
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
    const targetName = toCamelCase(target.name || target);

    if (statement.value?.type === 'TRUE') {
      lines.push(`${indentStr}${targetName} = true`);
    } else if (statement.value?.type === 'FALSE') {
      lines.push(`${indentStr}${targetName} = false`);
    } else if (statement.setType === 'index') {
      const amount = convertArithmeticExpression(statement.value);
      if (statement.upDown === 'UP') {
        lines.push(`${indentStr}${targetName} = ${targetName} + ${amount}`);
      } else {
        lines.push(`${indentStr}${targetName} = ${targetName} - ${amount}`);
      }
    } else {
      const value = convertArithmeticExpression(statement.value);
      lines.push(`${indentStr}${targetName} = ${value}`);
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
  generateCall
};
