/**
 * method-gen.js
 * Convert COBOL paragraphs/procedures to Scala methods
 */

import { toCamelCase, toPascalCase, mapCobolTypeToScala } from './case-class-gen.js';
import {
  generateExpression,
  convertCondition,
  setAmbiguousParagraphNamesForPerform as setAmbiguousParagraphNamesForPerformExpr,
  assignExpr,
  isRecursiveNestedFlowMode,
} from './expression-gen.js';

/**
 * The whole-program ambiguous-bare-paragraph-name set (collectAmbiguousParagraphNames,
 * below) most recently computed by scala-generator.js for the program
 * currently being generated - module-level state, mirroring
 * expression-gen.js's own registry-setter pattern (setFieldRegistry et al.),
 * since generatePerformFromAST (an ordinary PERFORM statement inside a
 * paragraph body) has no other way to reach it: it's several call frames
 * below generateMethod/generateAllMethods, which is where this set is
 * otherwise threaded through. Only consulted for a PERFORM statement that
 * carries an explicit OF/IN qualifier (`stmt.targetSection` - round-12
 * bonus finding) - an ordinary unqualified PERFORM is untouched (see
 * resolvePerformTargetMethodName's doc comment).
 */
let CURRENT_AMBIGUOUS_PARAGRAPH_NAMES = new Set();

export function setAmbiguousParagraphNamesForPerform(names) {
  CURRENT_AMBIGUOUS_PARAGRAPH_NAMES = names instanceof Set ? names : new Set();
}

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
        } else if (String(stmt.exitType).toUpperCase() === 'PERFORM') {
          // EXIT PERFORM at the top level of a paragraph body (not nested in
          // an IF/EVALUATE - that path goes through expression-gen.js's
          // generateExit instead): exits only the nearest enclosing inline
          // PERFORM loop - see generatePerformFromAST/generateVaryingNest's
          // boundary-wrapped bodies below - never the whole method (round-3
          // finding 1).
          lines.push('  '.repeat(indent) + 'scala.util.boundary.break() // EXIT PERFORM');
        } else if (String(stmt.exitType).toUpperCase() === 'SECTION') {
          // round-29 fix (ee09): see isRecursiveNestedFlowMode's own doc
          // comment (expression-gen.js) and generateProgramFlowLinesNested's
          // (below) for why a RECURSIVE program's own nested-def paragraph
          // needs `throw CobolExitSectionSignal` here instead of a bare
          // `return` - the ordinary (non-recursive) convention is unaffected.
          lines.push(
            '  '.repeat(indent) +
            (isRecursiveNestedFlowMode() ? 'throw CobolExitSectionSignal // EXIT SECTION' : 'return // EXIT SECTION')
          );
        } else {
          // EXIT PARAGRAPH: every paragraph is its own Scala method, so
          // `return` skips only the rest of *this* paragraph (round-3
          // finding 2 - the pre-fix `()` no-op skipped nothing). Still
          // compiles even when EXIT is the only statement in its paragraph -
          // a common THRU-range-endpoint idiom (e.g. "1900-EXIT-PARA. EXIT.").
          //
          // round-29 fix (ee09/ee10 trio): a RECURSIVE program's own
          // nested-def paragraph instead needs `scala.util.boundary.break()`
          // here - see isRecursiveNestedFlowMode's own doc comment
          // (expression-gen.js) and renderNestedFallthroughDefs' (below) for
          // why a bare `return` is wrong there specifically.
          lines.push(
            '  '.repeat(indent) +
            (isRecursiveNestedFlowMode() ? 'scala.util.boundary.break() // EXIT PARAGRAPH' : 'return // EXIT PARAGRAPH')
          );
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
    return `${'  '.repeat(indent)}${resolvePerformTargetMethodName(stmt.targetParagraph, stmt.targetSection)}()`;
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
  // round-12 bonus finding (z12): an explicit OF/IN qualifier
  // (stmt.targetSection) routes through the collision-aware resolver instead
  // of a plain unqualified name, for the single-target (no THRU) form.
  //
  // round-14 finding 1: a THRU range's own composite wrapper-method name
  // (generatePerformThruMethod) now ALSO threads targetSection/throughSection
  // through - via the shared performThruWrapperName helper - so a qualified
  // `PERFORM x OF secA THRU y OF secB` calls the wrapper actually generated
  // for this exact qualified pair, not an unrelated bare-name-identical
  // range resolved elsewhere in program order.
  const target = resolvePerformTargetMethodName(stmt.targetParagraph || '', stmt.targetSection);

  // Simple PERFORM
  if (stmt.performType === 'simple') {
    if (stmt.throughParagraph) {
      return `${indentStr}${performThruWrapperName(stmt.targetParagraph || '', stmt.targetSection, stmt.throughParagraph, stmt.throughSection)}()`;
    }
    return `${indentStr}${target}()`;
  }

  // Every looping/bodied form below wraps its body in
  // `scala.util.boundary { ... }` so a top-level EXIT PERFORM
  // (generateMethodBody's 'EXIT' case) can `break()` out of exactly this
  // loop - see that case's doc comment and expression-gen.js's
  // generatePerform (the nested-statement sibling of this function) for the
  // full rationale (round-3 finding 1).

  // PERFORM TIMES
  if (stmt.performType === 'times') {
    const times = stmt.times?.value || stmt.times || 1;
    const bi = '  '.repeat(indent + 1);
    return `${indentStr}scala.util.boundary {
${bi}(1 to ${times}).foreach { _ =>
${performBodyLines(stmt, indent + 2)}
${bi}}
${indentStr}}`;
  }

  // PERFORM UNTIL
  if (stmt.performType === 'until') {
    const condition = convertConditionToScala(stmt.until);
    const testBefore = stmt.testBefore !== false;
    const bi = '  '.repeat(indent + 1);
    const body = performBodyLines(stmt, indent + 2);

    if (testBefore) {
      return `${indentStr}scala.util.boundary {
${bi}while !(${condition}) do
${body}
${indentStr}}`;
    }

    // WITH TEST AFTER (post-condition loop - body must run at least once
    // even when the UNTIL condition is already true before the first
    // iteration): Scala 3 removed the do-while postfix loop construct
    // entirely (not merely restyled it) - `do <block> while <cond>` is a
    // syntax error ("end of toplevel definition expected but 'do' found"),
    // there is no direct replacement statement. The standard Scala 3
    // rewrite folds the loop body into the `while`'s own condition block
    // (whose *last* expression is the boolean test) and leaves the `do`
    // body empty - the condition block runs unconditionally every time
    // (including the first, before any test), which is exactly do-while
    // semantics: body, then test, repeat while true.
    return `${indentStr}scala.util.boundary {
${bi}while
${body}
${'  '.repeat(indent + 2)}!(${condition})
${bi}do ()
${indentStr}}`;
  }

  // PERFORM VARYING [AFTER ...]
  if (stmt.performType === 'varying' && stmt.varying) {
    // `varying` is the outermost loop; each `varying.after` entry (parser
    // populates VaryingClause.after - see parser/procedure-parser.js's
    // parseVaryingClause) is one more level nested *inside* it, in the order
    // written - PERFORM VARYING a ... AFTER b ... AFTER c loops `a` in the
    // outermost position and `c` innermost, matching COBOL's left-to-right
    // AFTER nesting (the innermost variable completes its whole UNTIL range
    // before the next-outer one advances). EXIT PERFORM inside *any* AFTER
    // level exits the whole multi-level construct (one PERFORM ... END-
    // PERFORM range, not one range per level) - so the boundary wraps here,
    // once, around the outermost level only, not inside generateVaryingNest's
    // own per-level recursion.
    const levels = [stmt.varying, ...(stmt.varying.after || [])];
    const testBefore = stmt.testBefore !== false;
    const bi = '  '.repeat(indent + 1);
    // WITH TEST BEFORE (the default - round-4 finding 5): every level's FROM
    // value is set exactly once, up front, for *all* levels at once - not
    // separately inside each level's own construct (see generateVaryingNest's
    // doc comment for why: after this fix, a level only ever gets reset again
    // when the level immediately enclosing it increments, never on its own
    // initiative). WITH TEST AFTER keeps its own pre-existing per-level
    // self-reset (unaffected by this fix - verified already correct against
    // installed GnuCOBOL, see generateVaryingNest's WITH TEST AFTER branch).
    // round-24 audit: assignExpr, not a bare `=` string (the SAME centralization
    // gap round-23 finding 1 fixed for renderAssignment/generateCall, found
    // here in PERFORM VARYING's own loop-variable init/increment - the
    // VARYING variable can be a RECURSIVE program's own LINKAGE-aliased leaf).
    const initLines = testBefore
      ? levels.map(l => `${bi}${assignExpr(toCamelCase(l.variable || 'i'), varyingOperandExpr(l.from, 1))}`).join('\n') + '\n'
      : '';
    return `${indentStr}scala.util.boundary {
${initLines}${generateVaryingNest(levels, 0, stmt, indent + 1)}
${indentStr}}`;
  }

  // Inline PERFORM with statements (no VARYING/UNTIL/TIMES clause): executes
  // its body exactly once, like a scope - still boundary-wrapped so a bare
  // EXIT PERFORM inside it only skips the rest of this one execution.
  if (stmt.statements && stmt.statements.length > 0) {
    return `${indentStr}scala.util.boundary {
${generateMethodBody(stmt.statements, indent + 1)}
${indentStr}}`;
  }

  return `${indentStr}${target}()`;
}

