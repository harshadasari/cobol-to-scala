/**
 * dclgen-parser.js
 *
 * Parses DB2 DCLGEN output files: the `EXEC SQL DECLARE ... TABLE` block
 * (SQL column definitions) *and* the companion COBOL host-variable
 * structure (the `01 DCLxxx` record) that DB2's DCLGEN utility generates
 * side by side in the same member, returning both plus their standard
 * positional column <-> host-variable correspondence.
 *
 * ## Shape produced
 *
 *   {
 *     tableName: string | null,
 *     recordName: string | null,          // the 01-level COBOL record name
 *     columns: [{ name, sqlType, precision, scale, nullable }],
 *     hostVariables: [{ cobolName, level, picture, usage }],
 *     columnToHost: [{ column, hostVar }],
 *     unrecognized: [...],                // anything that didn't parse - never silently dropped
 *   }
 *
 * ## MVP simplifications (documented rather than silent)
 *
 * - SQL types recognized: INTEGER/INT, SMALLINT, CHAR/CHARACTER(n),
 *   VARCHAR(n), DATE, TIMESTAMP, DECIMAL/DEC/NUMERIC(p[,s]). DECIMAL scale
 *   defaults to 0 when omitted, per SQL semantics; CHAR length defaults to
 *   1 when omitted.
 * - The DECLARE TABLE column list is located by scanning for the first
 *   balanced `( ... )` after the `TABLE` keyword - it does not otherwise
 *   validate the surrounding `EXEC SQL ... END-EXEC.` wrapper text.
 * - The COBOL host-variable structure is taken to be every non-comment,
 *   non-blank line after the first `01 <name>.` line through end of file
 *   (or through a trailing `****END OF DECLARATION*****` banner, which is
 *   itself a COBOL comment line and thus naturally skipped). Field
 *   definitions must fit on a single physical line - PIC-clause
 *   continuation across lines is not handled.
 * - "Top-level" host variables (the ones a SQL column corresponds to) are
 *   the fields at the minimum level number found in the record body -
 *   this matches DCLGEN's own convention (typically level 10) whether or
 *   not the file happens to use 05 or 10. Nested VARCHAR substructure
 *   (level 49 `-LEN` / `-TEXT` pairs) is still reported in
 *   `hostVariables`, but `columnToHost` maps each SQL column to the
 *   top-level group name (e.g. `EMP-NAME`), not to the nested `-TEXT`
 *   field - this is the customary way such host variables are referenced
 *   in EXEC SQL statements.
 * - Column <-> host-variable correspondence is purely positional (i-th
 *   column <-> i-th top-level host variable), which is the standard
 *   DCLGEN guarantee; if the counts differ, only the overlapping prefix
 *   is paired.
 */

function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 0);
}

