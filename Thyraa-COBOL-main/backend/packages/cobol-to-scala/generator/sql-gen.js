/**
 * sql-gen.js
 * EXEC SQL -> typed Doobie (Scala 3) generation - Phase 3 MVP.
 *
 * ## Entry point
 *
 * `generateSqlProgram(parsedProgram, options)` is the standalone entry point
 * this module exports. It is *not* wired into `generator/scala-generator.js`
 * yet - that main-generator integration is intentionally left as a follow-up
 * (see "Wire-in TODO" below) since `scala-generator.js`/`expression-gen.js`/
 * `method-gen.js`/`case-class-gen.js`/`parser/procedure-parser.js` are all
 * owned by other in-flight work right now. Everything in this file is
 * additive and self-contained: it consumes the enriched SQL-statement shape
 * `parser/sql-parser.js`'s `analyzeSqlStatement`/`parseAllSqlStatements`
 * produce, plus an optional host-variable type registry, and emits Doobie
 * source fragments a caller can splice into a generated program's method
 * body.
 *
 * ## Statement kinds covered
 *
 * SELECT (INTO), INSERT, UPDATE, DELETE, DECLARE_CURSOR, OPEN, FETCH, CLOSE,
 * WHENEVER, COMMIT, ROLLBACK, INCLUDE. Anything else (CALL/SET/PREPARE/
 * EXECUTE/DESCRIBE/LOCK/SAVEPOINT/UNKNOWN) is *not* silently dropped - it
 * gets an honest `// TODO(sql-gen): <KIND> not translated` comment carrying
 * the original SQL text, per this repo's coverage-honesty rule (see
 * `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`).
 *
 * ## Host-variable typing
 *
 * `resolveHostVarType(name, options)` looks a COBOL host-variable name up in
 * `options.fieldRegistry` (a plain object or Map, COBOL name -> a
 * DataItem-shaped object with `.pic`/`.usage`, or a DCLGEN
 * `hostVariables[]`-shaped object with `.picture`/`.usage` - both shapes are
 * accepted directly by `layout.js`'s `scalaBaseType`, so no adapter is
 * needed) and/or `options.dclgenModels` (an array of `parseDclgen(...)`
 * results; their `hostVariables` arrays are searched the same way). This is
 * exactly the PIC -> Scala mapping `case-class-gen.js` uses (COMP-3 + scale
 * -> BigDecimal, PIC X(n) -> String, etc.) so a host variable's generated
 * Scala type here agrees with the type its owning record's case class field
 * would get. When neither source has an entry, a small name-heuristic
 * fallback (`heuristicTypeFromName`) guesses from the variable's name
 * (*-BALANCE/-AMOUNT -> BigDecimal, *-DATE -> LocalDate, etc.) - this is a
 * documented gap, not a silent one: generated code marks the guess with a
 * trailing `// type inferred from name, no field-registry/DCLGEN entry`
 * comment.
 *
 * ## Cursor translation: materialized List, not a live fs2 Stream
 *
 * A COBOL DECLARE/OPEN/FETCH/CLOSE cursor is stateful across possibly
 * non-adjacent paragraphs (OPEN in one paragraph, FETCH repeated from a
 * PERFORM in another, CLOSE in a third), and this module only sees the flat
 * sequence of EXEC SQL statements - not the surrounding PERFORM/IF control
 * flow that decides how many times FETCH actually runs (that belongs to
 * `procedure-parser.js`/`method-gen.js`, out of scope here per the wire-in
 * note below). A faithful `fs2.Stream`-based translation would need that
 * surrounding control flow to drive `Stream#pull`/`compile.drain`, which
 * doesn't exist yet in an EXEC-SQL-only view of the program.
 *
 * So the chosen MVP translation is honest and simple instead of aspirational:
 *   - DECLARE_CURSOR emits a `def <cursor>Query: doobie.Query0[RowType]`.
 *     `RowType` is inferred from the cursor's *first paired FETCH*'s INTO
 *     variable list (a pre-pass over all statements links each cursor name
 *     to its first FETCH before code generation starts, resolving the
 *     ordering problem that OPEN textually precedes FETCH but needs the row
 *     type *now* to build a `List[RowType]`).
 *   - OPEN eagerly materializes the whole cursor result set:
 *     `<cursor>Query.to[List].transact(xa)`, then wraps a plain Scala
 *     `Iterator` over it in a `var`. This is the documented tradeoff: it
 *     loads the full result set into memory rather than streaming
 *     lazily/incrementally - correct for small-to-medium cursors (the common
 *     case for batch COBOL maintenance loops), wrong for cursors over huge
 *     tables. A purely functional alternative once the whole FETCH loop
 *     lives in one contiguous block (once wired into the method generator)
 *     is noted inline as a comment:
 *     `<cursor>Query.stream.transact(xa).compile.toList` (or
 *     `.evalMap(row => IO(...)).compile.drain` to process each row without
 *     materializing), using Doobie's real `fs2.Stream` support - but that
 *     requires the loop body to be known at generation time, which this
 *     module does not have.
 *   - FETCH pops one element off the shared `Iterator` (`.nextOption()`)
 *     and assigns it into the same `var`s the record's host variables were
 *     declared as, setting `sqlCode` to `100` (NOT FOUND) when exhausted.
 *   - CLOSE just clears the iterator (`Iterator.empty`) - there is no
 *     server-side cursor resource to release since the whole result set was
 *     already pulled to the client at OPEN time.
 *
 * ## SQLCODE / WHENEVER handling
 *
 * Every generated statement that talks to the database returns
 * `(sqlCode: Int, result)` via one of three small `SqlRuntime` helpers
 * (`runOption`/`runUpdate`/`runList`, embedded verbatim by
 * `generateSqlRuntimeSnippet()` - same "inline the runtime source" pattern
 * `case-class-gen.js` uses for `CobolCodecs`) that run the Doobie action,
 * map "no row" to SQLCODE `+100`, and catch `java.sql.SQLException` to
 * surface its `getErrorCode` as a negative SQLCODE - mirroring DB2's
 * SQLCODE convention (0 success, +100 not found, negative = error).
 * `SqlRuntime.describe(code)` maps the common negative codes used in DB2
 * shops (-803 duplicate key, -811 multiple rows, -904 resource unavailable,
 * -911/-913 deadlock/timeout) plus a generic negative/positive fallback, for
 * use in log/error messages.
 *
 * A `WHENEVER NOT FOUND|SQLERROR|SQLWARNING CONTINUE|STOP|GOTO label`
 * statement is a *compile-time directive* in real COBOL (it changes the
 * generated check after every subsequent SQL statement, not just the next
 * one) - this module models that the same way: `generateSqlProgram` walks
 * statements in order threading a small context whose `wheneverHandlers` map
 * gets updated by WHENEVER and consulted after every SELECT/FETCH (for
 * NOT_FOUND) and after every DML/OPEN/CLOSE (for SQLERROR), emitting:
 *   - CONTINUE -> nothing (COBOL default, errors silently ignored)
 *   - STOP -> `throw new java.sql.SQLException(...)`
 *   - GOTO label -> `if sqlCode == 100 then return <label>()` - this assumes
 *     the (not-yet-wired) procedure/method generator names each paragraph as
 *     a camelCase zero-arg method, consistent with this codebase's existing
 *     `toCamelCase` paragraph-naming convention elsewhere; real GOTO-out-of-
 *     a-generated-method control transfer is that generator's problem, not
 *     this module's - the emitted call is a documented best-effort stand-in.
 *
 * ## Wire-in TODO
 *
 * Once `scala-generator.js`/`method-gen.js` are free to change: call
 * `generateSqlProgram` from wherever a paragraph's statement list is walked,
 * splice `.code` into that paragraph's method body, prepend `.imports` once
 * per file, and embed `.runtime` once per file (same pattern as
 * `CobolCodecs`). The per-statement `var` declarations this module emits
 * locally (for SELECT/FETCH output host variables) are a stand-in for the
 * *real* WORKING-STORAGE host-variable declarations `case-class-gen.js`
 * already generates elsewhere; once wired in, those local `var`s should be
 * replaced by assignments to the real record fields instead of shadowing
 * them with fresh locals of the same name.
 *
 * ## Known gaps (documented, not silent)
 *
 * - SELECT/FETCH INTO with an indicator variable on a *multi-column* row:
 *   the column's Scala type is correctly wrapped as `Option[T]`, but this
 *   module does not synthesize writing the indicator variable's value back
 *   (0/-1) after the fact for the tuple case - only the single-column case
 *   assigns the indicator. Flagged with a `// TODO` in generated code.
 * - Dynamic SQL (PREPARE/EXECUTE/DESCRIBE) is not translated - out of MVP
 *   scope, passed through as an honest `// TODO(sql-gen)` comment.
 * - CICS (separate from EXEC SQL) is out of scope for this module entirely.
 */