/**
 * Render one level of a PERFORM VARYING ... AFTER ... nest (recursively -
 * the innermost level's "body" is the PERFORM's own statements/target
 * paragraph; every other level's "body" is the *next* level's whole
 * while-loop).
 *
 * WITH TEST BEFORE (round-4 finding 5): every level's *own* FROM-reset is
 * hoisted out of this function entirely (see generatePerformFromAST's
 * `initLines`, emitted once for every level up front, before the outermost
 * while even starts) - what happens *here* instead is resetting every level
 * *deeper* than this one back to its own FROM value, unconditionally,
 * immediately after this level's own increment (`resetDeeperLines`). This
 * matches cobc's actual documented PERFORM VARYING algorithm exactly
 * (verified against installed GnuCOBOL with perf01's differing-step,
 * negative-step AFTER nest): incrementing a level re-initializes every level
 * nested under it back to FROM *before* control returns to retest this
 * level's own UNTIL - including on the very last outer iteration, whose
 * retest is about to fail and exit the whole construct. The pre-fix version
 * instead reset each level's FROM value at the *top* of its own construct -
 * which only re-ran when the *enclosing* level's while-body executed again,
 * never on that enclosing level's *final* (test-failing, body-skipped)
 * retest - so every AFTER variable was left holding whatever value its own
 * last inner iteration reached, not its FROM value, once the whole nest
 * finished (e.g. `FINAL-J` held the AFTER variable's last-used value instead
 * of its FROM-reset one).
 *
 * WITH TEST AFTER VARYING is unaffected by any of this (see below) - kept
 * exactly as before, since it's already verified correct.
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
  const testBefore = stmt.testBefore !== false;
  const bodyIndentStr = '  '.repeat(indent + 1);

  if (testBefore) {
    // round-24 audit: assignExpr, not a bare `=` string - see this file's
    // own import comment/generatePerformFromAST's initLines above.
    const resetDeeperLines = levels
      .slice(i + 1)
      .map(l => `${bodyIndentStr}${assignExpr(toCamelCase(l.variable || 'i'), varyingOperandExpr(l.from, 1))}`)
      .join('\n');
    return [
      `${indentStr}while !(${until}) do`,
      body,
      `${bodyIndentStr}${assignExpr(varName, `${varName} + ${by}`)}`,
      resetDeeperLines,
    ].filter(Boolean).join('\n');
  }

  // WITH TEST AFTER VARYING: the TEST phrase applies uniformly to every
  // nested VARYING/AFTER level in the same PERFORM statement (not just the
  // outermost one) - each level's body must run at least once before its own
  // UNTIL is first tested, and (verified against installed GnuCOBOL - see
  // tests/corpus/proc/r07-perf-negafter.cbl's WITH TEST AFTER VARYING case)
  // the UNTIL test itself happens *before* the increment, against the
  // still-current (not yet incremented) value - the increment only happens
  // if the loop is going to continue. So body+test are folded into the
  // while-condition block (same do-while-elimination rewrite as every other
  // WITH TEST AFTER form here - Scala 3 has no do-while postfix loop at all)
  // and the increment moves into the `do` body, which only runs between
  // iterations, never after the final (test-failing) one.
  return `${indentStr}${assignExpr(varName, from)}
${indentStr}while
${body}
${bodyIndentStr}!(${until})
${indentStr}do
${bodyIndentStr}${assignExpr(varName, `${varName} + ${by}`)}`;
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
  const params = analyzeParameters(procedure);
  const paramList = params.map(p => `${p.name}: ${p.type}`).join(', ');
  return generateMethodNamed(toMethodName(procedure.name), procedure.statements, indent, paramList);
}

/**
 * Same as generateMethod, but with a precomputed method name (used when a
 * paragraph's bare name needs to be qualified by its enclosing section to
 * avoid colliding with a same-named paragraph elsewhere - see
 * resolveParagraphMethodName/collectAmbiguousParagraphNames below, round-4
 * finding 8).
 */
function generateMethodNamed(methodName, statements, indent = 0, paramList = '') {
  const indentStr = '  '.repeat(indent);
  const signature = `${indentStr}def ${methodName}(${paramList}): Unit =`;
  const body = generateMethodBody(statements, indent + 1);
  return [signature, body].join('\n');
}

/**
 * Find every bare paragraph method name (post toMethodName/numeric-prefix-
 * stripping) that would be generated more than once across the whole
 * PROCEDURE DIVISION - counting genuinely top-level (section-less) paragraphs
 * plus every paragraph nested inside every SECTION (and a paragraphless
 * section's own name, standing in for itself). Two paragraphs in *different*
 * sections legitimately have distinct COBOL names (e.g. "1000-PARA-A" and
 * "2000-PARA-A") that still collide once toMethodName strips each one's own
 * section-numbered prefix - round-4 finding 8 (mirrors case-class-gen.js's
 * collectAmbiguousGroupClassNames for the exact same "only qualify names that
 * actually collide" reasoning). Names appearing exactly once are left alone,
 * so every previously-generated (section-less) program is untouched.
 */
export function collectAmbiguousParagraphNames(topLevelParagraphs, sections) {
  const counts = new Map();
  // round-25 root cause 3: also track (section, bareName) pair counts, so
  // resolveParagraphMethodName can detect when TWO (OR MORE) DIFFERENT
  // paragraphs sharing the same bare (post-numeric-prefix-stripped) name
  // ALSO happen to live in the exact same section (o13: `1000-PARA` and
  // `2000-PARA`, both declared inside `SEC-A`, both strip to bare "para") -
  // qualifying by section alone (the ordinary ambiguous-name fix, round-4
  // finding 8) collapses onto the IDENTICAL qualified name for both in that
  // case (`secAPara` declared twice - a hard "already defined"/"Conflicting
  // definitions" compile error, reproducible even in an ordinary,
  // non-RECURSIVE, non-THRU program with this exact paragraph-naming shape -
  // a section qualifier can only distinguish paragraphs declared in
  // DIFFERENT sections, never two colliding names within the identical one).
  const sectionBareCounts = new Map();
  const bump = (name, sectionName) => {
    const bare = toMethodName(name);
    counts.set(bare, (counts.get(bare) || 0) + 1);
    if (sectionName) {
      const key = `${String(sectionName).toUpperCase()}::${bare}`;
      sectionBareCounts.set(key, (sectionBareCounts.get(key) || 0) + 1);
    }
  };

  for (const p of topLevelParagraphs || []) bump(p.name, null);
  for (const s of sections || []) {
    const hasParagraphs = s.paragraphs && s.paragraphs.length > 0;
    const paras = hasParagraphs ? s.paragraphs : [s];
    if (hasParagraphs) {
      const leading = sectionLeadingUnit(s);
      if (leading) bump(leading.name, s.name);
    }
    for (const p of paras) bump(p.name, hasParagraphs ? s.name : null);
  }

  const ambiguous = new Set();
  for (const [name, count] of counts) {
    if (count > 1) ambiguous.add(name);
  }
  // Attached to the same Set instance (not a second return value) so every
  // existing call site that only ever calls `ambiguousNames.has(bare)` - the
  // overwhelming majority - is completely unaffected; only
  // resolveParagraphMethodName (below) reads this extra property.
  ambiguous.sameSectionCollisions = new Set();
  for (const [key, count] of sectionBareCounts) {
    if (count > 1) ambiguous.sameSectionCollisions.add(key);
  }
  return ambiguous;
}

/**
 * Synthetic paragraph-like unit standing in for any statements written
 * directly under a SECTION header before its first named paragraph -
 * round-7 finding 8: such a leading block was previously silently dropped
 * entirely whenever the section also had at least one named paragraph
 * (generateSectionMethod/flattenProcedureUnits only ever looked at
 * `section.paragraphs`, never `section.statements`, once `section.paragraphs`
 * was non-empty). Returns null when the section has no such leading block
 * (the overwhelmingly common case - a SECTION whose very first line is a
 * named paragraph).
 *
 * Verified against installed GnuCOBOL (tests/oracle - u13's oracle output,
 * round-7 refutation): `PERFORM <section-name>` runs this leading block
 * FIRST, then - per the section's own ordinary fall-through rule, exactly
 * like falling from one named paragraph into the next - continues into the
 * section's first named paragraph unless the leading block's own last
 * statement is itself an unconditional transfer (GO TO/STOP RUN/GOBACK/EXIT
 * PROGRAM). That is exactly what treating this as an ordinary leading unit
 * in the same renderNestedFallthroughSteps chain as the section's real
 * paragraphs already produces, so it is not special-cased beyond its
 * synthesis here.
 *
 * The synthetic name (`<section-name>-SECTION-BODY`) cannot collide with any
 * real COBOL paragraph/section name the source could declare for this exact
 * section, and - because nothing in COBOL source syntax can ever name it -
 * it is never an explicit PERFORM target; it only participates in the
 * internal fall-through wiring built by flattenProcedureUnits/
 * generateSectionMethod.
 */
function sectionLeadingUnit(section) {
  if (!section.statements || section.statements.length === 0) return null;
  return { name: `${section.name}-SECTION-BODY`, statements: section.statements, sectionName: section.name };
}

/**
 * Resolve the actual top-level method name for a paragraph, given the shared
 * ambiguity set (collectAmbiguousParagraphNames) and the paragraph's own
 * enclosing section name (null for a genuinely top-level paragraph). Unique
 * bare names are returned unqualified (byte-for-byte the same as before this
 * fix); a colliding one is qualified by its enclosing section's own method
 * name, e.g. "1000-PARA-A" inside "3000-THIRD SECTION" becomes
 * `thirdParaA` - mirroring case-class-gen.js's resolveClassName.
 */
export function resolveParagraphMethodName(paragraphName, sectionName, ambiguousNames) {
  const bare = toMethodName(paragraphName);
  if (ambiguousNames && ambiguousNames.has(bare) && sectionName) {
    const sectionPart = toMethodName(sectionName);
    // round-25 root cause 3: qualifying by section alone is not unique when
    // two (or more) paragraphs sharing THIS bare name also share THIS same
    // section (collectAmbiguousParagraphNames' own sameSectionCollisions -
    // o13: `1000-PARA`/`2000-PARA`, both in SEC-A, both stripping to bare
    // "para") - fall back to a name built from the paragraph's own FULL
    // (unstripped) text in that case. COBOL requires paragraph names to be
    // unique within their own section, so `sectionPart + toPascalCase(full
    // name)` is inherently collision-free here with no further bookkeeping
    // needed - unlike the ordinary case just below, which only strips the
    // numeric prefix and can still collide within one section.
    const sameSectionKey = `${String(sectionName).toUpperCase()}::${bare}`;
    if (ambiguousNames.sameSectionCollisions && ambiguousNames.sameSectionCollisions.has(sameSectionKey)) {
      return sectionPart + toPascalCase(String(paragraphName || ''));
    }
    return sectionPart + bare.charAt(0).toUpperCase() + bare.slice(1);
  }
  return bare;
}

/**
 * The method name a PERFORM/GO TO *statement* should call for
 * `paragraphName`, given whatever explicit OF/IN qualifier (`sectionName`,
 * from `stmt.targetSection`/`stmt.throughSection` - null for the ordinary
 * unqualified form) the statement itself carried (round-12 bonus finding,
 * z12). Routes through resolveParagraphMethodName (the same collision-aware
 * resolver generateAllMethods/generateSectionMethod already use to *declare*
 * a qualified method in the first place) using the whole-program ambiguity
 * set most recently installed by setAmbiguousParagraphNamesForPerform, so an
 * explicitly qualified reference to a genuinely colliding bare name resolves
 * to the correct section-qualified method - not the bare (and, for a
 * colliding name, wrong/others'-shadowing) `toMethodName` this always used
 * before. An unqualified PERFORM's own reference is untouched (sectionName
 * is null unless the source itself wrote `OF`/`IN` - the pre-existing,
 * documented "Known gaps" limitation for a bare would-be-ambiguous reference
 * is intentionally not addressed here).
 */
