/**
 * parser/bms-parser.js
 *
 * Parses BMS (Basic Mapping Support) map definitions - the assembler-macro
 * source (`.bms`) that defines a 3270 screen layout - into a structured
 * model, plus `bmsToRecordLayout`, which turns one parsed map into the
 * equivalent COBOL-style *symbolic map* field list (the `L`/`F`/`A`-suffixed
 * control fields plus the data field(s) that a real BMS assembly generates
 * into a copybook). This is what makes BMS useful for conversion: the
 * symbolic map is the request/response DTO shape for a CICS SEND MAP/RECEIVE
 * MAP pair (see `generator/cics-gen.js`).
 *
 * ## Macro grammar handled
 *
 * `DFHMSD` (one per mapset - `label DFHMSD TYPE=..., MODE=..., LANG=...,
 * TIOAPFX=...`), `DFHMDI` (one per map within the mapset - `label DFHMDI
 * SIZE=(rows,cols), LINE=n, COLUMN=n`), `DFHMDF` (one per field within a map
 * - `label DFHMDF POS=(line,col), LENGTH=n, ATTRB=(...), INITIAL='...',
 * PICIN='...', PICOUT='...'` - `label` is omitted entirely for unnamed
 * fields, almost always constant/literal text such as screen titles, which
 * never get a symbolic-map entry because the program never reads or writes
 * them).
 *
 * ## Field-format rules implemented
 *
 * A statement line either starts at column 1 with a label (`label OPCODE
 * operands`) or starts with leading whitespace and no label (` OPCODE
 * operands` - an unnamed `DFHMDF`, or simply a continuation - see below). A
 * line is only ever treated as the *start* of a new statement when its first
 * non-blank token is a recognized opcode (`DFHMSD`/`DFHMDI`/`DFHMDF`);
 * anything else encountered where a new statement was expected is reported
 * in `unrecognized` rather than silently skipped.
 *
 * ## MVP simplifications (deliberate, documented rather than silent)
 *
 * - **Continuation lines**: real fixed-format assembler continues a
 *   statement onto the next line via a non-blank character in column 72 (the
 *   operand field runs cols 16-71, col 72 is the continuation flag, cols
 *   73-80 are a sequence number). Per the task's own guidance this parser is
 *   pragmatic instead: a statement continues onto the next physical line
 *   whenever its accumulated operand text (so far) ends with a trailing
 *   comma - the same convention `parser/jcl-parser.js` already uses for JCL
 *   continuation - and the continuation line's content (left-trimmed) is
 *   appended verbatim. This covers the overwhelmingly common "trailing comma
 *   + indented continuation" authoring style without requiring column-exact
 *   input.
 * - **Comments**: `*` in column 1 is a full-line comment (the classic
 *   assembler convention) and is dropped entirely. A trailing same-line
 *   comment after an operand list is *not* specifically split out (BMS
 *   source in the wild rarely mixes the two on one physical line); if
 *   present it would be folded into the last `KEY=value` - a known, narrow
 *   limitation.
 * - **`DFHMSD TYPE=FINAL`**: the conventional "end of mapset chain" marker
 *   some shops append is not itself a mapset (it has no `MODE`/maps) and is
 *   recorded in `unrecognized` (`kind: 'mapset-end'`) rather than forced into
 *   the `{name, maps}` shape.
 * - **`DFHMDI`/`DFHMDF` outside their enclosing macro** (no open mapset/map)
 *   are recorded in `unrecognized` (`kind: 'orphan-DFHMDI'`/`'orphan-DFHMDF'`)
 *   instead of crashing or being dropped.
 * - Attributes not covered by the explicit field list below (`GRPNAME`,
 *   `JUSTIFY`, `OCCURS`, `COLOR`, `HILIGHT`, `PS`, `SOSI`, ...) are simply
 *   not extracted - this parser targets the fields the roadmap's Phase 4
 *   scope names (`POS`, `LENGTH`, `ATTRB`, `INITIAL`, `PICIN`/`PICOUT`) plus
 *   the mapset/map identity fields, not the full BMS attribute surface.
 *
 * ## `bmsToRecordLayout` simplifications
 *
 * Real BMS assembly generates, per named field `NAME` with `LENGTH n`:
 * a length halfword (`NAMEL PIC S9(4) COMP`), a flag byte (`NAMEF PIC X`),
 * an attribute byte redefining the flag (`NAMEA PIC X`), and the data
 * field(s) themselves - `NAME` (bare `PIC X(n)`) when neither `PICIN` nor
 * `PICOUT` is given, or `NAMEI`/`NAMEO` (typed from `PICIN`/`PICOUT`
 * respectively) when either or both are given. `bmsToRecordLayout`
 * reproduces exactly that shape. It does not model IBM's fuller set of
 * generator options (`SUFFIX=`, `DSATTS=`, color/highlight attribute
 * subfields, etc.) - it targets the common case needed to derive a
 * request/response DTO shape for `generator/cics-gen.js`.
 */