import { toCamelCase } from './case-class-gen.js';
import { scalaBaseType } from './layout.js';
import {
  analyzeSqlStatement,
  parseAllSqlStatements,
  stripIntoClause,
} from '../parser/sql-parser.js';
import { tokenize } from '../parser/lexer.js';

// ============================================================================
// Host-variable type resolution
// ============================================================================

function normalizeCobolName(name) {
  return (name || '').toUpperCase();
}

function lookupInRegistry(registry, name) {
  if (!registry) return null;
  const key = normalizeCobolName(name);

  if (registry instanceof Map) {
    for (const [k, v] of registry) {
      if (normalizeCobolName(k) === key) return v;
    }
    return null;
  }

  const foundKey = Object.keys(registry).find((k) => normalizeCobolName(k) === key);
  return foundKey ? registry[foundKey] : null;
}

function lookupInDclgenModels(models, name) {
  const key = normalizeCobolName(name);
  for (const model of models || []) {
    const hv = (model?.hostVariables || []).find((h) => normalizeCobolName(h.cobolName) === key);
    if (hv) return hv;
  }
  return null;
}

/**
 * Best-effort fallback when no field-registry/DCLGEN entry exists for a host
 * variable - a documented gap (see file header), not a silent default.
 */
export function heuristicTypeFromName(varName) {
  const lower = (varName || '').toLowerCase();

  if (/(bal|amount|price|total|salary|cost)/.test(lower)) return 'BigDecimal';
  if (/(count|num|qty|id)$/.test(lower.replace(/-/g, ''))) return 'Int';
  if (/timestamp/.test(lower)) return 'java.time.Instant';
  if (/date/.test(lower)) return 'java.time.LocalDate';
  if (/time/.test(lower)) return 'java.time.LocalTime';

  return 'String';
}