function resolvePerformTargetMethodName(paragraphName, sectionName) {
  if (!sectionName) return toMethodName(paragraphName);
  return resolveParagraphMethodName(paragraphName, sectionName, CURRENT_AMBIGUOUS_PARAGRAPH_NAMES);
}

/**
 * The composite wrapper-method name for a `PERFORM x [OF/IN secX] THRU y
 * [OF/IN secY]` range (round-14 finding 1) - shared by generatePerformThruMethod
 * (which declares the wrapper `def`) and generatePerformFromAST's own
 * simple-THRU call site (which must call the exact same name), so the two
 * never drift apart.
 *
 * When neither endpoint carries a qualifier (the overwhelmingly common case,
 * and every pre-round-14 corpus program), this reduces byte-for-byte to the
 * pre-existing unqualified scheme (`<from>To<To>`) - expression-gen.js's
 * procedureCallExpr (SORT INPUT/OUTPUT PROCEDURE ... THRU, which never
 * carries a qualifier at all) keeps computing that same unqualified form
 * independently and still matches.
 *
 * When a qualifier IS present, it's folded into the name too
 * (`<from>In<SecX>To<To>In<SecY>`) - without this, two *different* qualified
 * THRU ranges that happen to share both bare endpoint names (legal COBOL:
 * `PERFORM PARA-ONE OF SEC-A THRU PARA-TWO OF SEC-A` and `... OF SEC-B THRU
 * ... OF SEC-B` in the same program) would collapse onto the identical
 * wrapper-method name - a hard duplicate-def compile error, or worse, one
 * silently shadowing/serving the other.
 */
export function performThruWrapperName(fromParagraph, fromSection, toParagraph, toSection) {
  const fromBase = toMethodName(fromParagraph);
  const toBase = toPascalCase(String(toParagraph || '').replace(/^\d+[-_]?/, ''));
  const fromQualifier = fromSection ? 'In' + toPascalCase(String(fromSection).replace(/^\d+[-_]?/, '')) : '';
  const toQualifier = toSection ? 'In' + toPascalCase(String(toSection).replace(/^\d+[-_]?/, '')) : '';
  return `${fromBase}${fromQualifier}To${toBase}${toQualifier}`;
}

/**
 * Flatten the whole PROCEDURE DIVISION into one ordered list of paragraph-like
 * units - `{ name, statements, sectionName }` - in true source order: any
 * genuinely top-level (pre-first-SECTION) paragraphs first, then each
 * section's own paragraphs in order (a paragraphless section - direct
 * statements, no nested paragraph names - becomes a single pseudo-paragraph
 * unit standing in for itself). This is the order COBOL falls through in
 * during ordinary top-to-bottom execution, and the order
 * generateProgramFlowLines/generateAllMethods below both need.
 */
export function flattenProcedureUnits(topLevelParagraphs, sections) {
  const units = [];
  for (const p of topLevelParagraphs || []) {
    units.push({ name: p.name, statements: p.statements, sectionName: null });
  }
  for (const s of sections || []) {
    if (s.paragraphs && s.paragraphs.length > 0) {
      // round-7 finding 8: a leading anonymous statement block (directly
      // under the SECTION header, before the first named paragraph) is its
      // own implicit first unit - see sectionLeadingUnit's doc comment.
      const leading = sectionLeadingUnit(s);
      if (leading) {
        units.push({ name: leading.name, statements: leading.statements, sectionName: s.name });
      }
      for (const p of s.paragraphs) {
        units.push({ name: p.name, statements: p.statements, sectionName: s.name });
      }
    } else {
      units.push({ name: s.name, statements: s.statements, sectionName: null });
    }
  }
  return units;
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
 *
 * Takes the whole program's flattened `units` list (name/statements/
 * sectionName - see flattenProcedureUnits) and the whole program's
 * `ambiguousNames` set (collectAmbiguousParagraphNames), not a bare
 * paragraph list, so each nested def's own name is resolved via
 * resolveParagraphMethodName exactly like generateAllMethods/
 * generateSectionMethod/generateProgramFlowLines already do - round-5
 * finding 2: a THRU range can span multiple SECTIONs (see this function's
 * own doc-comment fix above renderNestedFallthroughDefs), so two paragraphs
 * inside the very same range can share a bare post-numeric-prefix-strip name
 * (`1000-PARA-A`/`2000-PARA-A` both -> `paraA`) - plain toMethodName produced
 * two identically-named nested `def`s in that case (a hard compile error);
 * resolveParagraphMethodName qualifies only the genuinely-colliding ones by
 * their own enclosing section, leaving every unique name exactly as before.
 */
export function generatePerformThruMethod(fromParagraph, toParagraph, units, ambiguousNames, indent = 0, fromSection = null, toSection = null) {
  const indentStr = '  '.repeat(indent);
  const methodName = performThruWrapperName(fromParagraph, fromSection, toParagraph, toSection);
  const nameFor = (u) => resolveParagraphMethodName(u.name, u.sectionName, ambiguousNames);

  // round-14 finding 1: an explicit `OF`/`IN` qualifier on either endpoint
  // (stmt.targetSection/throughSection) must narrow the lookup to the unit
  // actually named in THAT section - matching by bare name alone always
  // resolved the FIRST program-order occurrence, silently picking the wrong
  // paragraph whenever the same bare name is declared in more than one
  // section (see performThruWrapperName's doc comment for the matching
  // wrapper-name-collision half of this fix).
  const startIndex = units.findIndex(u => u.name === fromParagraph && (!fromSection || u.sectionName === fromSection));
  const endIndex = units.findIndex(u => u.name === toParagraph && (!toSection || u.sectionName === toSection));

  // round-9 finding 5: a *backward* THRU range - `toParagraph` precedes
  // `fromParagraph` in physical program order, e.g. `PERFORM PARA-C THRU
  // PARA-A` when PARA-A is declared before PARA-C - is not "loop backward
  // through the range". Compiler-verified against installed GnuCOBOL
  // (tests/corpus/proc/w10-perform-thru-backward.cbl) that cobc runs *only*
  // the start paragraph (PARA-C), then behaves exactly as if execution had
  // fallen off the true physical end of the PROCEDURE DIVISION (an implicit
  // STOP RUN) - it does NOT return control to whatever statement follows the
  // PERFORM in its own caller (w10's own `DISPLAY "COUNT=" WS-COUNT` right
  // after the PERFORM is never reached at all).
  //
  // This also happens to be the *only* way the ordinary forward-range
  // collection loop below terminates correctly for this shape: `if (u.name
  // === toParagraph) break` fires the moment the loop reaches toParagraph in
  // program order - for a backward range that happens *before*
  // fromParagraph is ever reached (`inRange` never becomes true) - which
  // silently produced an empty rangeUnits list (a no-op `()` wrapper,
  // executing nothing at all) before this fix.
  //
  // General form (not independently oracle-verified beyond w10, where the
  // start paragraph happens to be the program's physically last unit):
  // reuses renderNestedFallthroughDefs unchanged, over every unit from the
  // start paragraph through the true end of the program (not stopping at
  // toParagraph at all - toParagraph is behind, not ahead), so an ordinary
  // GO TO/fallthrough within that tail still cascades exactly like a forward
  // range's own tail does; a trailing `sys.exit(0)` after the initial call
  // then models "falls off the end of the PROCEDURE DIVISION" - matching an
  // implicit STOP RUN - so the wrapper never returns to its own caller.
  const isBackward = startIndex !== -1 && endIndex !== -1 && endIndex < startIndex;

  let rangeUnits;
  if (isBackward) {
    rangeUnits = units.slice(startIndex);
  } else if (startIndex !== -1 && endIndex !== -1) {
    // round-14 finding 1: slice using the already-resolved (section-aware)
    // startIndex/endIndex directly, rather than re-scanning `units` by bare
    // name alone (the previous implementation's own separate `inRange` loop
    // below re-did this lookup with a second, unqualified bare-name
    // comparison - so even after startIndex/endIndex above were fixed to
    // respect an explicit OF/IN qualifier, THIS loop silently overrode that
    // fix by re-matching the first bare-name occurrence again).
    rangeUnits = units.slice(startIndex, endIndex + 1);
  } else {
    rangeUnits = [];
  }

  if (rangeUnits.length === 0) {
    return `${indentStr}def ${methodName}(): Unit =\n${indentStr}  ()`;
  }

  const defIndent = indent + 1;
  const lines = [`${indentStr}def ${methodName}(): Unit =`];
  lines.push(...renderNestedFallthroughDefs(rangeUnits, defIndent, nameFor));
  lines.push(renderSectionAwareEntryCall(rangeUnits, '  '.repeat(defIndent), nameFor));
  if (isBackward) {
    lines.push(
      `${'  '.repeat(defIndent)}sys.exit(0) // round-9 finding 5: backward PERFORM ... THRU falls off the ` +
      'end of the PROCEDURE DIVISION rather than returning to its caller'
    );
  }

  return lines.join('\n');
}

