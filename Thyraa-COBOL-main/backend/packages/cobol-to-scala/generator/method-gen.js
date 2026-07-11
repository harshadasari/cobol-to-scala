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
          // `()` (not just a comment) so this compiles even when EXIT is the
          // only statement in its paragraph - a common THRU-range-endpoint
          // idiom (e.g. "1900-EXIT-PARA. EXIT.").
          lines.push('  '.repeat(indent) + '() // EXIT');
        }
        break;

      case 'CONTINUE':
        lines.push('  '.repeat(indent) + '() // CONTINUE');
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

  // PERFORM VARYING [AFTER ...]
  if (stmt.performType === 'varying' && stmt.varying) {
    // `varying` is the outermost loop; each `varying.after` entry (parser
    // populates VaryingClause.after - see parser/procedure-parser.js's
    // parseVaryingClause) is one more level nested *inside* it, in the order
    // written - PERFORM VARYING a ... AFTER b ... AFTER c loops `a` in the
    // outermost position and `c` innermost, matching COBOL's left-to-right
    // AFTER nesting (the innermost variable completes its whole UNTIL range
    // before the next-outer one advances).
    const levels = [stmt.varying, ...(stmt.varying.after || [])];
    return generateVaryingNest(levels, 0, stmt, indent);
  }

  // Inline PERFORM with statements (no VARYING/UNTIL/TIMES clause)
  if (stmt.statements && stmt.statements.length > 0) {
    return generateMethodBody(stmt.statements, indent);
  }

  return `${indentStr}${target}()`;
}

/**
 * Render one level of a PERFORM VARYING ... AFTER ... nest (recursively -
 * the innermost level's "body" is the PERFORM's own statements/target
 * paragraph; every other level's "body" is the *next* level's whole
 * while-loop). Resetting the inner variable to its FROM value happens
 * naturally here: it's the first line of the block that becomes the outer
 * loop's body, so it re-runs on every outer iteration, exactly like COBOL
 * re-initializing each AFTER variable at the start of each enclosing
 * iteration.
 */