const KNOWN_OPCODES = new Set(['DFHMSD', 'DFHMDI', 'DFHMDF']);

// ---------------------------------------------------------------------
// Low-level text helpers (quote/paren aware scanning - same approach as
// parser/jcl-parser.js, reimplemented locally since those helpers aren't
// exported from that module).
// ---------------------------------------------------------------------

function dequote(value) {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function stripOuterParens(value) {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (t.startsWith('(') && t.endsWith(')')) {
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') depth++;
      else if (t[i] === ')') {
        depth--;
        if (depth === 0 && i !== t.length - 1) return t; // not a true single outer wrap
      }
    }
    return t.slice(1, -1);
  }
  return t;
}

/** Split `text` on `sep` at paren/quote depth 0. */
function splitTopLevel(text, sep = ',') {
  const parts = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === "'") {
        if (text[i + 1] === "'") { i++; continue; }
        inQuote = false;
      }
      continue;
    }
    if (ch === "'") { inQuote = true; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function findTopLevelEquals(text) {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === "'") {
        if (text[i + 1] === "'") { i++; continue; }
        inQuote = false;
      }
      continue;
    }
    if (ch === "'") { inQuote = true; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '=' && depth === 0) return i;
  }
  return -1;
}

/** Parse a comma-separated `KEY=value` operand list into a plain object (keys upper-cased). */
function parseOperandParams(text) {
  const params = {};
  for (const tok of splitTopLevel(text, ',')) {
    const eq = findTopLevelEquals(tok);
    if (eq === -1) continue; // not KEY=value shaped - ignored (BMS operands are conventionally all keyword form)
    const key = tok.slice(0, eq).trim().toUpperCase();
    const val = tok.slice(eq + 1).trim();
    params[key] = val;
  }
  return params;
}

/** Parse a `(a,b)` operand value into `{[key1]: a, [key2]: b}` (both ints), or null if absent. */
function parsePair(raw, key1, key2) {
  if (raw === undefined) return null;
  const inner = stripOuterParens(raw);
  const parts = splitTopLevel(inner, ',');
  const a = parts[0] !== undefined ? parseInt(parts[0], 10) : null;
  const b = parts[1] !== undefined ? parseInt(parts[1], 10) : null;
  return { [key1]: Number.isNaN(a) ? null : a, [key2]: Number.isNaN(b) ? null : b };
}

/** Parse an `ATTRB=(A,B,C)` or bare `ATTRB=A` operand value into `['A','B','C']`, or null if absent. */
function parseAttrbList(raw) {
  if (raw === undefined) return null;
  const inner = stripOuterParens(raw);
  return splitTopLevel(inner, ',').map((p) => p.toUpperCase());
}

function isFinalType(rawType) {
  if (rawType === undefined) return false;
  return dequote(rawType).toUpperCase() === 'FINAL';
}

// ---------------------------------------------------------------------
// Statement-line scanning (label/opcode/operand-text + continuation)
// ---------------------------------------------------------------------

/**
 * Scan `lines` starting at `startIdx` for one logical BMS statement
 * (label + opcode + fully-joined operand text across trailing-comma
 * continuation lines). Returns null if the line at `startIdx` is blank, a
 * comment, or does not start a recognized statement.
 */
function scanStatement(lines, startIdx) {
  const line = lines[startIdx];
  const leadingSpace = /^\s/.test(line);

  let label = null;
  let opcode = null;
  let rest = '';

  if (leadingSpace) {
    const m = line.match(/^\s+(\S+)([\s\S]*)$/);
    if (m) {
      opcode = m[1];
      rest = m[2];
    }
  } else {
    const m = line.match(/^(\S+)\s+(\S+)([\s\S]*)$/);
    if (m) {
      label = m[1];
      opcode = m[2];
      rest = m[3];
    } else {
      label = line.trim();
    }
  }

  const opcodeUpper = opcode ? opcode.toUpperCase() : null;
  if (!opcodeUpper || !KNOWN_OPCODES.has(opcodeUpper)) {
    return null;
  }

  let operandText = rest.replace(/^\s+/, '');
  let nextIdx = startIdx + 1;
  while (operandText.trim().endsWith(',') && nextIdx < lines.length) {
    const next = lines[nextIdx];
    if (next.trim() === '' || next.startsWith('*')) break;
    operandText += next.replace(/^\s+/, '');
    nextIdx++;
  }

  return { label, opcode: opcodeUpper, operandText, nextIdx };
}

// ---------------------------------------------------------------------
// Main parse
// ---------------------------------------------------------------------