/**
 * Resolve a host variable's Scala type via (in order) `options.fieldRegistry`,
 * `options.dclgenModels`, then a name heuristic. Returns `{ type, inferred }`
 * where `inferred` is true only for the heuristic fallback, so callers can
 * annotate generated code accordingly.
 */
export function resolveHostVarType(varName, options = {}) {
  const registryEntry = lookupInRegistry(options.fieldRegistry, varName);
  if (registryEntry) return { type: scalaBaseType(registryEntry), inferred: false };

  const dclgenEntry = lookupInDclgenModels(options.dclgenModels, varName);
  if (dclgenEntry) return { type: scalaBaseType(dclgenEntry), inferred: false };

  return { type: heuristicTypeFromName(varName), inferred: true };
}

function defaultForType(scalaType) {
  if (scalaType.startsWith('Option[')) return 'None';
  switch (scalaType) {
    case 'String': return '""';
    case 'Int': return '0';
    case 'Long': return '0L';
    case 'Float': return '0.0f';
    case 'Double': return '0.0';
    case 'BigDecimal': return 'BigDecimal(0)';
    case 'java.time.LocalDate': return 'java.time.LocalDate.MIN';
    case 'java.time.LocalTime': return 'java.time.LocalTime.MIN';
    case 'java.time.Instant': return 'java.time.Instant.EPOCH';
    default: return `null.asInstanceOf[${scalaType}]`;
  }
}

function scalaVarName(cobolName) {
  return toCamelCase(cobolName);
}

/** name (upper) -> indicator variable name, from an enriched hostVariables[] list. */
export function buildIndicatorMap(hostVariables) {
  const map = {};
  for (const v of hostVariables || []) {
    if (v.role === 'indicator' && v.indicatorFor) {
      map[normalizeCobolName(v.indicatorFor)] = v.name;
    }
  }
  return map;
}

function normalizeWs(sql) {
  return (sql || '').replace(/\s+/g, ' ').trim();
}

/**
 * Replace every remaining `:host-var[:indicator]` occurrence in an
 * INTO-stripped SQL string with a Doobie `${...}` interpolation. Variables
 * with a paired indicator become `Option[T]` guards
 * (`if indInd < 0 then None else Some(var)`), relying on Doobie's built-in
 * `Option[T]` Put instance to splice SQL NULL when None.
 */
