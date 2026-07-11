/**
 * method-gen.js
 * Convert COBOL paragraphs/procedures to Scala methods
 */

import { toCamelCase, toPascalCase, mapCobolTypeToScala } from './case-class-gen.js';
import { generateExpression, convertCondition } from './expression-gen.js';

/**
 * Convert COBOL paragraph name to Scala method name
 * Removes numeric prefixes like "1000-" and converts to camelCase
 * 1000-PROCESS-RECORD -> processRecord
 */
export function toMethodName(paragraphName) {
  if (!paragraphName) return '';

  // Remove leading numeric prefix (e.g., "1000-", "0100-")
  let name = paragraphName.replace(/^\d+[-_]?/, '');

  // If the entire name was numeric, keep it but prefix with underscore
  if (!name) {
    name = '_' + paragraphName;
  }

  return toCamelCase(name);
}

/**
 * Analyze a procedure to determine its parameters
 */
function analyzeParameters(procedure) {
  const params = [];

  if (procedure.using) {
    for (const param of procedure.using) {
      params.push({
        name: toCamelCase(param.name),
        type: mapCobolTypeToScala(param),
        byReference: param.byReference !== false,
        cobolName: param.name
      });
    }
  }

  return params;
}

/**
 * Analyze a procedure to determine its return type
 */
function analyzeReturnType(procedure) {
  // Check for explicit RETURNING clause
  if (procedure.returning) {
    return mapCobolTypeToScala(procedure.returning);
  }

  // Check statements for STOP RUN or EXIT
  if (procedure.statements) {
    for (const stmt of procedure.statements) {
      if (stmt.type === 'STOP RUN' || stmt.type === 'STOP-RUN') {
        return 'Unit';
      }
      if (stmt.type === 'GOBACK') {
        return 'Unit';
      }
    }
  }

  // Default to Unit
  return 'Unit';
}

/**
 * Generate a PERFORM statement
 */
function generatePerform(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = toMethodName(statement.target);

  // Simple PERFORM
  if (!statement.times && !statement.until && !statement.varying) {
    if (statement.thru) {
      // PERFORM THRU - call all paragraphs in range
      const thruTarget = toMethodName(statement.thru);
      return `${indentStr}${target}To${toPascalCase(statement.thru)}()`;
    }
    return `${indentStr}${target}()`;
  }

  // PERFORM TIMES
  if (statement.times) {
    const times = typeof statement.times === 'number'
      ? statement.times
      : toCamelCase(statement.times);

    return `${indentStr}(1 to ${times}).foreach { _ =>
${indentStr}  ${target}()
${indentStr}}`;
  }

  // PERFORM UNTIL
  if (statement.until) {
    const condition = convertCondition(statement.until);
    const testBefore = statement.testBefore !== false;

    if (testBefore) {
      return `${indentStr}while !${condition.startsWith('(') ? condition : `(${condition})`} do
${indentStr}  ${target}()`;
    } else {
      // Test after (DO WHILE equivalent)
      return `${indentStr}do
${indentStr}  ${target}()
${indentStr}while !${condition.startsWith('(') ? condition : `(${condition})`}`;
    }
  }

  // PERFORM VARYING
  if (statement.varying) {
    const varName = toCamelCase(statement.varying.variable);
    const from = statement.varying.from || 1;
    const by = statement.varying.by || 1;
    const until = convertCondition(statement.varying.until);

    if (by === 1) {
      return `${indentStr}var ${varName} = ${from}
${indentStr}while !${until.startsWith('(') ? until : `(${until})`} do
${indentStr}  ${target}()
${indentStr}  ${varName} += 1`;
    } else {
      return `${indentStr}var ${varName} = ${from}
${indentStr}while !${until.startsWith('(') ? until : `(${until})`} do
${indentStr}  ${target}()
${indentStr}  ${varName} += ${by}`;
    }
  }

  return `${indentStr}${target}()`;
}

/**
 * Normalize statement type from AST class names to simple keywords
 * e.g., "PerformStatement" -> "PERFORM", "IfStatement" -> "IF"
 */
function normalizeStatementType(type) {
  if (!type) return '';
  // Remove "Statement" suffix and convert to uppercase
  return type.replace(/Statement$/i, '').toUpperCase();
}

/**
 * Generate method body from procedure statements
 */