/**
 * Parse BMS mapset source text into a structured model.
 * @param {string} text
 * @returns {{mapsets: Array<{name: string|null, type: string|null, mode: string|null,
 *   lang: string|null, tioapfx: string|null,
 *   maps: Array<{name: string|null, size: {rows:number|null, cols:number|null}|null,
 *     line: number|null, column: number|null,
 *     fields: Array<{name: string|null, pos: {line:number|null, col:number|null}|null,
 *       length: number|null, attrb: string[]|null, initial: string|null,
 *       picin: string|null, picout: string|null}>}>}>,
 *   unrecognized: object[]}}
 */
export function parseBms(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const model = { mapsets: [], unrecognized: [] };

  let currentMapset = null;
  let currentMap = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }
    if (line.startsWith('*')) { i++; continue; }

    const statement = scanStatement(lines, i);
    if (!statement) {
      model.unrecognized.push({ raw: line });
      i++;
      continue;
    }

    const { label, opcode, operandText, nextIdx } = statement;
    const params = parseOperandParams(operandText);
    i = nextIdx;

    if (opcode === 'DFHMSD') {
      if (isFinalType(params.TYPE)) {
        model.unrecognized.push({ kind: 'mapset-end', label, params });
        currentMapset = null;
        currentMap = null;
        continue;
      }
      currentMapset = {
        name: label,
        type: params.TYPE !== undefined ? dequote(params.TYPE) : null,
        mode: params.MODE !== undefined ? dequote(params.MODE) : null,
        lang: params.LANG !== undefined ? dequote(params.LANG) : null,
        tioapfx: params.TIOAPFX !== undefined ? dequote(params.TIOAPFX) : null,
        maps: [],
      };
      model.mapsets.push(currentMapset);
      currentMap = null;
      continue;
    }

    if (opcode === 'DFHMDI') {
      if (!currentMapset) {
        model.unrecognized.push({ kind: 'orphan-DFHMDI', label, params });
        continue;
      }
      currentMap = {
        name: label,
        size: parsePair(params.SIZE, 'rows', 'cols'),
        line: params.LINE !== undefined ? parseInt(dequote(params.LINE), 10) : null,
        column: params.COLUMN !== undefined ? parseInt(dequote(params.COLUMN), 10) : null,
        fields: [],
      };
      currentMapset.maps.push(currentMap);
      continue;
    }

    if (opcode === 'DFHMDF') {
      if (!currentMap) {
        model.unrecognized.push({ kind: 'orphan-DFHMDF', label, params });
        continue;
      }
      currentMap.fields.push({
        name: label || null,
        pos: parsePair(params.POS, 'line', 'col'),
        length: params.LENGTH !== undefined ? parseInt(dequote(params.LENGTH), 10) : null,
        attrb: parseAttrbList(params.ATTRB),
        initial: params.INITIAL !== undefined ? dequote(params.INITIAL) : null,
        picin: params.PICIN !== undefined ? dequote(params.PICIN) : null,
        picout: params.PICOUT !== undefined ? dequote(params.PICOUT) : null,
      });
    }
  }

  return model;
}

// ---------------------------------------------------------------------
// bmsToRecordLayout
// ---------------------------------------------------------------------

/**
 * Turn one parsed map (`parseBms(...).mapsets[i].maps[j]`) into the
 * equivalent COBOL-style symbolic map field list - see file header for the
 * exact shape reproduced and its documented simplifications.
 *
 * @param {{name: string|null, fields: object[]}} map
 * @returns {{name: string|null, fields: Array<{name: string, kind: 'length'|'flag'|'attribute'|'data',
 *   baseName: string, picture: string, length: number, direction?: 'input'|'output'|'both', redefines?: string}>}}
 */
export function bmsToRecordLayout(map) {
  const fields = [];

  for (const f of map?.fields || []) {
    if (!f.name) continue; // unnamed (literal/constant) fields never get a symbolic-map entry

    const base = f.name;
    const len = f.length ?? 0;

    fields.push({ name: `${base}L`, kind: 'length', baseName: base, picture: 'S9(4) COMP', length: 2 });
    fields.push({ name: `${base}F`, kind: 'flag', baseName: base, picture: 'X', length: 1 });
    fields.push({
      name: `${base}A`, kind: 'attribute', baseName: base, picture: 'X', length: 1, redefines: `${base}F`,
    });

    const hasPicin = f.picin !== null && f.picin !== undefined;
    const hasPicout = f.picout !== null && f.picout !== undefined;

    if (!hasPicin && !hasPicout) {
      fields.push({
        name: base, kind: 'data', baseName: base, direction: 'both', picture: `X(${len})`, length: len,
      });
    } else {
      if (hasPicin) {
        fields.push({
          name: `${base}I`, kind: 'data', baseName: base, direction: 'input', picture: f.picin, length: len,
        });
      }
      if (hasPicout) {
        fields.push({
          name: `${base}O`, kind: 'data', baseName: base, direction: 'output', picture: f.picout, length: len,
        });
      }
    }
  }

  return { name: map?.name ?? null, fields };
}

export default { parseBms, bmsToRecordLayout };