function extractDeclareBlock(text) {
  const declareMatch = text.match(/EXEC\s+SQL\s+DECLARE\s+([A-Za-z0-9_.$#@]+)\s+TABLE/i);
  if (!declareMatch) return null;

  const tableName = declareMatch[1];
  const searchFrom = declareMatch.index + declareMatch[0].length;
  const openParenIdx = text.indexOf('(', searchFrom);
  if (openParenIdx === -1) return { tableName, columnsBlock: null };

  let depth = 0;
  let endIdx = -1;
  for (let i = openParenIdx; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }
  if (endIdx === -1) return { tableName, columnsBlock: null };

  return { tableName, columnsBlock: text.slice(openParenIdx + 1, endIdx) };
}

const TYPE_ALIASES = {
  DEC: 'DECIMAL',
  NUMERIC: 'DECIMAL',
  DECIMAL: 'DECIMAL',
  CHARACTER: 'CHAR',
  CHAR: 'CHAR',
  VARCHAR: 'VARCHAR',
  INT: 'INTEGER',
  INTEGER: 'INTEGER',
  SMALLINT: 'SMALLINT',
  DATE: 'DATE',
  TIMESTAMP: 'TIMESTAMP',
};

function parseColumn(entry) {
  const nullable = !/NOT\s+NULL/i.test(entry);
  const withoutNotNull = entry.replace(/NOT\s+NULL/i, '').trim();
  const m = withoutNotNull.match(/^(\S+)\s+([A-Za-z]+)\s*(?:\(([^)]*)\))?/);
  if (!m) return null;

  const name = m[1];
  const rawType = m[2].toUpperCase();
  const sqlType = TYPE_ALIASES[rawType];
  if (!sqlType) return null;
  const args = m[3] !== undefined ? splitTopLevelCommas(m[3]) : [];

  let precision = null;
  let scale = null;
  if (sqlType === 'DECIMAL') {
    precision = args[0] !== undefined ? parseInt(args[0], 10) : null;
    scale = args[1] !== undefined ? parseInt(args[1], 10) : 0;
  } else if (sqlType === 'CHAR') {
    precision = args[0] !== undefined ? parseInt(args[0], 10) : 1;
  } else if (sqlType === 'VARCHAR') {
    precision = args[0] !== undefined ? parseInt(args[0], 10) : null;
  }

  return { name, sqlType, precision, scale, nullable };
}

function parseHostField(rawLine) {
  let line = rawLine.trim();
  if (line.endsWith('.')) line = line.slice(0, -1).trim();
  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 2) return null;

  const level = parseInt(tokens[0], 10);
  if (Number.isNaN(level)) return null;
  const cobolName = tokens[1];

  let picture = null;
  let usage = 'DISPLAY';

  if (tokens[2] && /^PIC(TURE)?$/i.test(tokens[2])) {
    picture = tokens[3] || null;
    let rest = tokens.slice(4);
    if (rest[0] && /^USAGE$/i.test(rest[0])) rest = rest.slice(1);
    if (rest.length > 0) usage = rest.join(' ').toUpperCase();
  } else {
    // Group item: no PIC clause of its own.
    usage = null;
  }

  return { cobolName, level, picture, usage };
}

/**
 * Parse a DCLGEN member (DECLARE TABLE SQL block + COBOL host-variable
 * structure) into a structured model.
 * @param {string} text
 */
export function parseDclgen(text) {
  const unrecognized = [];

  const declareInfo = extractDeclareBlock(text);
  let tableName = null;
  const columns = [];

  if (!declareInfo) {
    unrecognized.push({ kind: 'declare-table', raw: 'EXEC SQL DECLARE ... TABLE not found' });
  } else {
    tableName = declareInfo.tableName;
    if (declareInfo.columnsBlock === null) {
      unrecognized.push({ kind: 'declare-table', raw: 'column list ( ... ) not found' });
    } else {
      for (const entry of splitTopLevelCommas(declareInfo.columnsBlock)) {
        const col = parseColumn(entry);
        if (col) columns.push(col);
        else unrecognized.push({ kind: 'column', raw: entry });
      }
    }
  }

  const lines = text.split(/\r\n|\r|\n/);
  let recordName = null;
  let hostStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*01\s+([A-Za-z0-9-]+)\.?\s*$/);
    if (m) {
      recordName = m[1];
      hostStartIdx = i + 1;
      break;
    }
  }

  const hostVariables = [];
  if (hostStartIdx === -1) {
    unrecognized.push({ kind: 'host-record', raw: '01-level COBOL record not found' });
  } else {
    for (let i = hostStartIdx; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      if (/^\s*\*/.test(line)) continue; // COBOL comment line (incl. END OF DECLARATION banner)
      if (!/^\s*\d{1,2}\s+/.test(line)) {
        unrecognized.push({ kind: 'host-field', raw: line });
        continue;
      }
      const field = parseHostField(line);
      if (field) hostVariables.push(field);
      else unrecognized.push({ kind: 'host-field', raw: line });
    }
  }

  let topLevel = [];
  if (hostVariables.length > 0) {
    const minLevel = Math.min(...hostVariables.map((f) => f.level));
    topLevel = hostVariables.filter((f) => f.level === minLevel);
  }

  const columnToHost = [];
  const pairCount = Math.min(columns.length, topLevel.length);
  for (let i = 0; i < pairCount; i++) {
    columnToHost.push({ column: columns[i].name, hostVar: topLevel[i].cobolName });
  }

  return { tableName, recordName, columns, hostVariables, columnToHost, unrecognized };
}

export default { parseDclgen };