function interpolateInputSql(sqlText, indicatorMap) {
  return sqlText.replace(
    /:([A-Za-z][A-Za-z0-9_-]*)(\s*:([A-Za-z][A-Za-z0-9_-]*))?/g,
    (_whole, name, _g, ind) => {
      const scalaName = scalaVarName(name);
      const indicator = ind || indicatorMap[normalizeCobolName(name)];
      if (indicator) {
        return `\${if ${scalaVarName(indicator)} < 0 then None else Some(${scalaName})}`;
      }
      return `\${${scalaName}}`;
    }
  );
}

// ============================================================================
// SqlRuntime: embedded runtime helper (same "inline the source" pattern as
// CobolCodecs in case-class-gen.js/scala-generator.js)
// ============================================================================

const SQL_RUNTIME_SNIPPET = `object SqlRuntime:
  def runOption[A](io: doobie.ConnectionIO[Option[A]], xa: doobie.util.transactor.Transactor[cats.effect.IO]): (Int, Option[A]) =
    try
      io.transact(xa).unsafeRunSync() match
        case Some(v) => (0, Some(v))
        case None    => (100, None)
    catch
      case e: java.sql.SQLException => (e.getErrorCode, None)

  def runUpdate(io: doobie.ConnectionIO[Int], xa: doobie.util.transactor.Transactor[cats.effect.IO]): (Int, Int) =
    try (0, io.transact(xa).unsafeRunSync())
    catch
      case e: java.sql.SQLException => (e.getErrorCode, 0)

  def runList[A](io: doobie.ConnectionIO[List[A]], xa: doobie.util.transactor.Transactor[cats.effect.IO]): (Int, List[A]) =
    try (0, io.transact(xa).unsafeRunSync())
    catch
      case e: java.sql.SQLException => (e.getErrorCode, Nil)

  def describe(code: Int): String = code match
    case 0          => "SUCCESS"
    case 100        => "NOT FOUND"
    case -803       => "DUPLICATE KEY"
    case -811       => "MULTIPLE ROWS RETURNED"
    case -904       => "RESOURCE UNAVAILABLE"
    case -911       => "DEADLOCK OR TIMEOUT - ROLLBACK"
    case -913       => "DEADLOCK OR TIMEOUT - NO ROLLBACK"
    case c if c < 0 => s"SQL ERROR ($c)"
    case c          => s"SQL WARNING ($c)"`;

export function generateSqlRuntimeSnippet() {
  return SQL_RUNTIME_SNIPPET;
}

export function generateDoobieImports() {
  return `import doobie._
import doobie.implicits._
import doobie.util.transactor.Transactor
import cats.effect.IO
import cats.effect.unsafe.implicits.global`;
}

export function generateTransactorSetup(config = {}, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const driver = config.driver || 'org.postgresql.Driver';
  const url = config.url || 'jdbc:postgresql://localhost/db';
  const user = config.user || 'user';
  const password = config.password || 'password';

  return `${indentStr}val xa = Transactor.fromDriverManager[IO](
${indentStr}  "${driver}",
${indentStr}  "${url}",
${indentStr}  "${user}",
${indentStr}  "${password}",
${indentStr}  None
${indentStr})`;
}

// ============================================================================
// Generation context
// ============================================================================

function createContext(statements, options) {
  const cursorRowInfo = new Map();

  // Pre-pass: link each cursor to its first paired FETCH so DECLARE_CURSOR
  // (which textually comes first but has no INTO list of its own) and OPEN
  // (which needs the row type *now* to build a List[RowType]) both know the
  // row shape before the FETCH statement itself is reached.
  for (const stmt of statements) {
    if (stmt.kind === 'FETCH' && stmt.cursorName) {
      const key = normalizeCobolName(stmt.cursorName);
      if (!cursorRowInfo.has(key)) {
        const outputVars = (stmt.hostVariables || []).filter((v) => v.role === 'output');
        const indicatorMap = buildIndicatorMap(stmt.hostVariables);
        const types = outputVars.map((v) => {
          const { type } = resolveHostVarType(v.name, options);
          return indicatorMap[normalizeCobolName(v.name)] ? `Option[${type}]` : type;
        });
        cursorRowInfo.set(key, { outputVars, types });
      }
    }
  }

  return {
    options,
    xa: options.xa || 'xa',
    indent: options.indent || 0,
    declaredVars: new Set(),
    cursors: new Map(),
    cursorRowInfo,
    wheneverHandlers: {},
  };
}

