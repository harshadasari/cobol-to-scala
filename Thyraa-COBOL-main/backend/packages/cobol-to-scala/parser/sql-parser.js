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
};