/**
 * Render one paragraph per nested local `def`, in order, each followed by an
 * automatic call to the *next* paragraph's def (round-3's "implicit
 * fall-through") unless the paragraph's own last statement already
 * unconditionally transfers control away (statementEndsInUnconditionalTransfer)
 * or it's the last paragraph in the list. Shared by generatePerformThruMethod
 * (bounded to one PERFORM ... THRU range), generateSectionMethod (bounded to
 * one SECTION's own paragraphs, for PERFORM-of-a-section-name - round-4
 * finding 7), and generateProgramFlowLines (the *whole* PROCEDURE DIVISION,
 * for the program's true entry point - round-4 finding 9). `nameFor` computes
 * each paragraph's local def name; callers needing collision-safe names pass
 * resolveParagraphMethodName, everyone else (a single section - inherently
 * collision-free, since paragraph names are unique within one section) just
 * passes plain toMethodName. A single PERFORM ... THRU range is NOT
 * inherently collision-free the way one section is, despite the earlier
 * (wrong) version of this comment claiming otherwise: a THRU range can span
 * multiple SECTIONs (e.g. `PERFORM 1000-PARA-A THRU 2000-PARA-B` where
 * 1000-PARA-A lives in one SECTION and 2000-PARA-B in a later one - see
 * tests/corpus/proc/s02-perform-thru-section-span.cbl), and two paragraphs in
 * different sections can legitimately share a bare post-numeric-prefix-strip
 * name (`1000-PARA-A` and `2000-PARA-A` both strip to `paraA`) while still
 * both falling inside the same THRU range - generatePerformThruMethod
 * therefore also passes resolveParagraphMethodName (round-5 finding 2), not
 * plain toMethodName as an earlier version of this generator did (which
 * produced two identically-named nested `def paraA(): Unit` siblings in the
 * same wrapper method - a hard "paraA is already defined" compile error).
 *
 * round-27 finding 5: optional `noFallthroughAfter` (a Set of upper-cased
 * paragraph names) - only ever passed non-null by generateProgramFlowLinesNested,
 * over the WHOLE program's unit list, for a RECURSIVE program's own entry
 * body. A SORT/MERGE's own INPUT PROCEDURE/OUTPUT PROCEDURE clause names a
 * paragraph (or, with THRU, a range) that must be invoked ONLY out-of-line by
 * the SORT/MERGE statement's own machinery (procedureCallExpr,
 * expression-gen.js) - real COBOL never falls through from such a paragraph
 * into whatever paragraph happens to follow it physically, exactly like an
 * ordinary out-of-line `PERFORM <paragraph>` never does either. The ordinary
 * (non-recursive) convention gets this for free: generateAllMethods' flat
 * per-paragraph methods never have ANY auto-chain baked in at all (fall-
 * through is modeled ONLY by the separate, uniquely-named `_stepN` wrapper
 * chain renderNestedFallthroughSteps builds for the whole-program entry point
 * - see its own doc comment and the p12-sort.cbl regression it fixed), so
 * calling a bare paragraph name (SORT's own call site, when its procedure
 * clause has no THRU) always resolves to that non-chaining flat method. This
 * convention has no such split - one nested `def` per paragraph name serves
 * BOTH "the whole program's own natural top-to-bottom fall-through" AND "an
 * out-of-line call to this one paragraph," so the auto-chain baked into that
 * SAME def would otherwise also fire whenever SORT/MERGE's own machinery
 * calls it (cc10: `FILL-SORT`, an INPUT PROCEDURE with no THRU, auto-chained
 * into the immediately-following `SHOW-SORT` - the OUTPUT PROCEDURE - running
 * it once prematurely against the still-unsorted buffer, in addition to its
 * own later, correct invocation). Suppressing the auto-chain specifically at
 * each such paragraph's own through-endpoint (collectSortMergeThroughEndpoints)
 * closes the gap without touching any other paragraph's fall-through - safe
 * because a SORT/MERGE procedure-clause paragraph is never ALSO meant to be
 * reached by genuine top-to-bottom fall-through in conforming COBOL (the
 * ordinary convention's own _stepN chain would already collide with the SAME
 * paragraph's flat method the identical way if it ever were, an equally-
 * unmodeled edge case shared by both conventions, not one this fix changes).
 */
/**
 * round-29 fix (ee09/ee10 trio): true if any paragraph in `paragraphs`
 * contains an EXIT statement of the given kind (`'PARAGRAPH'`/`'SECTION'`),
 * at ANY nesting depth (collectStatementsDeep - an EXIT is very often nested
 * inside an IF, exactly like ee09's own repro). Used to gate
 * renderNestedFallthroughDefs' own EXIT-SECTION/EXIT-PARAGRAPH-specific
 * wrapping so a paragraph list that never uses either (the overwhelming
 * majority of the existing corpus, recursive or not) renders byte-identical
 * Scala to before this fix - only a paragraph list that actually contains
 * one pays for the extra `scala.util.boundary`/`try`-`catch` scaffolding.
 */
function paragraphsContainExitOfType(paragraphs, wantedUpper) {
  return (paragraphs || []).some((p) => {
    let found = false;
    collectStatementsDeep(p.statements, (stmt) => {
      if (found || normalizeStatementType(stmt.type) !== 'EXIT') return;
      if (String(stmt.exitType || 'PARAGRAPH').toUpperCase() === wantedUpper) found = true;
    });
    return found;
  });
}

/**
 * round-29 fix (ee09): the first unit in `paragraphs`, scanning forward from
 * (but not including) `fromIndex`, whose own `sectionName` differs from
 * `paragraphs[fromIndex]`'s - i.e. "the head of whatever SECTION comes right
 * after the one `paragraphs[fromIndex]` belongs to." `null` if every
 * remaining unit shares the same section (there is no "next section" to
 * resume into - see renderSectionAwareEntryCall's own doc comment for what
 * that means for EXIT SECTION). Two units with no enclosing SECTION at all
 * both read as the same (`null`) section, exactly like the rest of this
 * file already treats a section-less paragraph's `sectionName`.
 */
function findNextSectionHead(paragraphs, fromIndex) {
  const sectionName = paragraphs[fromIndex]?.sectionName || null;
  for (let j = fromIndex + 1; j < paragraphs.length; j++) {
    if ((paragraphs[j].sectionName || null) !== sectionName) return paragraphs[j];
  }
  return null;
}

/**
 * round-29 fix (ee09): render the call that invokes `paragraphs[0]` - i.e.
 * the one call site, in both generateProgramFlowLinesNested and
 * generatePerformThruMethod, that "enters" the whole paragraph list from
 * OUTSIDE renderNestedFallthroughDefs' own appended fall-through calls (so
 * renderNestedFallthroughDefs never sees or wraps it). Needs the identical
 * `try { ... } catch { case CobolExitSectionSignal => ... }` treatment a
 * cross-SECTION fall-through transition gets (see renderNestedFallthroughDefs'
 * own doc comment) whenever `paragraphs` actually contains an EXIT SECTION
 * anywhere: an EXIT SECTION fired directly inside `paragraphs[0]` itself (ee09's
 * own shape - PARA-A1, the very first paragraph) has no OTHER call site to be
 * caught at, since this one is emitted directly by the caller, not via
 * another paragraph's own appended tail. The catch body resumes at the next
 * SECTION's own head (findNextSectionHead), or does nothing if `paragraphs[0]`'s
 * SECTION is the last one in this list - matching "EXIT SECTION with nothing
 * left afterward" behaving exactly like normal completion.
 */
/**
 * round-29 REGRESSION fix (dd05-goto-depending-recursive.cbl): `chained`
 * (default `false`, matching every pre-existing caller - generatePerformThruMethod
 * and generateDeclarativeHandlerDefsNested, neither of which changes at all)
 * - when `true` (only ever passed by generateProgramFlowLinesNested, for the
 * program's OWN true entry point), passes `_chain = true` to `paragraphs[0]`'s
 * own def, gated exactly like renderNestedFallthroughDefs' own doc comment
 * describes: the program's natural top-to-bottom fall-through must actually
 * cascade past `paragraphs[0]` (and, transitively, whatever comes after each
 * later paragraph GO TO sends control to), which the `_chain` parameter's
 * whole purpose is to allow - see renderNestedFallthroughDefs' own doc
 * comment for the full mechanism.
 */
function renderSectionAwareEntryCall(paragraphs, indentStr, nameFor, chained = false) {
  const name = nameFor(paragraphs[0]);
  const recursive = isRecursiveNestedFlowMode();
  const chainArg = recursive && chained ? '_chain = true' : '';
  const callExpr = `${name}(${chainArg})`;
  if (!recursive || !paragraphsContainExitOfType(paragraphs, 'SECTION')) {
    return `${indentStr}${callExpr}`;
  }
  const after = findNextSectionHead(paragraphs, 0);
  const afterCall = after ? `${nameFor(after)}(${chainArg})` : '()';
  return [
    `${indentStr}try // round-29 fix: entering paragraphs[0]'s own SECTION - see renderSectionAwareEntryCall's doc comment`,
    `${indentStr}  ${callExpr}`,
    `${indentStr}catch`,
    `${indentStr}  case CobolExitSectionSignal => ${afterCall}`,
  ].join('\n');
}

/**
 * round-29 REGRESSION fix (dd05-goto-depending-recursive.cbl): `gated`
 * (default `false` - every pre-existing caller: generatePerformThruMethod's
 * own THRU-range copy and generateDeclarativeHandlerDefsNested's own
 * DECLARATIVES copy, neither of which changes behavior at all) selects how
 * the auto-chain tail call below behaves, ONLY while
 * isRecursiveNestedFlowMode() is true (false for every OTHER caller - the
 * ordinary convention's shared top-level PERFORM ... THRU wrapper
 * generateAllMethods always builds - so nothing changes there regardless of
 * `gated`):
 *
 *  - `gated: false` (THRU ranges/DECLARATIVES): the tail call, when not
 *    suppressed, runs UNCONDITIONALLY whenever `continues` - exactly the
 *    pre-round-29 behavior these two isolated, body-duplicated contexts
 *    always had (a THRU range's/DECLARATIVES SECTION's own internal
 *    fall-through is never ambiguous about "how was I entered" the way the
 *    WHOLE PROGRAM's shared paragraph list is - see below).
 *  - `gated: true` (generateProgramFlowLinesNested's OWN whole-program
 *    paragraph list only): each def additionally takes a `_chain: Boolean =
 *    false` parameter, and the tail call only fires `if _chain then ...`.
 *    This is the actual regression fix: an out-of-line PERFORM/qualified GO
 *    TO OF SECTION (ee10's own repro) still calls a paragraph's def with NO
 *    args - `_chain` defaults `false`, so it still can never re-trigger
 *    fall-through, exactly like ee10's fix intended. But GO TO's target call
 *    (expression-gen.js's generateGoTo, see its own round-29 fix) now passes
 *    `_chain = true` explicitly - real COBOL GO TO transfers control
 *    permanently to its target and lets NORMAL paragraph-to-paragraph
 *    fall-through resume from there, unlike PERFORM (which runs its target
 *    and returns) - so GO TO's target correctly keeps cascading into
 *    whatever naturally follows it. dd05-goto-depending-recursive.cbl is
 *    exactly this shape: MAIN-PARA's `GO TO PATH-ZERO, PATH-ONE, PATH-TWO
 *    DEPENDING ON WS-SEL` sends control to PATH-TWO, which (not ending in its
 *    own unconditional transfer) must fall through into WRAP-UP afterward -
 *    `_chain = true`, threaded all the way from MAIN-PARA's own entry call
 *    (renderSectionAwareEntryCall's `chained` flag) through the GO TO,
 *    through PATH-TWO's own tail call, makes that happen. The single-def
 *    `return` a fired GO TO produces still short-circuits THIS SAME def's own
 *    appended tail call exactly like the pre-round-29 convention relied on
 *    (both live in the same lexical function again, unlike the round-29
 *    `_stepN` split this replaces) - so MAIN-PARA's own fallback tail
 *    (reached only when WS-SEL matched none of the DEPENDING ON targets)
 *    fires only on that one genuinely-falls-through branch, never on a branch
 *    where GO TO already fired.
 */
