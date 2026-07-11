/**
 * COBOL EXEC SQL/CICS Parser
 * Parses embedded SQL and CICS statements
 */

import { TokenType } from './tokens.js';
import { SqlStatement, CicsStatement, VariableReference } from './ast.js';

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
}

/**
 * Extract host variables from SQL text
 * Host variables are prefixed with colon (:variable-name)
 */
function extractHostVariables(sqlText) {
  const hostVariables = [];
  const regex = /:([A-Za-z][A-Za-z0-9_-]*)/g;
  let match;

  while ((match = regex.exec(sqlText)) !== null) {
    const varName = match[1];
    // Check for indicator variable (separated by space or colon)
    const afterMatch = sqlText.substring(match.index + match[0].length);
    const indicatorMatch = afterMatch.match(/^[\s]*:([A-Za-z][A-Za-z0-9_-]*)/);

    hostVariables.push({
      name: varName,
      indicator: indicatorMatch ? indicatorMatch[1] : null,
      position: match.index,
    });
  }

  return hostVariables;
}

/**
 * Extract table names from SQL
 */
function extractTableNames(sqlText) {
  const tables = [];
  const upperSql = sqlText.toUpperCase();

  // Match FROM table patterns
  const fromRegex = /FROM\s+([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?)/gi;
  let match;
  while ((match = fromRegex.exec(sqlText)) !== null) {
    tables.push(match[1]);
  }

  // Match INTO table patterns (INSERT)
  const intoRegex = /INTO\s+([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?)/gi;
  while ((match = intoRegex.exec(sqlText)) !== null) {
    // Skip if this is SELECT ... INTO (host variable)
    const before = sqlText.substring(0, match.index).toUpperCase();
    if (!before.includes('SELECT')) {
      tables.push(match[1]);
    }
  }

  // Match UPDATE table patterns
  const updateRegex = /UPDATE\s+([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?)/gi;
  while ((match = updateRegex.exec(sqlText)) !== null) {
    tables.push(match[1]);
  }

  // Match DELETE FROM patterns
  const deleteRegex = /DELETE\s+FROM\s+([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?)/gi;
  while ((match = deleteRegex.exec(sqlText)) !== null) {
    tables.push(match[1]);
  }

  // Match JOIN patterns
  const joinRegex = /JOIN\s+([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?)/gi;
  while ((match = joinRegex.exec(sqlText)) !== null) {
    tables.push(match[1]);
  }

  return [...new Set(tables)]; // Remove duplicates
}

/**
 * Extract INTO clause host variables from SELECT
 */
function extractIntoClause(sqlText) {
  const intoVars = [];
  const upperSql = sqlText.toUpperCase();

  // Find INTO ... FROM pattern in SELECT
  const intoIndex = upperSql.indexOf(' INTO ');
  if (intoIndex === -1) return intoVars;

  // Check if there's a FROM before this INTO (meaning it's INSERT INTO)
  const fromIndex = upperSql.indexOf(' FROM ');
  if (fromIndex !== -1 && fromIndex < intoIndex) return intoVars;

  // Extract between INTO and FROM
  const afterInto = sqlText.substring(intoIndex + 6);
  const fromMatch = afterInto.toUpperCase().indexOf(' FROM ');
  const intoSection = fromMatch !== -1
    ? afterInto.substring(0, fromMatch)
    : afterInto;

  // Extract host variables from INTO section
  const vars = extractHostVariables(':' + intoSection.replace(/:/g, ' :'));
  for (const v of vars) {
    if (v.name) {
      intoVars.push(v.name);
    }
  }

  return intoVars;
}

/**
 * Extract WHERE clause
 */
function extractWhereClause(sqlText) {
  const upperSql = sqlText.toUpperCase();
  const whereIndex = upperSql.indexOf(' WHERE ');

  if (whereIndex === -1) return null;

  let endIndex = sqlText.length;
  const terminators = [' ORDER ', ' GROUP ', ' HAVING ', ' UNION ', ' FOR '];

  for (const term of terminators) {
    const termIndex = upperSql.indexOf(term, whereIndex);
    if (termIndex !== -1 && termIndex < endIndex) {
      endIndex = termIndex;
    }
  }

  return sqlText.substring(whereIndex + 7, endIndex).trim();
}

/**
 * Determine SQL statement type
 */
function determineSqlType(sqlText) {
  const trimmed = sqlText.trim().toUpperCase();

  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('DECLARE') && trimmed.includes('CURSOR')) return 'DECLARE_CURSOR';
  if (trimmed.startsWith('OPEN')) return 'OPEN_CURSOR';
  if (trimmed.startsWith('FETCH')) return 'FETCH';
  if (trimmed.startsWith('CLOSE')) return 'CLOSE_CURSOR';
  if (trimmed.startsWith('COMMIT')) return 'COMMIT';
  if (trimmed.startsWith('ROLLBACK')) return 'ROLLBACK';
  if (trimmed.startsWith('INCLUDE')) return 'INCLUDE';
  if (trimmed.startsWith('WHENEVER')) return 'WHENEVER';
  if (trimmed.startsWith('BEGIN')) return 'BEGIN';
  if (trimmed.startsWith('END')) return 'END';
  if (trimmed.startsWith('CALL')) return 'CALL';
  if (trimmed.startsWith('SET')) return 'SET';
  if (trimmed.startsWith('PREPARE')) return 'PREPARE';
  if (trimmed.startsWith('EXECUTE')) return 'EXECUTE';
  if (trimmed.startsWith('DESCRIBE')) return 'DESCRIBE';
  if (trimmed.startsWith('LOCK')) return 'LOCK';
  if (trimmed.startsWith('SAVEPOINT')) return 'SAVEPOINT';

  return 'UNKNOWN';
}

/**
 * Extract cursor name from SQL
 */
function extractCursorName(sqlText) {
  const upperSql = sqlText.trim().toUpperCase();

  // DECLARE cursor-name CURSOR
  const declareMatch = sqlText.match(/DECLARE\s+([A-Za-z][A-Za-z0-9_-]*)\s+CURSOR/i);
  if (declareMatch) return declareMatch[1];

  // OPEN cursor-name
  const openMatch = sqlText.match(/OPEN\s+([A-Za-z][A-Za-z0-9_-]*)/i);
  if (openMatch) return openMatch[1];

  // FETCH cursor-name
  const fetchMatch = sqlText.match(/FETCH\s+(?:NEXT\s+)?(?:FROM\s+)?([A-Za-z][A-Za-z0-9_-]*)/i);
  if (fetchMatch) return fetchMatch[1];

  // CLOSE cursor-name
  const closeMatch = sqlText.match(/CLOSE\s+([A-Za-z][A-Za-z0-9_-]*)/i);
  if (closeMatch) return closeMatch[1];

  return null;
}

/**
 * Parse EXEC SQL block from tokens
 */
export function parseSqlBlock(tokens, startPosition = 0) {
  const ctx = new ParserContext(tokens);
  ctx.position = startPosition;

  // Find EXEC SQL
  while (!ctx.isAtEnd()) {
    if (ctx.checkValue('EXEC')) {
      const next = ctx.peek(1);
      if (next && next.value?.toUpperCase() === 'SQL') {
        ctx.advance(); // EXEC
        ctx.advance(); // SQL
        break;
      }
    }
    ctx.advance();
  }

  if (ctx.isAtEnd()) return null;

  // Collect all tokens until END-EXEC
  const sqlTokens = [];
  let rawSql = '';

  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for END-EXEC
    if (current.type === TokenType.END_EXEC ||
        (current.value?.toUpperCase() === 'END-EXEC')) {
      ctx.advance();
      break;
    }

    sqlTokens.push(current);

    // Build raw SQL string
    if (current.type === TokenType.STRING_LITERAL) {
      rawSql += `'${current.value}'`;
    } else if (current.type === TokenType.OP_COLON) {
      rawSql += ':';
    } else {
      rawSql += current.value + ' ';
    }

    ctx.advance();
  }

  rawSql = rawSql.trim();

  const stmt = new SqlStatement({
    rawSql,
    sqlType: determineSqlType(rawSql),
    hostVariables: extractHostVariables(rawSql),
    tables: extractTableNames(rawSql),
    cursorName: extractCursorName(rawSql),
    intoClause: extractIntoClause(rawSql),
    whereClause: extractWhereClause(rawSql),
  });

  return {
    statement: stmt,
    endPosition: ctx.position,
  };
}

/**
 * Parse EXEC CICS block from tokens
 */
export function parseCicsBlock(tokens, startPosition = 0) {
  const ctx = new ParserContext(tokens);
  ctx.position = startPosition;

  // Find EXEC CICS
  while (!ctx.isAtEnd()) {
    if (ctx.checkValue('EXEC')) {
      const next = ctx.peek(1);
      if (next && next.value?.toUpperCase() === 'CICS') {
        ctx.advance(); // EXEC
        ctx.advance(); // CICS
        break;
      }
    }
    ctx.advance();
  }

  if (ctx.isAtEnd()) return null;

  // Get CICS command
  let command = '';
  if (ctx.check(TokenType.IDENTIFIER)) {
    command = ctx.advance().value.toUpperCase();
  }

  // Parse CICS options
  const options = {};
  let rawCics = command + ' ';

  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for END-EXEC
    if (current.type === TokenType.END_EXEC ||
        (current.value?.toUpperCase() === 'END-EXEC')) {
      ctx.advance();
      break;
    }

    // Parse option (NAME(value) format)
    if (ctx.check(TokenType.IDENTIFIER)) {
      const optName = ctx.advance().value.toUpperCase();
      rawCics += optName;

      if (ctx.check(TokenType.OP_LPAREN)) {
        ctx.advance();
        rawCics += '(';

        // Collect option value
        const valueTokens = [];
        let depth = 1;

        while (!ctx.isAtEnd() && depth > 0) {
          const t = ctx.current();
          if (t.type === TokenType.OP_LPAREN) depth++;
          if (t.type === TokenType.OP_RPAREN) {
            depth--;
            if (depth === 0) {
              ctx.advance();
              rawCics += ')';
              break;
            }
          }
          valueTokens.push(t);
          rawCics += t.value;
          ctx.advance();
        }

        // Build option value
        const valueStr = valueTokens.map(t => t.value).join('');
        options[optName] = valueStr;
      } else {
        // Boolean option (no value)
        options[optName] = true;
      }

      rawCics += ' ';
    } else {
      // Skip unknown token
      ctx.advance();
    }
  }

  const stmt = new CicsStatement({
    command,
    rawCics: rawCics.trim(),
    options,
  });

  return {
    statement: stmt,
    endPosition: ctx.position,
  };
}

/**
 * Find and parse all SQL blocks in tokens
 */
export function parseAllSqlBlocks(tokens) {
  const sqlStatements = [];
  let position = 0;

  while (position < tokens.length) {
    const token = tokens[position];

    if (token.value?.toUpperCase() === 'EXEC') {
      const nextToken = tokens[position + 1];

      if (nextToken?.value?.toUpperCase() === 'SQL') {
        const result = parseSqlBlock(tokens, position);
        if (result) {
          sqlStatements.push(result.statement);
          position = result.endPosition;
          continue;
        }
      }
    }

    position++;
  }

  return sqlStatements;
}

/**
 * Find and parse all CICS blocks in tokens
 */
export function parseAllCicsBlocks(tokens) {
  const cicsStatements = [];
  let position = 0;

  while (position < tokens.length) {
    const token = tokens[position];

    if (token.value?.toUpperCase() === 'EXEC') {
      const nextToken = tokens[position + 1];

      if (nextToken?.value?.toUpperCase() === 'CICS') {
        const result = parseCicsBlock(tokens, position);
        if (result) {
          cicsStatements.push(result.statement);
          position = result.endPosition;
          continue;
        }
      }
    }

    position++;
  }

  return cicsStatements;
}

/**
 * Parse SQL statement from raw SQL text (not tokens)
 */
export function parseSqlText(sqlText) {
  return new SqlStatement({
    rawSql: sqlText,
    sqlType: determineSqlType(sqlText),
    hostVariables: extractHostVariables(sqlText),
    tables: extractTableNames(sqlText),
    cursorName: extractCursorName(sqlText),
    intoClause: extractIntoClause(sqlText),
    whereClause: extractWhereClause(sqlText),
  });
}

// ============================================================================
// Phase 3: enriched SQL statement model for typed Doobie generation
//
// The functions above (`parseSqlBlock`/`parseAllSqlBlocks`/`parseSqlText`)
// are untouched and keep returning `SqlStatement` AST nodes exactly as
// before - `parser/index.js` still calls them and nothing about their shape
// changed. Everything below is additive: `analyzeSqlStatement` normalizes a
// raw `EXEC SQL ... END-EXEC` body (the same `rawSql` string the functions
// above already compute) into the richer, generator-friendly shape
// `generator/sql-gen.js` consumes:
//
//   {
//     kind: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DECLARE_CURSOR' |
//           'OPEN' | 'FETCH' | 'CLOSE' | 'INCLUDE' | 'WHENEVER' | 'COMMIT' |
//           'ROLLBACK' | <other SQL verb, passed through uppercased>,
//     sql: string | null,                 // null for statements with no
//                                          // standalone query text (OPEN,
//                                          // FETCH, CLOSE, COMMIT, ROLLBACK,
//                                          // INCLUDE, WHENEVER)
//     hostVariables: [{ name, role: 'input' | 'output' | 'indicator',
//                        indicatorFor? }],
//     cursorName?: string,
//     includeTarget?: string,             // EXEC SQL INCLUDE member-name
//     whenever?: { condition: 'NOT_FOUND' | 'SQLERROR' | 'SQLWARNING',
//                  action: 'CONTINUE' | 'STOP' | 'GOTO', target?: string },
//     tables: string[],
//     raw: string,                        // the untouched EXEC SQL body
//   }
//
// `parseAllSqlStatements(tokens)` walks a whole token stream the same way
// `parseAllSqlBlocks` does and returns an array of these enriched objects in
// source order - this is what `generator/sql-gen.js`'s `generateSqlProgram`
// consumes by default.
// ============================================================================

const KIND_NORMALIZATION = {
  OPEN_CURSOR: 'OPEN',
  CLOSE_CURSOR: 'CLOSE',
};

/**
 * Normalize `determineSqlType`'s output to the enum this module's enriched
 * API uses (only OPEN_CURSOR/CLOSE_CURSOR are renamed; every other kind,
 * including ones not in the "core" list like CALL/SET/PREPARE/UNKNOWN, is
 * passed through uppercased rather than silently dropped).
 */
function normalizeKind(rawKind) {
  return KIND_NORMALIZATION[rawKind] || rawKind;
}

/**
 * Locate the INTO host-variable list for SELECT/FETCH statements.
 * Returns `{ text, start, end }` where `[start, end)` spans from the `INTO`
 * keyword itself through just before a following `FROM` (SELECT) or through
 * end-of-string (FETCH, which has no trailing FROM) - `start`/`end` let a
 * caller excise the whole clause (see `stripIntoClause`) or classify a host
 * variable match's position as inside/outside the INTO list (see
 * `scanHostVariables`). Returns null for every other statement kind,
 * including INSERT - deliberately, since INSERT's own "INTO table-name"
 * clause has nothing to do with host variables and must never be scanned
 * for them (this replaces the old FROM-before-INTO heuristic in
 * `extractIntoClause`, which was a fragile proxy for the same distinction).
 */
export function extractIntoSection(sqlText, kind) {
  if (kind !== 'SELECT' && kind !== 'FETCH') return null;
  const intoMatch = /\bINTO\b/i.exec(sqlText);
  if (!intoMatch) return null;

  const start = intoMatch.index;
  const afterIntoIdx = start + intoMatch[0].length;
  const rest = sqlText.slice(afterIntoIdx);
  const fromMatch = /\bFROM\b/i.exec(rest);
  const end = fromMatch ? afterIntoIdx + fromMatch.index : sqlText.length;

  return { text: sqlText.slice(afterIntoIdx, end), start, end };
}

/**
 * Remove a SELECT/FETCH's INTO clause from its SQL text (Doobie queries have
 * no INTO - the host variables it names become the typed row Doobie decodes
 * into). No-op (returns the text unchanged, whitespace-normalized) when the
 * statement kind has no INTO section.
 */
export function stripIntoClause(sqlText, kind) {
  const section = extractIntoSection(sqlText, kind);
  const stripped = section ? sqlText.slice(0, section.start) + sqlText.slice(section.end) : sqlText;
  return stripped.replace(/\s+/g, ' ').trim();
}

/**
 * Scan `:host-var` occurrences (including `:host-var:indicator-var` pairs -
 * DB2 host-variable/indicator-variable syntax) and classify each into the
 * enriched `{ name, role, indicatorFor? }` shape.
 *
 * A host variable positioned inside the statement's INTO section (per
 * `extractIntoSection`) is `role: 'output'`; everything else (WHERE, SET,
 * VALUES, ...) is `role: 'input'`. An indicator variable is always
 * `role: 'indicator'` regardless of its paired variable's role, carrying
 * `indicatorFor` (the paired variable's name) so a generator can look up
 * "does this variable have a nullability indicator?" without a second pass.
 *
 * Deduplicates by (name, role) so a variable reused twice in one statement
 * (e.g. `WHERE A = :x OR B = :x`) is reported once - a generator building a
 * typed tuple/parameter list wants one declaration per variable, not one per
 * mention.
 */
export function scanHostVariables(sqlText, kind) {
  const intoSection = extractIntoSection(sqlText, kind);
  const HOST_VAR_PAIR_RE = /:([A-Za-z][A-Za-z0-9_-]*)(\s*:([A-Za-z][A-Za-z0-9_-]*))?/g;

  const results = [];
  const seenKeys = new Set();
  let match;

  while ((match = HOST_VAR_PAIR_RE.exec(sqlText)) !== null) {
    const name = match[1];
    const indicatorName = match[3] || null;

    const inInto = !!intoSection && match.index >= intoSection.start && match.index < intoSection.end;
    const primaryRole = inInto ? 'output' : 'input';
    const primaryKey = `${name.toUpperCase()}:${primaryRole}`;
    if (!seenKeys.has(primaryKey)) {
      seenKeys.add(primaryKey);
      results.push({ name, role: primaryRole });
    }

    if (indicatorName) {
      const indicatorKey = `${indicatorName.toUpperCase()}:indicator`;
      if (!seenKeys.has(indicatorKey)) {
        seenKeys.add(indicatorKey);
        results.push({ name: indicatorName, role: 'indicator', indicatorFor: name });
      }
    }
  }

  return results;
}

/**
 * `EXEC SQL INCLUDE member-name END-EXEC` - ties to a copybook/DCLGEN member
 * (see `parser/dclgen-parser.js`) that supplies the host-variable structure.
 */
function extractIncludeTarget(sqlText) {
  const m = sqlText.match(/INCLUDE\s+([A-Za-z0-9_$#@-]+)/i);
  return m ? m[1] : null;
}

/**
 * `DECLARE cursor-name CURSOR ... FOR SELECT ...` - the part after `FOR` is
 * the actual query Doobie needs; the cursor-name/CURSOR prefix is metadata
 * already captured separately as `cursorName`.
 */
function extractCursorSelect(sqlText) {
  const m = sqlText.match(/CURSOR\s+FOR\s+([\s\S]+)$/i);
  return m ? m[1].trim() : sqlText;
}

/**
 * `WHENEVER (NOT FOUND | SQLERROR | SQLWARNING) (CONTINUE | GO TO label | STOP)`
 * Returns null if the clause doesn't match this (fairly rigid) grammar -
 * callers should treat that as "WHENEVER seen but not understood" rather
 * than silently assuming CONTINUE.
 */
function parseWhenever(sqlText) {
  const m = sqlText.match(/WHENEVER\s+(NOT\s+FOUND|SQLERROR|SQLWARNING)\s+(CONTINUE|GO\s*TO\s+([A-Za-z0-9-]+)|STOP)/i);
  if (!m) return null;

  const conditionRaw = m[1].toUpperCase().replace(/\s+/g, ' ');
  const condition = conditionRaw === 'NOT FOUND' ? 'NOT_FOUND' : conditionRaw;

  const actionRaw = m[2].toUpperCase();
  if (/^CONTINUE/.test(actionRaw)) return { condition, action: 'CONTINUE' };
  if (/^STOP/.test(actionRaw)) return { condition, action: 'STOP' };
  return { condition, action: 'GOTO', target: m[3] };
}

/**
 * Analyze one already-extracted `EXEC SQL ... END-EXEC` body (the `rawSql`
 * string `parseSqlBlock`'s token walk already builds) into the enriched
 * shape documented above. Pure function of the raw SQL text - does not
 * require tokens, so it is equally usable from a hand-written SQL string in
 * a unit test or from `parseAllSqlStatements`'s token walk below.
 */
export function analyzeSqlStatement(rawSql) {
  const sql = (rawSql || '').trim();
  const kind = normalizeKind(determineSqlType(sql));
  const cursorName = extractCursorName(sql);
  const hostVariables = scanHostVariables(sql, kind);
  const tables = extractTableNames(sql);

  const result = { kind, hostVariables, tables, raw: sql };

  if (cursorName) result.cursorName = cursorName;

  if (kind === 'INCLUDE') {
    result.includeTarget = extractIncludeTarget(sql);
    result.sql = null;
  } else if (kind === 'WHENEVER') {
    const whenever = parseWhenever(sql);
    if (whenever) result.whenever = whenever;
    result.sql = null;
  } else if (kind === 'DECLARE_CURSOR') {
    result.sql = extractCursorSelect(sql);
  } else if (kind === 'OPEN' || kind === 'CLOSE' || kind === 'FETCH' ||
             kind === 'COMMIT' || kind === 'ROLLBACK') {
    result.sql = null;
  } else {
    result.sql = sql;
  }

  return result;
}

/**
 * Parse one `EXEC SQL ... END-EXEC` block from `startPosition` into the
 * enriched shape (mirrors `parseSqlBlock`'s token-collecting walk, kept
 * separate so that function's legacy `SqlStatement` output is untouched).
 */
export function parseSqlStatementBlock(tokens, startPosition = 0) {
  const ctx = new ParserContext(tokens);
  ctx.position = startPosition;

  while (!ctx.isAtEnd()) {
    if (ctx.checkValue('EXEC')) {
      const next = ctx.peek(1);
      if (next && next.value?.toUpperCase() === 'SQL') {
        ctx.advance(); // EXEC
        ctx.advance(); // SQL
        break;
      }
    }
    ctx.advance();
  }

  if (ctx.isAtEnd()) return null;

  let rawSql = '';
  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    if (current.type === TokenType.END_EXEC || current.value?.toUpperCase() === 'END-EXEC') {
      ctx.advance();
      break;
    }

    if (current.type === TokenType.STRING_LITERAL) {
      rawSql += `'${current.value}'`;
    } else if (current.type === TokenType.OP_COLON) {
      rawSql += ':';
    } else {
      rawSql += current.value + ' ';
    }

    ctx.advance();
  }

  return {
    statement: analyzeSqlStatement(rawSql.trim()),
    endPosition: ctx.position,
  };
}

/**
 * Find and analyze every `EXEC SQL ... END-EXEC` block in a token stream,
 * in source order. This is the primary feed for
 * `generator/sql-gen.js`'s `generateSqlProgram`.
 */
export function parseAllSqlStatements(tokens) {
  const statements = [];
  let position = 0;

  while (position < tokens.length) {
    const token = tokens[position];

    if (token.value?.toUpperCase() === 'EXEC') {
      const nextToken = tokens[position + 1];
      if (nextToken?.value?.toUpperCase() === 'SQL') {
        const result = parseSqlStatementBlock(tokens, position);
        if (result) {
          statements.push(result.statement);
          position = result.endPosition;
          continue;
        }
      }
    }

    position++;
  }

  return statements;
}

/**
 * CICS Command Types
 */
export const CicsCommands = {
  // File Control
  READ: 'READ',
  WRITE: 'WRITE',
  REWRITE: 'REWRITE',
  DELETE: 'DELETE',
  UNLOCK: 'UNLOCK',
  STARTBR: 'STARTBR',
  READNEXT: 'READNEXT',
  READPREV: 'READPREV',
  ENDBR: 'ENDBR',
  RESETBR: 'RESETBR',

  // Program Control
  LINK: 'LINK',
  XCTL: 'XCTL',
  RETURN: 'RETURN',
  LOAD: 'LOAD',
  RELEASE: 'RELEASE',
  ABEND: 'ABEND',

  // Terminal Control
  SEND: 'SEND',
  RECEIVE: 'RECEIVE',
  CONVERSE: 'CONVERSE',
  ISSUE: 'ISSUE',

  // Basic Mapping Support (BMS)
  SEND_MAP: 'SEND MAP',
  RECEIVE_MAP: 'RECEIVE MAP',

  // Interval Control
  START: 'START',
  CANCEL: 'CANCEL',
  DELAY: 'DELAY',
  RETRIEVE: 'RETRIEVE',

  // Task Control
  SUSPEND: 'SUSPEND',
  WAIT: 'WAIT',
  ENQ: 'ENQ',
  DEQ: 'DEQ',

  // Storage Control
  GETMAIN: 'GETMAIN',
  FREEMAIN: 'FREEMAIN',

  // Transient Data
  READQ_TD: 'READQ TD',
  WRITEQ_TD: 'WRITEQ TD',
  DELETEQ_TD: 'DELETEQ TD',

  // Temporary Storage
  READQ_TS: 'READQ TS',
  WRITEQ_TS: 'WRITEQ TS',
  DELETEQ_TS: 'DELETEQ TS',

  // Syncpoint
  SYNCPOINT: 'SYNCPOINT',

  // Exception Handling
  HANDLE: 'HANDLE',
  IGNORE: 'IGNORE',
  PUSH: 'PUSH',
  POP: 'POP',

  // Inquiry
  INQUIRE: 'INQUIRE',
  ASSIGN: 'ASSIGN',
  ADDRESS: 'ADDRESS',
};

/**
 * SQL Statement Types
 */
export const SqlTypes = {
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  DECLARE_CURSOR: 'DECLARE_CURSOR',
  OPEN_CURSOR: 'OPEN_CURSOR',
  FETCH: 'FETCH',
  CLOSE_CURSOR: 'CLOSE_CURSOR',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  INCLUDE: 'INCLUDE',
  WHENEVER: 'WHENEVER',
  PREPARE: 'PREPARE',
  EXECUTE: 'EXECUTE',
  CALL: 'CALL',
  SET: 'SET',
};

export {
  ParserContext,
  extractHostVariables,
  extractTableNames,
  extractIntoClause,
  extractWhereClause,
  extractCursorName,
  determineSqlType,
};

export default {
  parseSqlBlock,
  parseCicsBlock,
  parseAllSqlBlocks,
  parseAllCicsBlocks,
  parseSqlText,
  extractHostVariables,
  extractTableNames,
  extractIntoClause,
  extractWhereClause,
  extractCursorName,
  determineSqlType,
  CicsCommands,
  SqlTypes,
  // Phase 3: enriched statement model
  analyzeSqlStatement,
  parseSqlStatementBlock,
  parseAllSqlStatements,
  extractIntoSection,
  stripIntoClause,
  scanHostVariables,
};