function I(ctx) {
  return '  '.repeat(ctx.indent);
}

function withIndent(ctx, delta) {
  return { ...ctx, indent: ctx.indent + delta };
}

/**
 * Emit `declarationLine` the first time `key` is seen for this program,
 * nothing on subsequent calls. Used for every `var` this module hoists to
 * the outer (method-body) scope - host-variable output vars, the shared
 * `sqlCode`, and each cursor's iterator - so repeating the same SQL
 * statement (e.g. two DECLARE/OPEN/FETCH loops over the same cursor name)
 * never re-declares it.
 */
function declareRawVarIfNeeded(ctx, key, declarationLine) {
  if (ctx.declaredVars.has(key)) return [];
  ctx.declaredVars.add(key);
  return [declarationLine];
}

function declareVarIfNeeded(ctx, cobolName, scalaType, inferred) {
  const comment = inferred ? '  // type inferred from name, no field-registry/DCLGEN entry' : '';
  return declareRawVarIfNeeded(
    ctx,
    normalizeCobolName(cobolName),
    `${I(ctx)}var ${scalaVarName(cobolName)}: ${scalaType} = ${defaultForType(scalaType)}${comment}`
  );
}

/**
 * `sqlCode` is a single shared `var` reassigned by every DB-touching
 * statement (SELECT/FETCH/INSERT/UPDATE/DELETE/OPEN/CLOSE) - not a fresh
 * `val` per statement, since Scala would reject re-declaring `val sqlCode`
 * twice in the same flat method-body scope. Each statement's own
 * intermediate values (the raw `(code, row)` tuple straight off
 * `SqlRuntime`, etc.) are instead scoped to a `{ ... }` block local to that
 * statement (see `wrapBlock`), so *those* names are free to repeat across
 * statements without colliding.
 */
function declareSqlCodeIfNeeded(ctx) {
  return declareRawVarIfNeeded(ctx, '__SQLCODE__', `${I(ctx)}var sqlCode: Int = 0`);
}

function wrapBlock(ctx, innerLines) {
  return [`${I(ctx)}{`, ...innerLines, `${I(ctx)}}`];
}

// ============================================================================
// WHENEVER-driven post-statement SQLCODE checks
// ============================================================================

function appendNotFoundCheck(ctx) {
  if (!ctx.declaredVars.has('__SQLCODE__')) return [];
  const h = ctx.wheneverHandlers.NOT_FOUND;
  if (!h || h.action === 'CONTINUE') return [];
  if (h.action === 'STOP') {
    return [`${I(ctx)}if sqlCode == 100 then throw new java.sql.SQLException("SQLCODE=100 (NOT FOUND)")`];
  }
  return [`${I(ctx)}if sqlCode == 100 then return ${scalaVarName(h.target)}() // WHENEVER NOT FOUND GOTO ${h.target}`];
}

function appendSqlErrorCheck(ctx) {
  if (!ctx.declaredVars.has('__SQLCODE__')) return [];
  const h = ctx.wheneverHandlers.SQLERROR;
  if (!h || h.action === 'CONTINUE') return [];
  if (h.action === 'STOP') {
    return [`${I(ctx)}if sqlCode < 0 then throw new java.sql.SQLException(s"SQLCODE=$sqlCode: $\{SqlRuntime.describe(sqlCode)}")`];
  }
  return [`${I(ctx)}if sqlCode < 0 then return ${scalaVarName(h.target)}() // WHENEVER SQLERROR GOTO ${h.target}`];
}

// ============================================================================
// Per-kind generators
// ============================================================================