function renderNestedFallthroughDefs(paragraphs, defIndent, nameFor, noFallthroughAfter = null, gated = false) {
  const defIndentStr = '  '.repeat(defIndent);
  const lines = [];

  // round-29 fix (ee09/ee10 trio): see isRecursiveNestedFlowMode's own doc
  // comment (expression-gen.js) for the cascading-return bug this whole
  // block exists to fix, ONLY for a RECURSIVE program's own nested-def
  // convention (isRecursiveNestedFlowMode() is false for every OTHER caller
  // of this function - the ordinary convention's shared top-level PERFORM
  // ... THRU wrapper generateAllMethods always builds - so this changes
  // nothing there). Gated per-list on whether `paragraphs` actually contains
  // the relevant EXIT kind at all, so a paragraph list using neither (the
  // overwhelming majority) renders byte-identical to before this fix.
  const recursive = isRecursiveNestedFlowMode();
  const needsParagraphBoundary = recursive && paragraphsContainExitOfType(paragraphs, 'PARAGRAPH');
  const needsSectionCatch = recursive && paragraphsContainExitOfType(paragraphs, 'SECTION');
  // See this function's own doc comment above - every def in a recursive
  // paragraph list gets the SAME `_chain` parameter regardless of `gated`
  // (a THRU-range/DECLARATIVES copy just always ignores it and chains
  // unconditionally), so a GO TO compiled once but reachable, via ordinary
  // Scala lexical shadowing, from either copy of a same-named paragraph
  // (e.g. one inside a THRU range AND the whole-program list) can always
  // pass `_chain = true` without an arity mismatch.
  const chainParam = recursive ? '_chain: Boolean = false' : '';
  const chainArg = recursive ? '_chain = true' : '';

  paragraphs.forEach((para, i) => {
    const name = nameFor(para);
    lines.push(`${defIndentStr}def ${name}(${chainParam}): Unit =`);
    if (needsParagraphBoundary) {
      // EXIT PARAGRAPH here becomes `scala.util.boundary.break()`
      // (expression-gen.js's generateExit / this file's own generateMethodBody
      // EXIT case) - wrapping ONLY this paragraph's own original statements
      // (not the fall-through call appended below, which sits OUTSIDE this
      // boundary) means break() stops exactly at the end of THIS paragraph,
      // same as a correctly-scoped `return` would for the ordinary
      // convention's own separate top-level method, while still letting the
      // appended fall-through call run afterward - EXIT PARAGRAPH must still
      // fall through normally, unlike EXIT SECTION below.
      lines.push(`${defIndentStr}  scala.util.boundary {`);
      lines.push(generateMethodBody(para.statements, defIndent + 2));
      lines.push(`${defIndentStr}  }`);
    } else {
      lines.push(generateMethodBody(para.statements, defIndent + 1));
    }

    const isLast = i === paragraphs.length - 1;
    // round-27 finding 5: a paragraph that is the "through" endpoint of a
    // SORT/MERGE INPUT PROCEDURE or OUTPUT PROCEDURE clause (with or without
    // an explicit THRU - see collectSortMergeThroughEndpoints) must never
    // auto-chain into whatever paragraph physically follows it, even when it
    // doesn't itself end in an unconditional transfer - see this function's
    // own doc comment update below for why. This is a HARD suppression
    // (unaffected by `gated`/`_chain`): SORT/MERGE's own call site
    // (expression-gen.js's procedureCallExpr) always invokes such a paragraph
    // like an ordinary out-of-line PERFORM (never passing `_chain = true`),
    // so it would never auto-chain anyway - kept explicit rather than relying
    // on that indirectly, exactly as round-27 originally required.
    const hardSuppressed = noFallthroughAfter && noFallthroughAfter.has(String(para.name || '').toUpperCase());
    if (!isLast && !hardSuppressed && !statementEndsInUnconditionalTransfer(para.statements)) {
      const nextPara = paragraphs[i + 1];
      const nextName = nameFor(nextPara);
      // round-29 fix: gated mode wraps the whole tail (both branches below)
      // in `if _chain then` - one indent level deeper than the ungated
      // (THRU/DECLARATIVES) tail, which runs unconditionally at `defIndent+1`
      // exactly as before this fix.
      const tailIndent = defIndent + 1 + (gated ? 1 : 0);
      const bi = '  '.repeat(defIndent + 1);
      const ti = '  '.repeat(tailIndent);
      if (gated) lines.push(`${bi}if _chain then`);
      // round-29 fix (ee09): a fall-through call that crosses INTO a
      // different SECTION than the current paragraph's own is exactly where
      // an EXIT SECTION fired anywhere within that NEXT section (however many
      // nested paragraph calls deep - a dynamically-scoped `throw` unwinds
      // through all of them) needs to be caught: `CobolExitSectionSignal`
      // propagates up past however many of that section's own paragraphs
      // already ran, stopping exactly here, then resumes at whatever SECTION
      // comes after THAT one (findNextSectionHead) - or does nothing if it
      // was the program's last SECTION. A same-section fall-through (the
      // common case) needs no wrapping at all: nothing here could ever catch
      // an EXIT SECTION meant for THIS section anyway (it must keep
      // propagating up to wherever THIS section was itself entered).
      if (needsSectionCatch && (para.sectionName || null) !== (nextPara.sectionName || null)) {
        const after = findNextSectionHead(paragraphs, i + 1);
        const afterCall = after ? `${nameFor(after)}(${chainArg})` : '()';
        lines.push(`${ti}try // implicit fall-through into a new SECTION`);
        lines.push(`${ti}  ${nextName}(${chainArg})`);
        lines.push(`${ti}catch`);
        lines.push(`${ti}  case CobolExitSectionSignal => ${afterCall}`);
      } else {
        lines.push(`${ti}${nextName}(${chainArg}) // implicit fall-through`);
      }
    }
  });

  return lines;
}

/**
 * Render a bounded multi-unit fall-through chain by CALLING each unit's own
 * already-generated standalone flat top-level method (see generateAllMethods)
 * - one positionally-named (`_step0`, `_step1`, ...) wrapper `def` per unit,
 * each calling that unit's flat method and then, unless its last statement
 * already unconditionally transfers control away
 * (statementEndsInUnconditionalTransfer) or it's the last unit, calling the
 * next step.
 *
 * Deliberately NOT the same body-duplicating approach generatePerformThruMethod
 * uses (renderNestedFallthroughDefs): that approach names each nested def
 * after the paragraph itself, which generateSectionMethod/
 * generateProgramFlowLines (round-4 findings 7/9) cannot safely do - a
 * SECTION wrapper or the whole-program flow spans every paragraph in a
 * section/program, including ones an ordinary out-of-line
 * `PERFORM <paragraph-name>` elsewhere in that very same section/program
 * explicitly targets. If that target's own body were *also* duplicated here
 * as a same-named sibling nested def, the explicit PERFORM's call site
 * (rendered with the exact same bare/qualified name - see
 * paragraphMethodName/toMethodName, used verbatim regardless of context)
 * would resolve to *this* fallthrough-rigged sibling instead of the real
 * (bounded, no-fallthrough) flat method by ordinary Scala lexical scoping -
 * silently re-running whatever came after it a second, unintended time. This
 * is exactly how a real regression was caught: tests/corpus/proc/p12-sort.cbl's
 * `SORT ... INPUT PROCEDURE 1000-RELEASE-RECORDS OUTPUT PROCEDURE
 * 2000-RETURN-RECORDS` re-triggered 2000-RETURN-RECORDS prematurely (reading
 * the SD buffer *before* the sort itself ran) purely because both paragraphs
 * also happened to be adjacent in the whole-program natural-fall-through
 * chain. Naming each wrapper step positionally instead sidesteps this
 * entirely: nothing outside this function ever calls a `_stepN` name, so it
 * can never be shadowed by, or shadow, an ordinary out-of-line PERFORM.
 *
 * Trade-off, accepted deliberately: a GO TO/PERFORM that is *not* a unit's
 * own last statement (statementEndsInUnconditionalTransfer only inspects the
 * last one) already skips the rest of that unit's own flat method correctly
 * via its own generated `return`/call (an ordinary Scala method return) - but
 * this wrapper, calling that flat method as one opaque unit, cannot then
 * additionally tell "the flat method returned after firing an internal
 * mid-body unconditional transfer" apart from "the flat method simply
 * finished" the way the body-duplicating approach's inline `return` could -
 * so a non-last-statement GOTO in a unit that also participates in this
 * chain may still see this wrapper attempt the next step. Narrow (COBOL
 * style overwhelmingly puts a transfer last, or inside a terminating IF) and
 * far safer than the alternative above.
 */
function renderNestedFallthroughSteps(units, defIndent, flatNameFor) {
  const defIndentStr = '  '.repeat(defIndent);
  const bodyIndentStr = '  '.repeat(defIndent + 1);
  const stepName = (i) => `_step${i}`;
  const lines = [];

  units.forEach((unit, i) => {
    lines.push(`${defIndentStr}def ${stepName(i)}(): Unit =`);
    lines.push(`${bodyIndentStr}${flatNameFor(unit)}()`);
    const isLast = i === units.length - 1;
    if (!isLast && !statementEndsInUnconditionalTransfer(unit.statements)) {
      lines.push(`${bodyIndentStr}${stepName(i + 1)}() // implicit fall-through`);
    }
  });

  return { lines, entryStepName: stepName(0) };
}