function generateMethodBody(statements, indent = 1) {
  if (!statements || statements.length === 0) {
    return '  '.repeat(indent) + '()';
  }

  const lines = [];

  for (const stmt of statements) {
    const rawType = stmt.type || '';
    const type = normalizeStatementType(rawType);

    switch (type) {
      case 'PERFORM':
        lines.push(generatePerformFromAST(stmt, indent));
        break;

      case 'STOP':
        if (stmt.stopType === 'RUN') {
          lines.push('  '.repeat(indent) + 'sys.exit(0)');
        } else {
          lines.push('  '.repeat(indent) + `sys.exit(${stmt.returnCode || 0})`);
        }
        break;

      case 'GOBACK':
        lines.push('  '.repeat(indent) + 'return');
        break;

      case 'EXIT':
        if (stmt.exitType === 'PROGRAM') {
          lines.push('  '.repeat(indent) + 'return');
        } else {
          lines.push('  '.repeat(indent) + '// EXIT');
        }
        break;

      case 'CONTINUE':
        lines.push('  '.repeat(indent) + '// continue');
        break;

      case 'INITIALIZE':
        lines.push(generateInitialize(stmt, indent));
        break;

      case 'SET':
        lines.push(generateSet(stmt, indent));
        break;

      case 'CALL':
        lines.push(generateCall(stmt, indent));
        break;

      default:
        // Delegate to expression generator for other statements
        const expr = generateExpression(stmt, indent);
        if (expr) {
          lines.push(expr);
        }
    }
  }

  return lines.join('\n');
}

/**
 * Render the body of a PERFORM (paragraph call, or the inline statement
 * block for a `PERFORM ... END-PERFORM` form) at the given indent. Mirrors
 * generateMethodBody's own empty-body fallback so a loop with neither a
 * target paragraph nor inline statements still produces valid Scala.
 */
function performBodyLines(stmt, indent) {
  if (stmt.targetParagraph) {
    return `${'  '.repeat(indent)}${toMethodName(stmt.targetParagraph)}()`;
  }
  if (stmt.statements && stmt.statements.length > 0) {
    return generateMethodBody(stmt.statements, indent);
  }
  return `${'  '.repeat(indent)}()`;
}

/**
 * Scala expression for a PERFORM VARYING FROM/BY operand (a Literal or
 * VariableReference AST node, per parser/procedure-parser.js's
 * parseVaryingClause -> parseOperand). Falls back to `fallback` when absent.
 */
function varyingOperandExpr(operand, fallback) {
  if (operand == null) return String(fallback);
  if (typeof operand === 'object') {
    if (operand.type === 'Literal') return String(operand.value);
    if (operand.name) return toCamelCase(operand.name);
  }
  return String(operand);
}

/**
 * Generate PERFORM from AST PerformStatement object
 */
function generatePerformFromAST(stmt, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = toMethodName(stmt.targetParagraph || '');

  // Simple PERFORM
  if (stmt.performType === 'simple') {
    if (stmt.throughParagraph) {
      const thruTarget = toMethodName(stmt.throughParagraph);
      return `${indentStr}${target}To${toPascalCase(stmt.throughParagraph.replace(/^\d+[-_]?/, ''))}()`;
    }
    return `${indentStr}${target}()`;
  }

  // PERFORM TIMES
  if (stmt.performType === 'times') {
    const times = stmt.times?.value || stmt.times || 1;
    return `${indentStr}(1 to ${times}).foreach { _ =>
${performBodyLines(stmt, indent + 1)}
${indentStr}}`;
  }

  // PERFORM UNTIL
  if (stmt.performType === 'until') {
    const condition = convertConditionToScala(stmt.until);
    const testBefore = stmt.testBefore !== false;
    const body = performBodyLines(stmt, indent + 1);

    if (testBefore) {
      return `${indentStr}while !(${condition}) do
${body}`;
    } else {
      return `${indentStr}do
${body}
${indentStr}while !(${condition})`;
    }
  }

  // PERFORM VARYING
  if (stmt.performType === 'varying' && stmt.varying) {
    const varName = toCamelCase(stmt.varying.variable || 'i');
    const from = varyingOperandExpr(stmt.varying.from, 1);
    const by = varyingOperandExpr(stmt.varying.by, 1);
    const until = convertConditionToScala(stmt.varying.until);
    const body = performBodyLines(stmt, indent + 1);

    // The loop-control variable is a WORKING-STORAGE item (declared once as
    // a flat var by scala-generator.js's buildFieldRegistry) - assign it
    // rather than redeclaring with `var`, so a second PERFORM VARYING over
    // the same variable in the same method body doesn't fail to compile
    // with "... is already defined as variable ...".
    return `${indentStr}${varName} = ${from}
${indentStr}while !(${until}) do
${body}
${indentStr}  ${varName} = ${varName} + ${by}`;
  }

  // Inline PERFORM with statements (no VARYING/UNTIL/TIMES clause)
  if (stmt.statements && stmt.statements.length > 0) {
    return generateMethodBody(stmt.statements, indent);
  }

  return `${indentStr}${target}()`;
}

/**
 * Convert condition AST to Scala expression
 */
function convertConditionToScala(condition) {
  if (!condition) return 'true';

  // If it's already a string
  if (typeof condition === 'string') return condition;

  // Use the convertCondition from expression-gen
  try {
    return convertCondition(condition);
  } catch (e) {
    // Fallback for complex conditions
    if (condition.conditionType === 'simple' && condition.subject) {
      return toCamelCase(condition.subject.name || condition.subject);
    }
    if (condition.conditionType === 'compound') {
      const left = convertConditionToScala(condition.left);
      const right = convertConditionToScala(condition.right);
      const op = condition.operator === 'AND' ? '&&' : '||';
      return `(${left} ${op} ${right})`;
    }
    return 'true';
  }
}