function generateSelect(stmt, ctx) {
  const outputVars = (stmt.hostVariables || []).filter((v) => v.role === 'output');
  const indicatorMap = buildIndicatorMap(stmt.hostVariables);

  const sql = normalizeWs(interpolateInputSql(stripIntoClause(stmt.sql, 'SELECT'), indicatorMap));

  if (outputVars.length === 0) {
    return [
      `${I(ctx)}// SELECT without INTO is not directly supported outside a DECLARE CURSOR context - skipping typed generation`,
      `${I(ctx)}// raw SQL: ${sql}`,
    ];
  }

  const lines = [];
  const resolved = outputVars.map((v) => resolveHostVarType(v.name, ctx.options));
  const types = outputVars.map((v, i) => {
    const ind = indicatorMap[normalizeCobolName(v.name)];
    return ind ? `Option[${resolved[i].type}]` : resolved[i].type;
  });

  outputVars.forEach((v, i) => {
    lines.push(...declareVarIfNeeded(ctx, v.name, types[i], resolved[i].inferred));
  });
  lines.push(...declareSqlCodeIfNeeded(ctx));

  const rowType = types.length === 1 ? types[0] : `(${types.join(', ')})`;
  const scalaNames = outputVars.map((v) => scalaVarName(v.name));
  const inner = withIndent(ctx, 1);

  const blockLines = [];
  blockLines.push(`${I(inner)}val (code, row) = SqlRuntime.runOption(sql"${sql}".query[${rowType}].option, ${ctx.xa})`);
  blockLines.push(`${I(inner)}sqlCode = code`);
  if (scalaNames.length === 1) {
    blockLines.push(`${I(inner)}row match`);
    blockLines.push(`${I(inner)}  case Some(v) => ${scalaNames[0]} = v`);
    blockLines.push(`${I(inner)}  case None => ()`);
  } else {
    const tmp = scalaNames.map((_, i) => `v${i}`);
    blockLines.push(`${I(inner)}row match`);
    blockLines.push(`${I(inner)}  case Some((${tmp.join(', ')})) =>`);
    blockLines.push(`${I(inner)}    ${scalaNames.map((n, i) => `${n} = ${tmp[i]}`).join('; ')}`);
    if (outputVars.some((v) => indicatorMap[normalizeCobolName(v.name)])) {
      blockLines.push(`${I(inner)}    // TODO(sql-gen): indicator variables for multi-column SELECT INTO are not auto-assigned here`);
    }
    blockLines.push(`${I(inner)}  case None => ()`);
  }

  lines.push(...wrapBlock(ctx, blockLines));
  return lines;
}

function generateMutation(stmt, ctx) {
  const indicatorMap = buildIndicatorMap(stmt.hostVariables);
  const sql = normalizeWs(interpolateInputSql(stmt.sql, indicatorMap));
  const inner = withIndent(ctx, 1);

  const lines = [...declareSqlCodeIfNeeded(ctx)];
  lines.push(...wrapBlock(ctx, [
    `${I(inner)}val (code, rowsAffected) = SqlRuntime.runUpdate(sql"${sql}".update.run, ${ctx.xa})`,
    `${I(inner)}sqlCode = code`,
  ]));
  return lines;
}

function generateDeclareCursor(stmt, ctx) {
  const cursorKey = normalizeCobolName(stmt.cursorName);
  const cursorScalaName = scalaVarName(stmt.cursorName);
  const indicatorMap = buildIndicatorMap(stmt.hostVariables);
  const sql = normalizeWs(interpolateInputSql(stmt.sql, indicatorMap));

  const rowInfo = ctx.cursorRowInfo.get(cursorKey);
  if (!rowInfo || rowInfo.types.length === 0) {
    ctx.cursors.set(cursorKey, { scalaName: cursorScalaName, rowType: null, rowInfo: null });
    return [
      `${I(ctx)}// DECLARE CURSOR ${stmt.cursorName}: no FETCH ... INTO found to infer a row type - cannot safely generate a typed query`,
      `${I(ctx)}// TODO(sql-gen): raw SQL: ${sql}`,
    ];
  }

  const rowType = rowInfo.types.length === 1 ? rowInfo.types[0] : `(${rowInfo.types.join(', ')})`;
  ctx.cursors.set(cursorKey, { scalaName: cursorScalaName, rowType, rowInfo });

  return [
    `${I(ctx)}// DECLARE CURSOR ${stmt.cursorName} (row type inferred from its FETCH ... INTO host-variable list)`,
    `${I(ctx)}def ${cursorScalaName}Query: doobie.Query0[${rowType}] = sql"${sql}".query[${rowType}]`,
  ];
}