/**
 * Generate the wrapper method for a SECTION that contains its own paragraphs
 * - PERFORM of a section name must run every paragraph inside that section,
 * in order (respecting fall-through *within* the section), then return
 * control right after the PERFORM statement - it must NOT continue into the
 * next section, even if that next section immediately follows in source
 * order (round-4 finding 7; verified against cobc with sect01/sect01b: a
 * PERFORM'd section's own last paragraph falling off its end returns to the
 * PERFORM's caller, never spilling into the next SECTION). Built from
 * renderNestedFallthroughSteps (see its doc comment for why - NOT the
 * body-duplicating renderNestedFallthroughDefs generatePerformThruMethod
 * uses), calling each paragraph's own flat top-level method (qualified by
 * `ambiguousNames` exactly like that flat method's own name was resolved in
 * generateAllMethods, so this calls the *same* method, not a name that
 * doesn't exist). Named after the section itself (not `fromNameToToName`) so
 * a plain `PERFORM <section-name>` - which resolves via the exact same
 * toMethodName/paragraphMethodName transform as any paragraph target - finds
 * it.
 *
 * A paragraphless section (statements directly under the SECTION header, no
 * nested paragraph names at all) needs no nesting - it's already a single
 * unit, so it gets a plain flat method exactly like any standalone paragraph.
 */
export function generateSectionMethod(section, indent = 0, ambiguousNames = null) {
  const indentStr = '  '.repeat(indent);
  const methodName = toMethodName(section.name);

  if (!section.paragraphs || section.paragraphs.length === 0) {
    return generateMethodNamed(methodName, section.statements, indent);
  }

  const defIndent = indent + 1;
  const flatNameFor = (p) => resolveParagraphMethodName(p.name, section.name, ambiguousNames);
  // round-7 finding 8: prepend the section's own leading anonymous block (if
  // any) as an implicit first unit, ahead of its named paragraphs.
  const leading = sectionLeadingUnit(section);
  const paragraphUnits = leading ? [leading, ...section.paragraphs] : section.paragraphs;
  const { lines: stepLines, entryStepName } = renderNestedFallthroughSteps(
    paragraphUnits,
    defIndent,
    flatNameFor
  );
  const lines = [`${indentStr}def ${methodName}(): Unit =`, ...stepLines, `${'  '.repeat(defIndent)}${entryStepName}()`];

  return lines.join('\n');
}

/**
 * Generate the lines for the program's true entry point: the *whole*
 * PROCEDURE DIVISION - every paragraph, across every section, in source
 * order - chained via renderNestedFallthroughSteps (round-4 finding 9:
 * "COBOL semantics are sequential fall-through from [the first unit] through
 * the whole division"), calling each unit's own flat top-level method
 * (qualified by `ambiguousNames` exactly like generateAllMethods resolved it,
 * round-4 finding 8) rather than duplicating its body - see
 * renderNestedFallthroughSteps's doc comment for why this specific form is
 * required here (not the body-duplicating approach generateSectionMethod's
 * doc comment initially considered and a real regression - an explicit
 * out-of-line PERFORM elsewhere re-triggering a "later" paragraph a second
 * time - ruled out).
 */
export function generateProgramFlowLines(units, indent, ambiguousNames) {
  if (!units || units.length === 0) {
    return [`${'  '.repeat(indent)}()`];
  }
  const flatNameFor = (u) => resolveParagraphMethodName(u.name, u.sectionName, ambiguousNames);
  const { lines, entryStepName } = renderNestedFallthroughSteps(units, indent, flatNameFor);
  lines.push(`${'  '.repeat(indent)}${entryStepName}()`);
  return lines;
}

/**
 * Body-duplicating counterpart to generateProgramFlowLines, for a RECURSIVE
 * program's own CALL entry point (scala-generator.js's
 * generateRecursiveEntryMethod - round-21 finding 2). An ordinary
 * (non-recursive) program's entry point safely calls each paragraph's
 * already-generated, shared, top-level method (generateProgramFlowLines/
 * renderNestedFallthroughSteps above), because only one activation is ever
 * mid-flight there. A RECURSIVE program can re-enter its own entry point
 * while an outer activation is still on the Scala call stack (a same-program
 * self CALL), so its LINKAGE SECTION parameter(s) must NOT be shared
 * module-level state in that case - every paragraph reachable from the
 * entry point is instead nested as a local `def` *inside* the entry method
 * itself (exactly generatePerformThruMethod's existing body-duplicating
 * `renderNestedFallthroughDefs` pattern - same helper, reused verbatim),
 * so each recursive call to the entry point gets its own fresh local
 * getter/setter LINKAGE binding that every nested paragraph def closes over,
 * matching real per-activation aliasing instead of one shared var stomped
 * by whichever activation is currently deepest.
 */
export function generateProgramFlowLinesNested(units, indent, ambiguousNames) {
  if (!units || units.length === 0) {
    return [`${'  '.repeat(indent)}()`];
  }
  const nameFor = (u) => resolveParagraphMethodName(u.name, u.sectionName, ambiguousNames);
  // round-27 finding 5: see renderNestedFallthroughDefs' own doc comment - a
  // SORT/MERGE INPUT/OUTPUT PROCEDURE paragraph must never auto-chain into
  // whatever paragraph physically follows it (a HARD suppression, unrelated
  // to the `gated`/`_chain` mechanism just below).
  //
  // round-29 REGRESSION fix (dd05-goto-depending-recursive.cbl): pass
  // `gated: true` - see renderNestedFallthroughDefs' own doc comment for the
  // full mechanism this replaces (round-29's original ee10 fix introduced a
  // SEPARATE `_stepN` wrapper chain here, calling each paragraph's flat def
  // as one opaque unit with NO way to tell "returned because its own GO TO
  // fired" apart from "genuinely fell through to its own end" - which
  // spuriously re-cascaded a GO TO's target paragraph's fall-through back
  // into whatever the GO TO's OWN paragraph would otherwise have continued
  // into). `gated: true` keeps ee10 fixed (an explicit out-of-line PERFORM/
  // qualified GO TO OF SECTION still calls with no `_chain` arg, defaulting
  // `false`, so it still can never re-trigger fall-through) while restoring
  // correct GO TO semantics (its target call - expression-gen.js's
  // generateGoTo - explicitly passes `_chain = true`, so real fall-through
  // resumes from wherever GO TO actually sent control, exactly like real
  // COBOL and exactly like the pre-round-29 single-def convention did).
  const noFallthroughAfter = collectSortMergeThroughEndpoints(units);
  const lines = renderNestedFallthroughDefs(units, indent, nameFor, noFallthroughAfter, true);

  // round-25 root cause 3: a `PERFORM x THRU y` range reachable from this
  // RECURSIVE program's own entry point needs its OWN nested-local
  // counterpart here too, not just the shared TOP-LEVEL wrapper method
  // generateAllMethods unconditionally generates for every program
  // (recursive or not, via generatePerformThruMethod). The pre-fix generator
  // only ever built the top-level one - a qualified `PERFORM 1000-PARA OF
  // SEC-A THRU 2000-PARA OF SEC-A` executed from inside a RECURSIVE
  // program's own nested-def body (o13) called straight out to that shared
  // top-level method, whose own nested paragraph defs close over nothing (no
  // getter/setter closures - they read/write the ordinary shared module
  // LINKAGE var generateEntryMethod's non-recursive convention uses), so
  // every LINKAGE reference inside the THRU range silently read/wrote the
  // WRONG (stale, always-default) storage instead of this call activation's
  // own aliased value. generatePerformFromAST's own PERFORM ... THRU call
  // site (this file) always emits a call to the bare, unqualified
  // `performThruWrapperName(...)()` identifier - so declaring a nested `def`
  // with the IDENTICAL name here, inside this same nested scope, makes
  // Scala's ordinary lexical-shadowing rules resolve every such call made
  // from within this program's own nested paragraph defs to THIS
  // activation's version (closing over the correct getter/setter closures,
  // via generatePerformThruMethod's own body-generation reused verbatim)
  // instead of escaping out to the top-level, module-shared one - with zero
  // change needed to the PERFORM ... THRU call-site codegen itself.
  // collectPerformThrus runs the identical collection pass generateAllMethods
  // itself uses, over this SAME `units` list, so every range this program
  // can actually reach gets its nested counterpart, and nothing more.
  for (const thru of collectPerformThrus(units).values()) {
    lines.push(generatePerformThruMethod(thru.from, thru.to, units, ambiguousNames, indent, thru.fromSection, thru.toSection));
  }

  // round-29 REGRESSION fix: enter the program's own true entry point -
  // units[0] - with `_chain = true` (renderSectionAwareEntryCall's `chained`
  // flag), so the program's natural top-to-bottom fall-through (and any GO
  // TO's own further cascade) actually happens, exactly like the pre-round-29
  // single-def convention's unconditional chain did, while an explicit
  // out-of-line PERFORM/GO TO OF SECTION targeting some OTHER paragraph
  // elsewhere (never through this one call site) still defaults `_chain` to
  // `false` and never re-triggers it (ee10 stays fixed).
  lines.push(renderSectionAwareEntryCall(units, '  '.repeat(indent), nameFor, true));
  return lines;
}

