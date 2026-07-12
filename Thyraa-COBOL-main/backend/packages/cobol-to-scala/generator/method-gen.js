/**
 * method-gen.js
 * Convert COBOL paragraphs/procedures to Scala methods
 */

import { toCamelCase, toPascalCase, mapCobolTypeToScala } from './case-class-gen.js';
import {
  generateExpression,
  convertCondition,
  setAmbiguousParagraphNamesForPerform as setAmbiguousParagraphNamesForPerformExpr,
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
        } else {
          // EXIT PARAGRAPH: every paragraph is its own Scala method, so
          // `return` skips only the rest of *this* paragraph (round-3
          // finding 2 - the pre-fix `()` no-op skipped nothing). Still
          // compiles even when EXIT is the only statement in its paragraph -
          // a common THRU-range-endpoint idiom (e.g. "1900-EXIT-PARA. EXIT.").
          lines.push('  '.repeat(indent) + 'return // EXIT PARAGRAPH');
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
    const initLines = testBefore
      ? levels.map(l => `${bi}${toCamelCase(l.variable || 'i')} = ${varyingOperandExpr(l.from, 1)}`).join('\n') + '\n'
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
    const resetDeeperLines = levels
      .slice(i + 1)
      .map(l => `${bodyIndentStr}${toCamelCase(l.variable || 'i')} = ${varyingOperandExpr(l.from, 1)}`)
      .join('\n');
    return [
      `${indentStr}while !(${until}) do`,
      body,
      `${bodyIndentStr}${varName} = ${varName} + ${by}`,
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
  return `${indentStr}${varName} = ${from}
${indentStr}while
${body}
${bodyIndentStr}!(${until})
${indentStr}do
${bodyIndentStr}${varName} = ${varName} + ${by}`;
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
  const bump = (name) => {
    const bare = toMethodName(name);
    counts.set(bare, (counts.get(bare) || 0) + 1);
  };

  for (const p of topLevelParagraphs || []) bump(p.name);
  for (const s of sections || []) {
    const paras = s.paragraphs && s.paragraphs.length > 0 ? s.paragraphs : [s];
    if (s.paragraphs && s.paragraphs.length > 0) {
      const leading = sectionLeadingUnit(s);
      if (leading) bump(leading.name);
    }
    for (const p of paras) bump(p.name);
  }

  const ambiguous = new Set();
  for (const [name, count] of counts) {
    if (count > 1) ambiguous.add(name);
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
  lines.push(`${'  '.repeat(defIndent)}${nameFor(rangeUnits[0])}()`);
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
 */
function renderNestedFallthroughDefs(paragraphs, defIndent, nameFor) {
  const defIndentStr = '  '.repeat(defIndent);
  const lines = [];

  paragraphs.forEach((para, i) => {
    const name = nameFor(para);
    lines.push(`${defIndentStr}def ${name}(): Unit =`);
    lines.push(generateMethodBody(para.statements, defIndent + 1));

    const isLast = i === paragraphs.length - 1;
    if (!isLast && !statementEndsInUnconditionalTransfer(para.statements)) {
      const nextName = nameFor(paragraphs[i + 1]);
      lines.push(`${'  '.repeat(defIndent + 1)}${nextName}() // implicit fall-through`);
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
  // round-14 finding 1: keyed by (fromParagraph, fromSection, toParagraph,
  // toSection) - not just the bare paragraph names - so two qualified THRU
  // ranges that happen to share both bare endpoint names in DIFFERENT
  // sections (`PERFORM PARA-ONE OF SEC-A THRU PARA-TWO OF SEC-A` vs `... OF
  // SEC-B THRU ... OF SEC-B`) are collected as two distinct wrapper methods,
  // not collapsed into a single Set entry (which previously resolved to
  // whichever range `generatePerformThruMethod`'s own bare-name unit lookup
  // happened to find first in program order, regardless of which one - or
  // both - callers actually asked for).
  const performThrus = new Map();
  function addPerformThru(from, fromSection, to, toSection) {
    if (!from || !to) return;
    const key = JSON.stringify([from, fromSection || null, to, toSection || null]);
    if (!performThrus.has(key)) {
      performThrus.set(key, { from, fromSection: fromSection || null, to, toSection: toSection || null });
    }
  }

  // First pass - collect PERFORM THRU targets (PerformStatement AST nodes
  // use .targetParagraph/.throughParagraph - see parser/ast.js - not
  // .target/.thru).
  //
  // round-13 finding 2: a SORT statement's own INPUT PROCEDURE/OUTPUT
  // PROCEDURE clauses (SortStatement.inputProcedure/.outputProcedure - a
  // `{ procedure, through }` shape, parser/ast.js/parser/procedure-parser.js's
  // parseSortProcedureClause) can ALSO name a THRU range (`INPUT PROCEDURE IS
  // 1000-FILL THRU 1000-FILL-EXIT`), exactly like a PERFORM statement's own
  // `x THRU y` - but this collection loop previously only ever looked at
  // PerformStatement nodes, never SortStatement. expression-gen.js's
  // generateSort/procedureCallExpr already assumes (and always has assumed)
  // that a THRU-range procedure clause resolves to the same
  // `<from>To<To>()` wrapper method generatePerformThruMethod builds for an
  // ordinary PERFORM ... THRU - so a SORT with an INPUT/OUTPUT PROCEDURE ...
  // THRU clause called a wrapper method that generateAllMethods never
  // actually generated (a hard "not found" compile error) unless some
  // *other*, unrelated PERFORM statement in the same program happened to
  // request the identical THRU range coincidentally. Collecting THRU ranges
  // from SortStatement here too - the exact same targetParagraph/through
  // Set entries generatePerformThruMethod's loop below already consumes -
  // is a pure addition: it only ever adds wrapper methods that a SORT ...
  // THRU clause elsewhere in this same collection loop's file will actually
  // call, never changes anything for a program with no such clause.
  //
  // round-16 finding 4: this collection previously only walked each unit's
  // own TOP-LEVEL `.statements` list - a PERFORM ... THRU nested inside any
  // other control-flow construct's own body (an inline PERFORM VARYING/TIMES/
  // UNTIL, an IF's then/else branch, an EVALUATE WHEN, a SEARCH WHEN) was
  // invisible to it, so generatePerformThruMethod's own wrapper method never
  // got generated at all - a hard "not found: <from>To<to>" compile error the
  // moment such a nested PERFORM THRU actually executed (e10: two PERFORM
  // VARYING loops nesting a `PERFORM SECA-P1 THRU SECB-P2`). `collectStatementsDeep`
  // recurses into every statement-list-bearing field this AST defines
  // (inline PERFORM's own body, IF's two branches, EVALUATE's WHEN/WHEN-OTHER
  // bodies, SEARCH's AT END/WHEN bodies, and every ON EXCEPTION/SIZE ERROR/
  // OVERFLOW/INVALID KEY/AT END(-OF-PAGE) imperative-statement list any
  // other statement type carries) so a PERFORM THRU (or a SORT ... THRU
  // procedure clause) at ANY nesting depth is found, not just at a
  // paragraph's own top level.
  for (const unit of units) {
    collectStatementsDeep(unit.statements, stmt => {
      if (stmt.type === 'PerformStatement' && stmt.throughParagraph) {
        addPerformThru(stmt.targetParagraph, stmt.targetSection, stmt.throughParagraph, stmt.throughSection);
      }
      if (stmt.type === 'SortStatement') {
        // SORT's own INPUT/OUTPUT PROCEDURE ... THRU clause has no OF/IN
        // qualifier grammar of its own (parseSortProcedureClause never
        // parses one) - always unqualified (null sections).
        if (stmt.inputProcedure?.procedure && stmt.inputProcedure.through) {
          addPerformThru(stmt.inputProcedure.procedure, null, stmt.inputProcedure.through, null);
        }
        if (stmt.outputProcedure?.procedure && stmt.outputProcedure.through) {
          addPerformThru(stmt.outputProcedure.procedure, null, stmt.outputProcedure.through, null);
        }
      }
    });
  }

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
  generateAllMethods,
  collectAmbiguousParagraphNames,
  resolveParagraphMethodName,
  flattenProcedureUnits,
};