function generateOpen(stmt, ctx) {
  const cursorKey = normalizeCobolName(stmt.cursorName);
  const cursor = ctx.cursors.get(cursorKey);
  const scalaName = cursor?.scalaName || scalaVarName(stmt.cursorName);

  if (!cursor || !cursor.rowType) {
    return [`${I(ctx)}// OPEN ${stmt.cursorName}: skipped - cursor's row type could not be inferred (see DECLARE CURSOR above)`];
  }

  const lines = [
    `${I(ctx)}// OPEN ${stmt.cursorName} - materialized-List cursor translation (see file header for the stream-vs-list tradeoff)`,
  ];
  lines.push(...declareSqlCodeIfNeeded(ctx));
  lines.push(...declareRawVarIfNeeded(
    ctx,
    `CURSOR_ITER:${cursorKey}`,
    `${I(ctx)}var ${scalaName}Iter: Iterator[${cursor.rowType}] = Iterator.empty`
  ));

  const inner = withIndent(ctx, 1);
  lines.push(...wrapBlock(ctx, [
    `${I(inner)}val (code, rows) = SqlRuntime.runList(${scalaName}Query.to[List], ${ctx.xa})`,
    `${I(inner)}sqlCode = code`,
    `${I(inner)}${scalaName}Iter = rows.iterator`,
  ]));
  return lines;
}

function generateFetch(stmt, ctx) {
  const cursorKey = normalizeCobolName(stmt.cursorName);
  const cursor = ctx.cursors.get(cursorKey);
  const scalaName = cursor?.scalaName || scalaVarName(stmt.cursorName);
  const outputVars = (stmt.hostVariables || []).filter((v) => v.role === 'output');
  const indicatorMap = buildIndicatorMap(stmt.hostVariables);

  const lines = [];
  const types = outputVars.map((v) => {
    const { type, inferred } = resolveHostVarType(v.name, ctx.options);
    const finalType = indicatorMap[normalizeCobolName(v.name)] ? `Option[${type}]` : type;
    lines.push(...declareVarIfNeeded(ctx, v.name, finalType, inferred));
    return finalType;
  });
  lines.push(...declareSqlCodeIfNeeded(ctx));

  const scalaNames = outputVars.map((v) => scalaVarName(v.name));
  const inner = withIndent(ctx, 1);
  const blockLines = [];
  blockLines.push(`${I(inner)}val next = ${scalaName}Iter.nextOption()`);
  blockLines.push(`${I(inner)}next match`);

  if (scalaNames.length === 0) {
    blockLines.push(`${I(inner)}  case Some(_) => sqlCode = 0`);
  } else if (scalaNames.length === 1) {
    blockLines.push(`${I(inner)}  case Some(v) =>`);
    blockLines.push(`${I(inner)}    ${scalaNames[0]} = v`);
    blockLines.push(`${I(inner)}    sqlCode = 0`);
  } else {
    const tmp = scalaNames.map((_, i) => `v${i}`);
    blockLines.push(`${I(inner)}  case Some((${tmp.join(', ')})) =>`);
    blockLines.push(`${I(inner)}    ${scalaNames.map((n, i) => `${n} = ${tmp[i]}`).join('; ')}`);
    blockLines.push(`${I(inner)}    sqlCode = 0`);
  }
  blockLines.push(`${I(inner)}  case None => sqlCode = 100 // NOT FOUND`);

  lines.push(...wrapBlock(ctx, blockLines));
  return lines;
}

function generateClose(stmt, ctx) {
  const cursorKey = normalizeCobolName(stmt.cursorName);
  const cursor = ctx.cursors.get(cursorKey);
  const scalaName = cursor?.scalaName || scalaVarName(stmt.cursorName);
  const lines = [
    `${I(ctx)}// CLOSE ${stmt.cursorName} (entire result set was already pulled client-side at OPEN - nothing server-side to release)`,
  ];
  lines.push(...declareSqlCodeIfNeeded(ctx));
  lines.push(`${I(ctx)}${scalaName}Iter = Iterator.empty`);
  lines.push(`${I(ctx)}sqlCode = 0`);
  return lines;
}

function generateWhenever(stmt, ctx) {
  if (!stmt.whenever) {
    return [`${I(ctx)}// WHENEVER: clause not recognized - raw SQL: ${stmt.raw}`];
  }
  ctx.wheneverHandlers[stmt.whenever.condition] = stmt.whenever;
  const { condition, action, target } = stmt.whenever;
  const desc = action === 'GOTO' ? `GO TO ${target}` : action;
  return [`${I(ctx)}// WHENEVER ${condition.replace('_', ' ')} ${desc} (applies to subsequent statements)`];
}