/**
 * round-28 finding 1: a RECURSIVE program's own DECLARATIVES `USE AFTER
 * STANDARD ERROR PROCEDURE` handler method(s) need the EXACT SAME nested-
 * local-def treatment generateProgramFlowLinesNested already gives every
 * ORDINARY paragraph reachable from entry() - see that function's own doc
 * comment (and generateRecursiveEntryMethod's, scala-generator.js) for why a
 * RECURSIVE program cannot use shared module-level state for its own LINKAGE
 * SECTION parameter(s).
 *
 * Before this fix, scala-generator.js's generateDeclarativeSupport /
 * generateDeclarativeMethodBodies ALWAYS compiled a DECLARATIVES handler as a
 * flat TOP-LEVEL method (round-10's original, non-recursive-aware
 * convention) that reads/writes whatever module-level `var` a LINKAGE item
 * resolves to for a non-recursive program. For a RECURSIVE program that
 * module-level var is never actually assigned by any real activation (every
 * ordinary paragraph, nested inside entry() via generateProgramFlowLinesNested,
 * closes over that ONE call's own getter/setter closures instead - see
 * generateRecursiveEntryMethod) - so the flat top-level handler method, called
 * by its own bare name from file-io-gen.js's/expression-gen.js's
 * declarativeHandlerFor dispatch (`${handlerMethod}()`), always read the
 * LINKAGE item's stale, never-updated default value instead of the CURRENT
 * activation's real one (dd02: `HANDLER-FIRED AT DEPTH=02` expected, but the
 * flat method could only ever see LS-DEPTH's default `00`).
 *
 * Fixed by generating a SECOND, nested-local counterpart per ERROR-kind
 * DECLARATIVES SECTION directly inside entry()'s own body (called from
 * generateRecursiveEntryMethod, alongside the nested ordinary-paragraph defs
 * and PERFORM-THRU wrapper defs) - named IDENTICALLY to the flat top-level
 * method (`toMethodName(decl.name)`, matching collectDeclarativeHandlers'
 * own registered name exactly), so Scala's ordinary lexical shadowing rules
 * resolve every `${handlerMethod}()` call made from within one of THIS
 * activation's own nested paragraph defs to THIS nested version - closing
 * over the same per-call getter/setter closures every other nested paragraph
 * def already does - instead of escaping out to the stale, module-shared flat
 * one. The pre-existing flat top-level method (still generated exactly as
 * before, by generateDeclarativeMethodBodies - see its own doc comment) is
 * simply unreachable dead code for a RECURSIVE program, exactly like the flat
 * top-level per-paragraph methods generateAllMethods already unconditionally
 * emits (harmless, never called once entry() exists, per
 * generateRecursiveEntryMethod's existing convention).
 *
 * Only a `USE AFTER [STANDARD] ERROR PROCEDURE` SECTION (useClause.kind ===
 * 'ERROR') gets nested here - the only kind declarativeHandlerFor ever
 * dispatches to at all (see collectDeclarativeHandlers); an UNSUPPORTED USE
 * form (e.g. USE FOR DEBUGGING) is never invoked from anywhere, recursive or
 * not, so it has no nested nested-scope staleness bug to fix and is left
 * exactly as generateDeclarativeMethodBodies already handles it (flat-only,
 * with its own visible TODO comment).
 *
 * A DECLARATIVES SECTION with its own nested paragraph(s) (dd02's
 * MISSING-FILE-ERR SECTION / MISSING-FILE-HANDLER paragraph shape) is nested
 * body-duplicating too (renderNestedFallthroughDefs, reused verbatim - same
 * helper generateProgramFlowLinesNested itself uses), with the outer
 * SECTION-named def calling straight into its own nested paragraph def(s) -
 * mirroring generateSectionMethod's flat-method structure, but body-
 * duplicating instead of calling out to a shared top-level method, exactly
 * like generateProgramFlowLinesNested itself does for the whole program's own
 * ordinary paragraphs. Paragraph names inside one DECLARATIVES SECTION are
 * inherently collision-free here (COBOL requires paragraph names be unique
 * within their own section, and these nested defs are scoped inside their own
 * SECTION's own outer def, not spilled flat into entry()'s own top-level
 * scope) - so plain `toMethodName` (not the whole-program collision-aware
 * resolveParagraphMethodName) is enough.
 */
export function generateDeclarativeHandlerDefsNested(declaratives, indent) {
  const lines = [];
  for (const decl of declaratives || []) {
    const useClause = decl.useClause;
    if (!useClause || useClause.kind !== 'ERROR') continue;

    const indentStr = '  '.repeat(indent);
    const methodName = toMethodName(decl.name);

    if (!decl.paragraphs || decl.paragraphs.length === 0) {
      lines.push(`${indentStr}def ${methodName}(): Unit =`);
      // round-29 fix: this flat (no nested paragraphs) DECLARATIVES body is
      // never reached via renderNestedFallthroughDefs' own EXIT PARAGRAPH
      // boundary-wrapping below (there's no paragraph LIST here to gate on) -
      // an EXIT PARAGRAPH inside it would otherwise emit a bare
      // `scala.util.boundary.break()` (isRecursiveNestedFlowMode() is true
      // for the whole of this function, see its own call site) with no
      // enclosing boundary at all, a hard compile error. Defensively wrap
      // whenever this body actually contains one, exactly like a real
      // paragraph's own body would.
      if (isRecursiveNestedFlowMode() && paragraphsContainExitOfType([decl], 'PARAGRAPH')) {
        lines.push(`${indentStr}  scala.util.boundary {`);
        lines.push(generateMethodBody(decl.statements, indent + 2));
        lines.push(`${indentStr}  }`);
      } else {
        lines.push(generateMethodBody(decl.statements, indent + 1));
      }
      continue;
    }

    const defIndent = indent + 1;
    const nameFor = (p) => toMethodName(p.name);
    const leading = sectionLeadingUnit(decl);
    const paragraphUnits = leading ? [leading, ...decl.paragraphs] : decl.paragraphs;
    lines.push(`${indentStr}def ${methodName}(): Unit =`);
    lines.push(...renderNestedFallthroughDefs(paragraphUnits, defIndent, nameFor));
    lines.push(renderSectionAwareEntryCall(paragraphUnits, '  '.repeat(defIndent), nameFor));
  }
  return lines;
}

/**
 * Statement-node fields that carry a NESTED, ordinary (non-WhenClause-
 * wrapped) statement array - shared by every AST statement class that can
 * itself hold an imperative-statement block (see parser/ast.js): inline
 * PERFORM's own body, IF's two branches, and every ON EXCEPTION/SIZE ERROR/
 * OVERFLOW/AT END(-OF-PAGE)/INVALID KEY imperative list any I/O or
 * arithmetic statement carries.
 */
const NESTED_STATEMENT_LIST_FIELDS = [
  'statements', 'thenStatements', 'elseStatements',
  'atEnd', 'notAtEnd', 'atEndOfPage', 'notAtEndOfPage',
  'invalidKey', 'notInvalidKey',
  'onSizeError', 'notOnSizeError',
  'onOverflow', 'notOnOverflow',
  'onException', 'notOnException',
];

/**
 * round-16 finding 4: recurse into EVERY statement-list-bearing field this
 * AST defines (not just a unit's own top-level `.statements`), invoking
 * `visit(stmt)` for each statement node encountered at any nesting depth -
 * an inline PERFORM VARYING/TIMES/UNTIL's own body, an IF's then/else
 * branches, an EVALUATE's WHEN/WHEN-OTHER bodies, a SEARCH's AT END/WHEN
 * bodies, and every ON EXCEPTION/SIZE ERROR/OVERFLOW/INVALID KEY/AT END
 * imperative list any other statement type carries - so a PERFORM ... THRU
 * (or a SORT ... THRU procedure clause) nested arbitrarily deep inside other
 * control-flow constructs is still discovered by generateAllMethods's own
 * PERFORM-THRU-wrapper-method collection pass below. Before this fix that
 * collection only ever walked a paragraph's own flat top-level statement
 * list, so a PERFORM THRU nested inside so much as one PERFORM VARYING loop
 * (let alone two, e10's own shape) never got its `<from>To<to>()` wrapper
 * method generated at all - a hard "not found" compile error the moment
 * such a nested PERFORM THRU actually executed.
 */
function collectStatementsDeep(statements, visit) {
  for (const stmt of statements || []) {
    if (!stmt || typeof stmt !== 'object') continue;
    visit(stmt);

    for (const field of NESTED_STATEMENT_LIST_FIELDS) {
      if (Array.isArray(stmt[field])) collectStatementsDeep(stmt[field], visit);
    }

    // EVALUATE's WHEN clauses (and SEARCH's WHEN clauses) wrap their own
    // statement list inside a WhenClause/SearchWhenClause object rather than
    // exposing it as a direct field of the EVALUATE/SEARCH statement itself.
    if (stmt.type === 'EvaluateStatement') {
      for (const when of stmt.whenClauses || []) collectStatementsDeep(when.statements, visit);
    }
    if (stmt.type === 'SearchStatement') {
      for (const when of stmt.whenClauses || []) collectStatementsDeep(when.statements, visit);
    }
  }
}

/**
 * Collect every `PERFORM x [OF/IN secX] THRU y [OF/IN secY]` range (and
 * SORT/MERGE's own INPUT PROCEDURE/OUTPUT PROCEDURE THRU-range clauses)
 * reachable anywhere in `units`' own statement trees, keyed by (fromParagraph,
 * fromSection, toParagraph, toSection) - not just the bare paragraph names -
 * so two qualified THRU ranges sharing both bare endpoint names in DIFFERENT
 * sections (`PERFORM PARA-ONE OF SEC-A THRU PARA-TWO OF SEC-A` vs `... OF
 * SEC-B THRU ... OF SEC-B`, round-14 finding 1) are collected as two distinct
 * entries, never collapsed into one.
 *
 * round-13 finding 2: a SORT statement's own INPUT PROCEDURE/OUTPUT PROCEDURE
 * clauses (SortStatement.inputProcedure/.outputProcedure - a `{ procedure,
 * through }` shape, parser/ast.js/parser/procedure-parser.js's
 * parseSortProcedureClause) can ALSO name a THRU range (`INPUT PROCEDURE IS
 * 1000-FILL THRU 1000-FILL-EXIT`), exactly like a PERFORM statement's own `x
 * THRU y` - expression-gen.js's generateSort/procedureCallExpr already
 * assumes a THRU-range procedure clause resolves to the same `<from>To<To>()`
 * wrapper method generatePerformThruMethod builds for an ordinary PERFORM ...
 * THRU, so this collection also has to look at SortStatement/MergeStatement,
 * not just PerformStatement. Round-20 finding (i06): even with NO THRU at
 * all, "OUTPUT PROCEDURE IS X" is still its own implicit, single-paragraph
 * range - `{procedure: X, through: X}` reuses the exact same range machinery
 * annotateGoToThruEscapes already applies to an explicit `PERFORM x THRU y`.
 *
 * round-16 finding 4: recurses via collectStatementsDeep (inline PERFORM
 * VARYING/TIMES/UNTIL bodies, IF branches, EVALUATE/SEARCH WHEN bodies, every
 * ON EXCEPTION/SIZE ERROR/OVERFLOW/INVALID KEY/AT END(-OF-PAGE) imperative
 * list) so a PERFORM THRU (or SORT/MERGE ... THRU clause) at ANY nesting
 * depth is found, not just at a paragraph's own top level.
 *
 * round-25 root cause 3: factored out of generateAllMethods (which builds one
 * TOP-LEVEL wrapper method per entry here) so generateProgramFlowLinesNested
 * can run the identical pass over the identical `units` list and build its
 * OWN nested-local counterpart for a RECURSIVE program's entry() body - see
 * that function's own doc comment for why a RECURSIVE program's PERFORM ...
 * THRU needs this at all (the shared top-level wrapper's own nested defs
 * close over nothing - they read/write the ordinary shared module LINKAGE
 * var, not this specific call activation's own getter/setter closures).
 */