/**
 * Generate INITIALIZE statement
 */
function generateInitialize(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const targets = Array.isArray(statement.targets) ? statement.targets : [statement.target];

  const lines = targets.map(target => {
    const name = toCamelCase(target);
    return `${indentStr}${name} = ${name}.getClass.getDeclaredConstructor().newInstance()`;
  });

  return lines.join('\n');
}

/**
 * Generate SET statement
 */
function generateSet(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const target = toCamelCase(statement.target);

  if (statement.toTrue) {
    // SET condition TO TRUE
    return `${indentStr}${target} = true`;
  }

  if (statement.toFalse) {
    // SET condition TO FALSE
    return `${indentStr}${target} = false`;
  }

  if (statement.upBy) {
    // SET index UP BY
    return `${indentStr}${target} += ${statement.upBy}`;
  }

  if (statement.downBy) {
    // SET index DOWN BY
    return `${indentStr}${target} -= ${statement.downBy}`;
  }

  const value = statement.value ? toCamelCase(statement.value) : '0';
  return `${indentStr}${target} = ${value}`;
}

/**
 * Generate CALL statement
 */
function generateCall(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const programName = toCamelCase(statement.program.replace(/['"]/g, ''));

  const args = [];
  if (statement.using) {
    for (const param of statement.using) {
      const argName = toCamelCase(param.name || param);
      if (param.byContent) {
        args.push(argName);
      } else if (param.byValue) {
        args.push(argName);
      } else {
        // BY REFERENCE - default
        args.push(argName);
      }
    }
  }

  let call = `${indentStr}${programName}(${args.join(', ')})`;

  if (statement.returning) {
    const returnVar = toCamelCase(statement.returning);
    call = `${indentStr}val ${returnVar} = ${programName}(${args.join(', ')})`;
  }

  // Handle ON EXCEPTION / NOT ON EXCEPTION
  if (statement.onException || statement.notOnException) {
    const lines = [`${indentStr}try`];
    lines.push(`${indentStr}  ${programName}(${args.join(', ')})`);

    if (statement.onException) {
      lines.push(`${indentStr}catch`);
      lines.push(`${indentStr}  case e: Exception =>`);
      for (const stmt of statement.onException) {
        lines.push(generateExpression(stmt, indent + 2));
      }
    }

    return lines.join('\n');
  }

  return call;
}

/**
 * Generate a Scala method from a COBOL procedure/paragraph
 */
export function generateMethod(procedure, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const methodName = toMethodName(procedure.name);
  const params = analyzeParameters(procedure);
  const returnType = analyzeReturnType(procedure);

  // Build parameter list
  const paramList = params.map(p => `${p.name}: ${p.type}`).join(', ');

  // Build method signature
  let signature = `${indentStr}def ${methodName}(${paramList})`;
  if (returnType !== 'Unit') {
    signature += `: ${returnType}`;
  }
  signature += ' =';

  const lines = [signature];

  // Generate method body
  const body = generateMethodBody(procedure.statements, indent + 1);
  lines.push(body);

  return lines.join('\n');
}

/**
 * Generate PERFORM THRU wrapper method
 */
export function generatePerformThruMethod(fromParagraph, toParagraph, paragraphs, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fromName = toMethodName(fromParagraph);
  const toName = toMethodName(toParagraph);
  const methodName = `${fromName}To${toPascalCase(toParagraph.replace(/^\d+[-_]?/, ''))}`;

  // Find all paragraphs in the range
  let inRange = false;
  const rangeParagraphs = [];

  for (const para of paragraphs) {
    if (para.name === fromParagraph) {
      inRange = true;
    }
    if (inRange) {
      rangeParagraphs.push(para.name);
    }
    if (para.name === toParagraph) {
      break;
    }
  }

  const lines = [`${indentStr}def ${methodName}(): Unit =`];

  for (const paraName of rangeParagraphs) {
    lines.push(`${indentStr}  ${toMethodName(paraName)}()`);
  }

  return lines.join('\n');
}

/**
 * Generate all methods from a list of procedures
 */
export function generateAllMethods(procedures, indent = 0) {
  if (!procedures || procedures.length === 0) {
    return '';
  }

  const methods = [];
  const performThrus = new Set();

  // First pass - collect PERFORM THRU targets
  for (const procedure of procedures) {
    if (procedure.statements) {
      for (const stmt of procedure.statements) {
        if (stmt.type === 'PERFORM' && stmt.thru) {
          performThrus.add(`${stmt.target}:${stmt.thru}`);
        }
      }
    }
  }

  // Generate regular methods
  for (const procedure of procedures) {
    methods.push(generateMethod(procedure, indent));
  }

  // Generate PERFORM THRU wrapper methods
  for (const thru of performThrus) {
    const [from, to] = thru.split(':');
    methods.push(generatePerformThruMethod(from, to, procedures, indent));
  }

  return methods.join('\n\n');
}

export default {
  toMethodName,
  generateMethod,
  generatePerformThruMethod,
  generateAllMethods
};