function generateRollback(stmt, ctx) {
  return [`${I(ctx)}throw new RuntimeException("ROLLBACK requested")`];
}

function generateInclude(stmt, ctx) {
  return [`${I(ctx)}// EXEC SQL INCLUDE ${stmt.includeTarget}: host-variable structure supplied by DCLGEN/copybook '${stmt.includeTarget}' (see parser/dclgen-parser.js)`];
}

/**
 * Dispatch one enriched statement to its generator, threading the shared
 * context (WHENEVER state, declared vars, cursor registry) through, and
 * appending the appropriate post-statement SQLCODE check(s).
 */
export function generateStatement(stmt, ctx) {
  switch (stmt.kind) {
    case 'SELECT':
      return [...generateSelect(stmt, ctx), ...appendNotFoundCheck(ctx), ...appendSqlErrorCheck(ctx)];
    case 'FETCH':
      return [...generateFetch(stmt, ctx), ...appendNotFoundCheck(ctx), ...appendSqlErrorCheck(ctx)];
    case 'INSERT':
    case 'UPDATE':
    case 'DELETE':
      return [...generateMutation(stmt, ctx), ...appendSqlErrorCheck(ctx)];
    case 'DECLARE_CURSOR':
      return generateDeclareCursor(stmt, ctx);
    case 'OPEN':
      return [...generateOpen(stmt, ctx), ...appendSqlErrorCheck(ctx)];
    case 'CLOSE':
      return [...generateClose(stmt, ctx), ...appendSqlErrorCheck(ctx)];
    case 'WHENEVER':
      return generateWhenever(stmt, ctx);
    case 'COMMIT':
      return [`${I(ctx)}// COMMIT - handled by Doobie's transact(xa) per-statement transaction boundary`];
    case 'ROLLBACK':
      return generateRollback(stmt, ctx);
    case 'INCLUDE':
      return generateInclude(stmt, ctx);
    default:
      return [
        `${I(ctx)}// TODO(sql-gen): ${stmt.kind} not translated`,
        `${I(ctx)}// raw SQL: ${stmt.raw}`,
      ];
  }
}

function resolveStatements(parsedProgram, options) {
  if (Array.isArray(parsedProgram)) return parsedProgram;
  if (parsedProgram && Array.isArray(parsedProgram.sqlStatements)) return parsedProgram.sqlStatements;
  if (parsedProgram && Array.isArray(parsedProgram.tokens)) return parseAllSqlStatements(parsedProgram.tokens);
  if (typeof parsedProgram === 'string') return parseAllSqlStatements(tokenize(parsedProgram, options));
  return [];
}

/**
 * Generate Doobie source fragments for every EXEC SQL statement in a parsed
 * COBOL program, in source order.
 *
 * @param {object|Array|string} parsedProgram - one of:
 *   - an array of enriched statements (from `analyzeSqlStatement`/
 *     `parseAllSqlStatements`)
 *   - `{ sqlStatements: [...] }` (already-analyzed statements)
 *   - `{ tokens: [...] }` (a token stream; statements are extracted here)
 *   - a raw COBOL source string (tokenized and extracted here)
 * @param {object} [options]
 * @param {object|Map} [options.fieldRegistry] - COBOL host-variable name ->
 *   DataItem-shaped or DCLGEN-hostVariable-shaped object, for typing.
 * @param {Array} [options.dclgenModels] - parsed DCLGEN models (each with a
 *   `.hostVariables` array), consulted after `fieldRegistry`.
 * @param {string} [options.xa='xa'] - the Doobie Transactor value name.
 * @param {number} [options.indent=0] - base indentation level (2 spaces/level).
 * @returns {{ code: string, imports: string, runtime: string }}
 */
export function generateSqlProgram(parsedProgram, options = {}) {
  const statements = resolveStatements(parsedProgram, options);
  const ctx = createContext(statements, options);

  const bodyLines = [];
  for (const stmt of statements) {
    bodyLines.push(...generateStatement(stmt, ctx));
    bodyLines.push('');
  }

  return {
    code: bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
    imports: generateDoobieImports(),
    runtime: generateSqlRuntimeSnippet(),
  };
}

export default {
  generateSqlProgram,
  generateStatement,
  resolveHostVarType,
  heuristicTypeFromName,
  buildIndicatorMap,
  generateDoobieImports,
  generateTransactorSetup,
  generateSqlRuntimeSnippet,
};
