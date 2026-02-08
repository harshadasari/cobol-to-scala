/**
 * sql-gen.js
 * Convert EXEC SQL to Scala (Doobie style)
 */

import { toCamelCase, toPascalCase, mapCobolTypeToScala } from './case-class-gen.js';

/**
 * Parse host variable from COBOL SQL
 * :HOST-VAR -> hostVar
 */
function parseHostVariable(hostVar) {
  if (!hostVar) return null;

  // Remove leading colon
  const name = hostVar.replace(/^:/, '');
  return toCamelCase(name);
}

/**
 * Convert SQL column/table names to Scala-friendly format
 */
function convertSqlIdentifier(identifier) {
  if (!identifier) return '';

  // If it's already lowercase or mixed case, keep it
  if (identifier !== identifier.toUpperCase()) {
    return identifier;
  }

  // Convert UPPER_CASE to camelCase for consistency
  return identifier.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Replace host variables in SQL with Doobie interpolation
 * :HOST-VAR -> $hostVar
 */
function replaceHostVariables(sql) {
  return sql.replace(/:([A-Za-z][A-Za-z0-9_-]*)/g, (_, name) => {
    return `$${toCamelCase(name)}`;
  });
}

/**
 * Extract INTO clause variables from SELECT
 */
function extractIntoVariables(sql) {
  const intoMatch = sql.match(/INTO\s+(:[\w-]+(?:\s*,\s*:[\w-]+)*)/i);
  if (!intoMatch) return [];

  return intoMatch[1]
    .split(/\s*,\s*/)
    .map(v => parseHostVariable(v.trim()));
}

/**
 * Remove INTO clause from SELECT statement
 */
function removeIntoClause(sql) {
  return sql.replace(/\s+INTO\s+:[\w-]+(?:\s*,\s*:[\w-]+)*/i, '');
}

/**
 * Generate SELECT INTO statement
 */
export function generateSelect(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const lines = [];

  let sql = statement.sql || statement.query;
  const intoVars = extractIntoVariables(sql);
  sql = removeIntoClause(sql);
  sql = replaceHostVariables(sql);

  // Clean up SQL formatting
  sql = sql.replace(/\s+/g, ' ').trim();

  if (intoVars.length === 0) {
    // No INTO clause - just execute query
    lines.push(`${indentStr}sql"${sql}".query[Row].to[List].transact(xa)`);
  } else if (intoVars.length === 1) {
    // Single variable
    lines.push(`${indentStr}val ${intoVars[0]}Option = sql"${sql}".query[${inferTypeFromContext(intoVars[0])}].option.transact(xa).unsafeRunSync()`);
    lines.push(`${indentStr}val ${intoVars[0]} = ${intoVars[0]}Option.getOrElse(throw new SQLException("No data found"))`);
  } else {
    // Multiple variables - use tuple
    const tupleType = `(${intoVars.map(_ => 'String').join(', ')})`;
    const tupleVars = intoVars.join(', ');
    lines.push(`${indentStr}val (${tupleVars}) = sql"${sql}".query[${tupleType}].unique.transact(xa).unsafeRunSync()`);
  }

  return lines.join('\n');
}

/**
 * Generate INSERT statement
 */
export function generateInsert(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  let sql = statement.sql || statement.query;
  sql = replaceHostVariables(sql);
  sql = sql.replace(/\s+/g, ' ').trim();

  return `${indentStr}sql"${sql}".update.run.transact(xa).unsafeRunSync()`;
}

/**
 * Generate UPDATE statement
 */
export function generateUpdate(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  let sql = statement.sql || statement.query;
  sql = replaceHostVariables(sql);
  sql = sql.replace(/\s+/g, ' ').trim();

  return `${indentStr}sql"${sql}".update.run.transact(xa).unsafeRunSync()`;
}

/**
 * Generate DELETE statement
 */
export function generateDelete(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  let sql = statement.sql || statement.query;
  sql = replaceHostVariables(sql);
  sql = sql.replace(/\s+/g, ' ').trim();

  return `${indentStr}sql"${sql}".update.run.transact(xa).unsafeRunSync()`;
}

/**
 * Generate DECLARE CURSOR statement
 */
export function generateDeclareCursor(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const cursorName = toCamelCase(statement.cursor);

  let sql = statement.sql || statement.query;
  sql = replaceHostVariables(sql);
  sql = sql.replace(/\s+/g, ' ').trim();

  return `${indentStr}// Cursor: ${cursorName}
${indentStr}def ${cursorName}Query = sql"${sql}".query[Row]`;
}

/**
 * Generate OPEN CURSOR statement
 */
export function generateOpenCursor(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const cursorName = toCamelCase(statement.cursor);

  return `${indentStr}val ${cursorName}Stream = ${cursorName}Query.stream.transact(xa)`;
}

/**
 * Generate FETCH statement
 */
export function generateFetch(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const cursorName = toCamelCase(statement.cursor);

  const intoVars = statement.into
    ? statement.into.map(v => parseHostVariable(v))
    : ['_row'];

  if (intoVars.length === 1) {
    return `${indentStr}val ${intoVars[0]} = ${cursorName}Iterator.next()`;
  }

  const tupleVars = intoVars.join(', ');
  return `${indentStr}val (${tupleVars}) = ${cursorName}Iterator.next()`;
}

/**
 * Generate CLOSE CURSOR statement
 */
export function generateCloseCursor(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const cursorName = toCamelCase(statement.cursor);

  return `${indentStr}// Cursor ${cursorName} closed (handled by stream completion)`;
}

/**
 * Generate SQLCODE handling with Either/Try
 */
export function generateSqlcodeHandling(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  return `${indentStr}sqlcode match
${indentStr}  case 0 => Right(()) // Success
${indentStr}  case 100 => Left("No data found")
${indentStr}  case -803 => Left("Duplicate key")
${indentStr}  case -811 => Left("Multiple rows returned")
${indentStr}  case -904 => Left("Resource unavailable")
${indentStr}  case -911 => Left("Deadlock or timeout")
${indentStr}  case -913 => Left("Deadlock detected")
${indentStr}  case code if code < 0 => Left(s"SQL error: $$code")
${indentStr}  case code => Right(()) // Warning: $$code`;
}

/**
 * Generate WHENEVER statement
 */
export function generateWhenever(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const condition = statement.condition?.toUpperCase() || 'SQLERROR';
  const action = statement.action?.toUpperCase() || 'CONTINUE';

  let comment = `// WHENEVER ${condition} `;

  switch (action) {
    case 'CONTINUE':
      comment += 'CONTINUE - errors are ignored';
      break;
    case 'GO TO':
    case 'GOTO':
      const target = toCamelCase(statement.target || 'errorHandler');
      comment += `GO TO ${target}`;
      break;
    case 'STOP':
      comment += 'STOP - throws exception on error';
      break;
    default:
      comment += action;
  }

  return `${indentStr}${comment}`;
}

/**
 * Generate COMMIT statement
 */
export function generateCommit(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);
  return `${indentStr}// COMMIT handled by Doobie transaction`;
}