export function collectPerformThrus(units) {
  const performThrus = new Map();
  function addPerformThru(from, fromSection, to, toSection) {
    if (!from || !to) return;
    const key = JSON.stringify([from, fromSection || null, to, toSection || null]);
    if (!performThrus.has(key)) {
      performThrus.set(key, { from, fromSection: fromSection || null, to, toSection: toSection || null });
    }
  }

  for (const unit of units) {
    collectStatementsDeep(unit.statements, stmt => {
      if (stmt.type === 'PerformStatement' && stmt.throughParagraph) {
        addPerformThru(stmt.targetParagraph, stmt.targetSection, stmt.throughParagraph, stmt.throughSection);
      }
      if (stmt.type === 'SortStatement' || stmt.type === 'MergeStatement') {
        // SORT/MERGE's own INPUT/OUTPUT PROCEDURE clause has no OF/IN
        // qualifier grammar of its own (parseSortProcedureClause never
        // parses one) - always unqualified (null sections).
        if (stmt.inputProcedure?.procedure) {
          addPerformThru(stmt.inputProcedure.procedure, null, stmt.inputProcedure.through || stmt.inputProcedure.procedure, null);
        }
        if (stmt.outputProcedure?.procedure) {
          addPerformThru(stmt.outputProcedure.procedure, null, stmt.outputProcedure.through || stmt.outputProcedure.procedure, null);
        }
      }
    });
  }

  return performThrus;
}

/**
 * round-27 finding 5: the set of paragraph names (upper-cased) that are the
 * "through" endpoint of a SORT/MERGE INPUT PROCEDURE or OUTPUT PROCEDURE
 * clause - with an explicit THRU, the named end paragraph; without one, the
 * clause's own single paragraph (round-20 finding i06's `{procedure: X,
 * through: X}` shape - see collectPerformThrus' own doc comment). Used only by
 * generateProgramFlowLinesNested (see renderNestedFallthroughDefs' own
 * round-27 doc comment) to suppress the auto-fall-through edge FROM one of
 * these paragraphs INTO whatever paragraph physically follows it - a
 * RECURSIVE-program-specific gap an ordinary (non-recursive) program's flat
 * per-paragraph methods never had to begin with.
 */
function collectSortMergeThroughEndpoints(units) {
  const endpoints = new Set();
  const add = (procClause) => {
    if (!procClause || !procClause.procedure) return;
    const through = procClause.through || procClause.procedure;
    endpoints.add(String(through).toUpperCase());
  };
  for (const unit of units) {
    collectStatementsDeep(unit.statements, stmt => {
      if (stmt.type === 'SortStatement' || stmt.type === 'MergeStatement') {
        add(stmt.inputProcedure);
        add(stmt.outputProcedure);
      }
    });
  }
  return endpoints;
}

/**
 * round-19 finding 2 (h11): a `GO TO` (plain or `... DEPENDING ON`) whose
 * target paragraph lies OUTSIDE an active `PERFORM x THRU y` range it is
 * textually inside is, in real COBOL, a PERMANENT transfer of control - the
 * implicit "fall off the range's own end and return to the PERFORM's own
 * caller" behavior a normal in-range exit gets is abandoned entirely; control
 * never comes back, no matter how many PERFORM calls are currently nested.
 * This generator models every paragraph as an ordinary Scala method and
 * PERFORM as an ordinary method call (see generateGoTo's own doc comment) -
 * which can only ever return normally once its callee(s) return, so a
 * generated program instead silently RESUMES after the original PERFORM once
 * every nested call unwinds, diverging from real cobc.
 *
 * A genuine fix (a thrown control-flow signal caught by a top-level dispatch
 * loop, so the whole call stack actually unwinds and never resumes) would
 * need "which THRU range, if any, is lexically active" threaded as context
 * through every statement-generation call site in expression-gen.js/
 * method-gen.js (arbitrarily deep inside IF/EVALUATE/PERFORM-VARYING bodies) -
 * a large, invasive refactor whose blast radius is entirely out of proportion
 * to this one narrow finding. Per this campaign's own precedent for an
 * honest, VISIBLE non-fix (round-15 finding 8, round-16 through 18's various
 * ref-mod-adjacent placeholders) - this function instead only ANNOTATES the
 * affected GoToStatement AST nodes (never rewrites behavior) so generateGoTo
 * can emit a compiling, grep-able comment marking the gap at the exact
 * statement that has it; the runtime behavior itself is left exactly as
 * (silently) wrong as before this round - see tests/oracle/README.md's round-19
 * table and known gaps for the full writeup.
 *
 * Only covers a FORWARD, both-endpoints-resolved THRU range (the overwhelming
 * common case, and h11's own shape) - a backward range (round-9 finding 5) or
 * an unresolved endpoint is left unannotated rather than guessed at.
 */
function annotateGoToThruEscapes(units, performThrus) {
  for (const thru of performThrus.values()) {
    const startIndex = units.findIndex(
      u => u.name === thru.from && (!thru.fromSection || u.sectionName === thru.fromSection)
    );
    const endIndex = units.findIndex(
      u => u.name === thru.to && (!thru.toSection || u.sectionName === thru.toSection)
    );
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) continue;

    const rangeUnits = units.slice(startIndex, endIndex + 1);
    const rangeNames = new Set(rangeUnits.map(u => u.name));
    const rangeLabel = thru.to ? `${thru.from} THRU ${thru.to}` : thru.from;

    for (const unit of rangeUnits) {
      collectStatementsDeep(unit.statements, stmt => {
        if (stmt.type !== 'GoToStatement') return;
        const targets = stmt.targets && stmt.targets.length > 0 ? stmt.targets : [];
        const outOfRange = targets.filter(t => {
          const name = typeof t === 'string' ? t : (t?.name || t);
          return name && !rangeNames.has(name);
        });
        if (outOfRange.length === 0) return;
        if (!stmt._thruEscapeTargets) stmt._thruEscapeTargets = new Set();
        for (const t of outOfRange) stmt._thruEscapeTargets.add(t);
        stmt._thruEscapeRange = rangeLabel;
      });
    }
  }
}

/**
 * Generate all methods from the PROCEDURE DIVISION's top-level (section-less)
 * paragraphs and its SECTIONs.
 *
 * Every paragraph - whether genuinely top-level or nested inside a section -
 * still gets its own standalone flat top-level method (used for a direct,
 * non-THRU `PERFORM <paragraph-name>` targeting just that one paragraph,
 * regardless of which section it lives in), with its bare name qualified by
 * its enclosing section only when that bare name would otherwise collide
 * with another paragraph elsewhere in the program (round-4 finding 8). Each
 * section that itself contains paragraphs additionally gets its own bounded
 * wrapper method (generateSectionMethod, round-4 finding 7), and every
 * PERFORM ... THRU range still gets its own wrapper exactly as before.
 */
export function generateAllMethods(topLevelParagraphs, sections, indent = 0) {
  const units = flattenProcedureUnits(topLevelParagraphs, sections);

  const ambiguousNames = collectAmbiguousParagraphNames(topLevelParagraphs, sections);
  // round-12 bonus finding: make this same ambiguity set available to
  // generatePerformFromAST (via resolvePerformTargetMethodName), several
  // call frames below inside generateMethodNamed/generateMethodBody, for any
  // PERFORM statement that carries an explicit OF/IN qualifier - see this
  // module's own setAmbiguousParagraphNamesForPerform doc comment.
  //
  // Installed unconditionally, BEFORE the units.length===0 early return just
  // below (cross-call leak fix, same class as generateDeclarativeSupport's
  // in scala-generator.js): a program with an empty PROCEDURE DIVISION (no
  // paragraphs/sections at all) must still overwrite whatever ambiguity set
  // a *previous* generateAllMethods call in the same process installed,
  // rather than silently leaving it in place - AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM
  // is module-level state in both this module and expression-gen.js.
  setAmbiguousParagraphNamesForPerform(ambiguousNames);
  // Same set, threaded to expression-gen.js's own generatePerform (the
  // sibling of generatePerformFromAST for a PERFORM nested inside an IF/
  // EVALUATE/SEARCH branch body, etc.) via its own identically-purposed
  // setter - see that module's paragraphMethodName/AMBIGUOUS_PARAGRAPH_NAMES_FOR_PERFORM.
  setAmbiguousParagraphNamesForPerformExpr(ambiguousNames);

  if (units.length === 0) {
    return '';
  }

  const methods = [];
  // round-25 root cause 3: collection logic factored out into
  // collectPerformThrus (below) so generateProgramFlowLinesNested can reuse
  // the identical pass over the identical `units` list, for a RECURSIVE
  // program's own nested-def PERFORM ... THRU wrapper (see that function's
  // own doc comment).
  const performThrus = collectPerformThrus(units);

  // round-19 finding 2 (h11): annotate every GoToStatement AST node whose
  // target lies OUTSIDE an enclosing PERFORM ... THRU range this same
  // collection pass just discovered - see annotateGoToThruEscapes's own doc
  // comment for why this is a documented, visible non-fix rather than a real
  // fix. Must run before either generation loop below (both eventually reach
  // generateGoTo, which reads the annotation).
  annotateGoToThruEscapes(units, performThrus);

  // Flat standalone top-level methods - one per paragraph (collision-
  // qualified name), plus one per paragraphless section (never ambiguous:
  // paragraphless sections stand in for themselves, sectionName null).
  for (const unit of units) {
    const methodName = resolveParagraphMethodName(unit.name, unit.sectionName, ambiguousNames);
    methods.push(generateMethodNamed(methodName, unit.statements, indent));
  }

  // Section wrapper methods (PERFORM-of-section-name support).
  for (const section of sections || []) {
    if (section.paragraphs && section.paragraphs.length > 0) {
      methods.push(generateSectionMethod(section, indent, ambiguousNames));
    }
  }

  // PERFORM THRU wrapper methods, over the same whole-program flattened
  // `units` list (name/statements/sectionName) generateAllMethods already
  // built above - round-5 finding 2 needs each unit's own sectionName here
  // (not just its bare paragraph list) so generatePerformThruMethod can
  // resolve collision-safe nested-def names via resolveParagraphMethodName,
  // exactly like the flat top-level methods above already do.
  for (const thru of performThrus.values()) {
    methods.push(generatePerformThruMethod(thru.from, thru.to, units, ambiguousNames, indent, thru.fromSection, thru.toSection));
  }

  return methods.join('\n\n');
}

export default {
  toMethodName,
  generateMethod,
  generatePerformThruMethod,
  generateSectionMethod,
  generateProgramFlowLines,
  generateProgramFlowLinesNested,
  generateDeclarativeHandlerDefsNested,
  generateAllMethods,
  collectAmbiguousParagraphNames,
  resolveParagraphMethodName,
  flattenProcedureUnits,
  collectPerformThrus,
};