function generateVaryingNest(levels, i, stmt, indent) {
  const indentStr = '  '.repeat(indent);
  const level = levels[i];
  const varName = toCamelCase(level.variable || 'i');
  const from = varyingOperandExpr(level.from, 1);
  const by = varyingOperandExpr(level.by, 1);
  const until = convertConditionToScala(level.until);
  const isInnermost = i === levels.length - 1;
  const body = isInnermost ? performBodyLines(stmt, indent + 1) : generateVaryingNest(levels, i + 1, stmt, indent + 1);

  // The loop-control variable is a WORKING-STORAGE item (declared once as a
  // flat var by scala-generator.js's buildFieldRegistry) - assign it rather
  // than redeclaring with `var`, so a second PERFORM VARYING over the same
  // variable in the same method body doesn't fail to compile with "... is
  // already defined as variable ...".
  return `${indentStr}${varName} = ${from}
${indentStr}while !(${until}) do
${body}
${'  '.repeat(indent + 1)}${varName} = ${varName} + ${by}`;
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
 * Generate a Scala method from a COBOL procedure/paragraph.
 *
 * The result type is *always* spelled out explicitly (never left for Scala
 * to infer), even when it's the default `Unit`: a method body can contain a
 * bare `return` (GOBACK, EXIT PROGRAM) or `return <call>()` (GO TO - see
 * expression-gen.js's generateGoTo) anywhere inside it, and Scala rejects a
 * `return` inside a method whose result type isn't explicitly declared
 * ("method ... has a return statement; it needs a result type") - so
 * omitting the annotation only for the common `Unit` case would make GO TO/
 * GOBACK/EXIT PROGRAM support depend on never sharing a paragraph with them,
 * which defeats the purpose.
 */
export function generateMethod(procedure, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const methodName = toMethodName(procedure.name);
  const params = analyzeParameters(procedure);
  const returnType = analyzeReturnType(procedure);

  // Build parameter list
  const paramList = params.map(p => `${p.name}: ${p.type}`).join(', ');

  const signature = `${indentStr}def ${methodName}(${paramList}): ${returnType} =`;

  const lines = [signature];

  // Generate method body
  const body = generateMethodBody(procedure.statements, indent + 1);
  lines.push(body);

  return lines.join('\n');
}

/**
 * True when a paragraph's last statement unconditionally transfers control
 * away from that paragraph on its own - a plain (non-DEPENDING-ON) GO TO, or
 * STOP RUN/GOBACK/EXIT PROGRAM - so nothing after it in program order would
 * ever be reached by falling off the end of this paragraph. Used by
 * generatePerformThruMethod to decide whether a paragraph in a THRU range
 * needs a synthesized fallthrough call appended after its own statements.
 */
function statementEndsInUnconditionalTransfer(statements) {
  if (!statements || statements.length === 0) return false;
  const last = statements[statements.length - 1];
  if (!last) return false;
  if (last.type === 'GoToStatement' && !last.dependingOn) return true;
  if (last.type === 'StopStatement' || last.type === 'GobackStatement') return true;
  if (last.type === 'ExitStatement' && String(last.exitType).toUpperCase() === 'PROGRAM') return true;
  return false;
}

/**
 * Generate a PERFORM ... THRU wrapper method.
 *
 * Each paragraph in the `fromParagraph`..`toParagraph` range becomes its own
 * nested local `def` *inside* this wrapper method, rather than calling the
 * already-generated top-level per-paragraph methods sequentially (the
 * previous implementation) - that naive sequential-call approach silently
 * ignored GO TO and DEPENDING-ON dispatch entirely (every paragraph in the
 * range ran unconditionally, in source order, regardless of what any GO TO
 * inside it said). Nesting the paragraphs as local defs makes two things
 * possible at once:
 *
 *  - GO TO to another paragraph in this same range (rendered by
 *    expression-gen.js's generateGoTo as `return <name>()`) resolves to the
 *    sibling nested def by ordinary lexical scoping, and `return` exits only
 *    that one paragraph's def - exactly COBOL's "transfer control, possibly
 *    into the middle of a THRU range" semantics.
 *  - a paragraph whose last statement is *not* itself an unconditional
 *    transfer (see statementEndsInUnconditionalTransfer) automatically calls
 *    the next paragraph's def after its own statements, mirroring COBOL's
 *    natural fallthrough across paragraph boundaries - which is only
 *    well-defined at all *within* a THRU-delimited span (a bare, non-THRU
 *    `PERFORM x` executes only paragraph x and returns to its caller
 *    regardless of fallthrough, so this behavior is intentionally scoped to
 *    just this wrapper method, not applied to standalone paragraph methods).
 *
 * Every paragraph in the range is *also* still generated as its own
 * standalone top-level method elsewhere (generateAllMethods generates one
 * per procedure unconditionally) - those copies are simply unused (dead
 * code) whenever a paragraph is only ever reached via this THRU range, which
 * is harmless: they reference the same-named sibling top-level methods and
 * compile fine on their own, just without this method's fallthrough/scoping.
 */
export function generatePerformThruMethod(fromParagraph, toParagraph, paragraphs, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const fromName = toMethodName(fromParagraph);
  const methodName = `${fromName}To${toPascalCase(toParagraph.replace(/^\d+[-_]?/, ''))}`;

  // Find all paragraphs in the range (inclusive), in program order.
  let inRange = false;
  const rangeParagraphs = [];
  for (const para of paragraphs) {
    if (para.name === fromParagraph) inRange = true;
    if (inRange) rangeParagraphs.push(para);
    if (para.name === toParagraph) break;
  }

  if (rangeParagraphs.length === 0) {
    return `${indentStr}def ${methodName}(): Unit =\n${indentStr}  ()`;
  }

  const lines = [`${indentStr}def ${methodName}(): Unit =`];
  const defIndent = indent + 1;
  const defIndentStr = '  '.repeat(defIndent);

  rangeParagraphs.forEach((para, i) => {
    const name = toMethodName(para.name);
    lines.push(`${defIndentStr}def ${name}(): Unit =`);
    lines.push(generateMethodBody(para.statements, defIndent + 1));

    const isLast = i === rangeParagraphs.length - 1;
    if (!isLast && !statementEndsInUnconditionalTransfer(para.statements)) {
      const nextName = toMethodName(rangeParagraphs[i + 1].name);
      lines.push(`${'  '.repeat(defIndent + 1)}${nextName}() // implicit fall-through`);
    }
  });

  lines.push(`${defIndentStr}${toMethodName(rangeParagraphs[0].name)}()`);

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

  // First pass - collect PERFORM THRU targets (PerformStatement AST nodes
  // use .targetParagraph/.throughParagraph - see parser/ast.js - not
  // .target/.thru).
  for (const procedure of procedures) {
    if (procedure.statements) {
      for (const stmt of procedure.statements) {
        if (stmt.type === 'PerformStatement' && stmt.throughParagraph) {
          performThrus.add(`${stmt.targetParagraph}:${stmt.throughParagraph}`);
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