/**
 * Generate ROLLBACK statement
 */
export function generateRollback(statement, indent = 0) {
  const indentStr = '  '.repeat(indent);

  if (statement.savepoint) {
    return `${indentStr}// ROLLBACK TO SAVEPOINT ${statement.savepoint}`;
  }

  return `${indentStr}throw new RuntimeException("Rollback requested") // ROLLBACK`;
}

/**
 * Infer Scala type from variable name context
 */
function inferTypeFromContext(varName) {
  const lower = varName.toLowerCase();

  if (lower.includes('count') || lower.includes('num') || lower.includes('qty')) {
    return 'Int';
  }
  if (lower.includes('amount') || lower.includes('price') || lower.includes('total')) {
    return 'BigDecimal';
  }
  if (lower.includes('date')) {
    return 'java.time.LocalDate';
  }
  if (lower.includes('time')) {
    return 'java.time.LocalTime';
  }
  if (lower.includes('timestamp')) {
    return 'java.time.Instant';
  }

  return 'String';
}

/**
 * Generate complete Doobie imports
 */
export function generateDoobieImports() {
  return `import doobie._
import doobie.implicits._
import doobie.util.transactor.Transactor
import cats.effect.IO
import cats.effect.unsafe.implicits.global`;
}

/**
 * Generate Doobie transactor setup
 */
export function generateTransactorSetup(config = {}, indent = 0) {
  const indentStr = '  '.repeat(indent);
  const driver = config.driver || 'org.postgresql.Driver';
  const url = config.url || 'jdbc:postgresql://localhost/db';
  const user = config.user || 'user';
  const password = config.password || 'password';

  return `${indentStr}val xa = Transactor.fromDriverManager[IO](
${indentStr}  driver = "${driver}",
${indentStr}  url = "${url}",
${indentStr}  user = "${user}",
${indentStr}  password = "${password}"
${indentStr})`;
}

/**
 * Wrap SQL operations in Try for error handling
 */
export function wrapInTry(sqlCode, indent = 0) {
  const indentStr = '  '.repeat(indent);

  return `${indentStr}scala.util.Try {
${sqlCode.split('\n').map(line => '  ' + line).join('\n')}
${indentStr}} match
${indentStr}  case scala.util.Success(result) =>
${indentStr}    sqlcode = 0
${indentStr}    result
${indentStr}  case scala.util.Failure(e: java.sql.SQLException) =>
${indentStr}    sqlcode = e.getErrorCode
${indentStr}    sqlerrm = e.getMessage
${indentStr}    throw e`;
}

/**
 * Main SQL generator - routes to specific generators
 */
export function generateSql(statement, indent = 0) {
  if (!statement) return '';

  const type = statement.type?.toUpperCase() || '';

  switch (type) {
    case 'SELECT':
      return generateSelect(statement, indent);
    case 'INSERT':
      return generateInsert(statement, indent);
    case 'UPDATE':
      return generateUpdate(statement, indent);
    case 'DELETE':
      return generateDelete(statement, indent);
    case 'DECLARE CURSOR':
    case 'DECLARE-CURSOR':
      return generateDeclareCursor(statement, indent);
    case 'OPEN':
    case 'OPEN CURSOR':
      return generateOpenCursor(statement, indent);
    case 'FETCH':
      return generateFetch(statement, indent);
    case 'CLOSE':
    case 'CLOSE CURSOR':
      return generateCloseCursor(statement, indent);
    case 'WHENEVER':
      return generateWhenever(statement, indent);
    case 'COMMIT':
      return generateCommit(statement, indent);
    case 'ROLLBACK':
      return generateRollback(statement, indent);
    default:
      // Handle raw SQL
      if (statement.sql || statement.query) {
        let sql = statement.sql || statement.query;
        sql = replaceHostVariables(sql);
        return `${'  '.repeat(indent)}sql"${sql}".update.run.transact(xa).unsafeRunSync()`;
      }
      return `${'  '.repeat(indent)}// ${type} SQL statement`;
  }
}

export default {
  generateSql,
  generateSelect,
  generateInsert,
  generateUpdate,
  generateDelete,
  generateDeclareCursor,
  generateOpenCursor,
  generateFetch,
  generateCloseCursor,
  generateSqlcodeHandling,
  generateWhenever,
  generateCommit,
  generateRollback,
  generateDoobieImports,
  generateTransactorSetup,
  wrapInTry
};
