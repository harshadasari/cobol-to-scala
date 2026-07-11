/**
 * jcl-parser.js
 *
 * A real (structural, not regex-inventory) parser for MVS/z-OS JCL.
 *
 * This replaces, *inside the conversion engine only*, the capability that
 * `cobol-analysis/parsers/jcl.parser.js` provides at the analysis-dashboard
 * layer (a flat regex inventory of job name / steps / program names). That
 * file is left untouched; this module is a from-scratch structural parser
 * producing a real model: JOB card, EXEC statements (PGM= or PROC
 * invocation), DD statements (DSN/DISP/SYSOUT/DUMMY/concatenation/temp
 * datasets/referbacks/inline data), PROC/PEND definitions with symbolic
 * parameter substitution, comments, and continuation-line joining.
 *
 * ## Field-format rules implemented
 *
 * `//name operation operands comment` - name and operation are whitespace
 * delimited; operands end at the first unquoted, unparenthesized blank
 * (everything after that is comment). A statement continues onto the next
 * line when its operand text ends with a trailing comma; the continuation
 * line is recognized by `// ` (i.e. "//" followed by blank - an empty name
 * field) and its content (left-trimmed) is appended as more operand text.
 * A DD statement with an empty name field but an explicit `DD` operation
 * keyword is a *concatenation* member of the previous DD, not a
 * continuation.
 *
 * ## MVP simplifications (deliberate, documented rather than silent)
 *
 * - Only JOB, EXEC, DD, PROC and PEND statements are structurally
 *   understood. Everything else (IF/THEN/ELSE JCL, INCLUDE, SET, OUTPUT,
 *   JES2/JES3 control statements, `/*` control cards outside inline data)
 *   is captured verbatim in `unrecognized` - never silently dropped.
 * - DISP defaulting follows the common pragmatic rule: status defaults to
 *   NEW when omitted; normal-disposition defaults to DELETE when status is
 *   NEW and to KEEP otherwise; abnormal-disposition defaults to whatever
 *   the normal disposition resolved to. When DISP is omitted entirely for
 *   a real dataset, the full default is (NEW,DELETE,DELETE).
 * - GDG relative-generation qualifiers (`DSN=X.Y(+1)`), PARM.stepname=
 *   overrides and multi-level COND lists beyond a flat tuple/list are kept
 *   as raw text rather than deeply parsed.
 * - Symbolic substitution (`&SYM`) is only performed for PROC expansion
 *   (defaults from the PROC statement, overridden by the invoking EXEC's
 *   keyword operands). `&&name` temporary-dataset markers are never
 *   mistaken for symbolics (negative lookaround on double ampersand).
 * - Inline data (`DD *` / `DD DATA`) collection ends at the default `/*`
 *   delimiter, a custom `DLM=` delimiter, or - as a robustness fallback -
 *   at the next `//` statement if no explicit delimiter is present.
 * - JOBLIB/JOBCAT-style DD statements that appear before the first EXEC
 *   are attached to `job.dds` rather than dropped.
 */

// ---------------------------------------------------------------------
// Low-level text helpers (quote/paren aware scanning)
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

/** Split `text` at the first unquoted, unparenthesized run of whitespace. */
function splitOperandAndComment(text) {
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
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth === 0 && /\s/.test(ch)) {
      return { operand: text.slice(0, i), comment: text.slice(i + 1).trim() };
    }
  }
  return { operand: text, comment: '' };
}

/** Split `text` on `sep` at paren/quote depth 0. */
function splitTopLevel(text, sep = ',', keepEmpty = false) {
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
  const trimmed = parts.map((p) => p.trim());
  return keepEmpty ? trimmed : trimmed.filter((p) => p.length > 0);
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

/** Parse an operand list into positional tokens and KEY=value params. */
function parseOperands(text) {
  const tokens = splitTopLevel(text, ',', false);
  const positional = [];
  const params = {};
  for (const tok of tokens) {
    const eq = findTopLevelEquals(tok);
    if (eq === -1) {
      positional.push(tok);
      continue;
    }
    const key = tok.slice(0, eq).trim().toUpperCase();
    const val = tok.slice(eq + 1).trim();
    params[key] = val;
  }
  return { positional, params };
}

// ---------------------------------------------------------------------
// DISP / COND helpers
// ---------------------------------------------------------------------

function parseDisp(raw) {
  const defaulted = [];
  let parts;
  if (raw === undefined) {
    parts = [];
  } else if (raw.startsWith('(')) {
    const inner = raw.slice(1, raw.lastIndexOf(')'));
    parts = splitTopLevel(inner, ',', true);
  } else {
    parts = [raw.trim()];
  }

  let status = (parts[0] || '').trim();
  if (!status) {
    status = 'NEW';
    defaulted.push('status');
  }
  status = status.toUpperCase();

  let normal = (parts[1] || '').trim();
  if (!normal) {
    normal = status === 'NEW' ? 'DELETE' : 'KEEP';
    defaulted.push('normal');
  } else {
    normal = normal.toUpperCase();
  }

  let abnormal = (parts[2] || '').trim();
  if (!abnormal) {
    abnormal = normal;
    defaulted.push('abnormal');
  } else {
    abnormal = abnormal.toUpperCase();
  }

  return { status, normal, abnormal, defaulted };
}

function parseCond(raw) {
  if (raw === undefined) return null;
  let text = raw.trim();
  if (text.startsWith('(')) text = stripOuterParens(text);
  const parts = splitTopLevel(text, ',', true);

  if (parts.length === 2 && /^\d+$/.test(parts[0].trim())) {
    return { code: parts[0].trim(), operator: parts[1].trim().toUpperCase() };
  }

  if (parts.length > 1 && parts.every((p) => /^\(\s*\d+\s*,\s*[A-Za-z]+\s*\)$/.test(p.trim()))) {
    return parts.map((p) => {
      const inner = stripOuterParens(p.trim());
      const [code, operator] = splitTopLevel(inner, ',', true);
      return { code: code.trim(), operator: operator.trim().toUpperCase() };
    });
  }

  return { keyword: raw.trim().toUpperCase() };
}

// ---------------------------------------------------------------------
// Statement builders
// ---------------------------------------------------------------------

function buildJob(name, positional, params) {
  const job = {
    name,
    accounting: positional[0] !== undefined ? dequote(stripOuterParens(positional[0])) : null,
    programmer: positional[1] !== undefined ? dequote(positional[1]) : null,
    class: params.CLASS !== undefined ? dequote(params.CLASS) : null,
    msgclass: params.MSGCLASS !== undefined ? dequote(params.MSGCLASS) : null,
    msglevel: params.MSGLEVEL !== undefined ? dequote(params.MSGLEVEL) : null,
    params: {},
    dds: [],
  };
  for (const [key, val] of Object.entries(params)) {
    if (key === 'CLASS' || key === 'MSGCLASS' || key === 'MSGLEVEL') continue;
    job.params[key] = dequote(val);
  }
  return job;
}

function buildStep(name, positional, params) {
  const step = {
    name,
    program: null,
    proc: null,
    parm: null,
    cond: null,
    overrides: {},
    dds: [],
  };
  const rest = { ...params };

  if (rest.PGM !== undefined) {
    step.program = dequote(rest.PGM);
    delete rest.PGM;
  } else if (rest.PROC !== undefined) {
    step.proc = dequote(rest.PROC);
    delete rest.PROC;
  } else if (positional.length > 0) {
    step.proc = positional[0];
  }

  if (rest.PARM !== undefined) {
    step.parm = dequote(rest.PARM);
    delete rest.PARM;
  }
  if (rest.COND !== undefined) {
    step.cond = parseCond(rest.COND);
    delete rest.COND;
  }

  for (const [key, val] of Object.entries(rest)) {
    step.overrides[key] = dequote(val);
  }

  return step;
}

function buildSymbolics(params) {
  const out = {};
  for (const [key, val] of Object.entries(params)) out[key] = dequote(val);
  return out;
}

const REFERBACK_PATTERN = /^\*\.(?:([A-Za-z0-9$#@]+)\.)?([A-Za-z0-9$#@]+)$/;

function buildDd(name, positional, params) {
  const dd = {
    ddname: name || null,
    dsn: null,
    disp: null,
    sysout: null,
    dummy: false,
    star: false,
    temp: false,
    referback: null,
    inlineData: null,
    params: {},
  };

  const posUpper = positional.map((p) => p.toUpperCase());
  if (posUpper.includes('DUMMY')) dd.dummy = true;
  if (positional.includes('*') || posUpper.includes('DATA')) dd.star = true;

  for (const [key, rawVal] of Object.entries(params)) {
    switch (key) {
      case 'DSN':
      case 'DSNAME': {
        const val = dequote(rawVal);
        const rb = val.match(REFERBACK_PATTERN);
        if (rb) {
          dd.referback = { step: rb[1] || null, ddname: rb[2] };
        } else {
          dd.dsn = val;
          dd.temp = val.startsWith('&&');
        }
        break;
      }
      case 'DISP':
        dd.disp = parseDisp(rawVal);
        break;
      case 'SYSOUT':
        dd.sysout = dequote(rawVal);
        break;
      default:
        dd.params[key] = dequote(rawVal);
    }
  }

  // Default DISP for a statement that names (or refers back to) a real dataset.
  if ((dd.dsn !== null || dd.referback !== null) && dd.disp === null) {
    dd.disp = parseDisp(undefined);
  }

  return dd;
}

// ---------------------------------------------------------------------
// PROC expansion / symbolic substitution
// ---------------------------------------------------------------------

const SYMBOL_PATTERN = /(?<!&)&(?!&)([A-Za-z0-9#@$]+)/g;

function substituteSymbols(text, symbolTable) {
  if (typeof text !== 'string') return text;
  return text.replace(SYMBOL_PATTERN, (whole, sym) => {
    const key = sym.toUpperCase();
    return Object.prototype.hasOwnProperty.call(symbolTable, key) ? symbolTable[key] : whole;
  });
}

function substituteDdSymbols(dd, symbolTable) {
  const out = { ...dd };
  out.dsn = substituteSymbols(dd.dsn, symbolTable);
  out.sysout = substituteSymbols(dd.sysout, symbolTable);
  out.params = {};
  for (const [key, val] of Object.entries(dd.params || {})) {
    out.params[key] = substituteSymbols(val, symbolTable);
  }
  if (dd.concatenation) {
    out.concatenation = dd.concatenation.map((c) => substituteDdSymbols(c, symbolTable));
  }
  return out;
}

function findProc(procs, name) {
  if (!name) return null;
  const upper = name.toUpperCase();
  for (const key of Object.keys(procs)) {
    if (key.toUpperCase() === upper) return procs[key];
  }
  return null;
}

function expandProc(step, procDef) {
  const symbolTable = { ...procDef.symbolics, ...step.overrides };
  return procDef.steps.map((pStep) => ({
    name: `${step.name}.${pStep.name}`,
    program: substituteSymbols(pStep.program, symbolTable),
    parm: substituteSymbols(pStep.parm, symbolTable),
    cond: pStep.cond,
    dds: pStep.dds.map((dd) => substituteDdSymbols(dd, symbolTable)),
  }));
}

// ---------------------------------------------------------------------
// Main parse
// ---------------------------------------------------------------------

/**
 * Parse JCL source text into a structured model.
 * @param {string} text
 * @returns {{job: object|null, steps: object[], procs: object, comments: string[], unrecognized: object[]}}
 */
export function parseJcl(text) {
  const lines = text.split(/\r\n|\r|\n/);

  const jclModel = {
    job: null,
    steps: [],
    procs: {},
    comments: [],
    unrecognized: [],
  };

  let insideProc = false;
  let currentProc = null;
  // container: { kind: 'job' } | { kind: 'step', step } | { kind: 'proc' } | { kind: 'procStep', step }
  let container = { kind: 'job' };

  let collectingFor = null; // dd entry currently gathering inline data
  let delimiter = null; // custom DLM value, or null for default '/*'

  function attachDd(dd, hasName) {
    if (container.kind === 'job') {
      if (hasName) {
        jclModel.job ? jclModel.job.dds.push(dd) : jclModel.unrecognized.push({ note: 'DD before JOB card', dd });
      } else {
        const list = jclModel.job ? jclModel.job.dds : null;
        const last = list && list[list.length - 1];
        if (last) (last.concatenation ||= []).push(dd);
      }
    } else if (container.kind === 'proc') {
      (currentProc.dds ||= []).push(dd);
    } else {
      const step = container.step;
      if (hasName) {
        step.dds.push(dd);
      } else {
        const last = step.dds[step.dds.length - 1];
        if (last) (last.concatenation ||= []).push(dd);
      }
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (collectingFor) {
      const isDelimiter = delimiter ? line.startsWith(delimiter) : line.startsWith('/*');
      const isNextStatement = line.startsWith('//');
      if (isDelimiter) {
        collectingFor = null;
        delimiter = null;
        i++;
        continue;
      }
      if (isNextStatement) {
        // Robustness fallback: no explicit delimiter before the next statement.
        collectingFor = null;
        delimiter = null;
        continue; // re-process this line as a normal statement
      }
      collectingFor.inlineData.push(line);
      i++;
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    if (line.startsWith('//*')) {
      jclModel.comments.push(line.slice(3).trim());
      i++;
      continue;
    }

    if (line.startsWith('/*')) {
      // Stray delimiter/JES control statement outside inline-data collection.
      jclModel.unrecognized.push({ raw: line });
      i++;
      continue;
    }

    if (!line.startsWith('//')) {
      // Stray non-JCL line outside inline-data collection (e.g. malformed input).
      jclModel.unrecognized.push({ raw: line });
      i++;
      continue;
    }

    // Begin a logical statement, possibly spanning continuation lines.
    const firstRest = line.slice(2);
    const m = firstRest.match(/^(\S*)\s+(\S+)([\s\S]*)$/);
    let name = '';
    let operation = '';
    let fragText = '';
    if (m) {
      name = m[1];
      operation = m[2];
      fragText = m[3].replace(/^\s+/, '');
    } else {
      name = firstRest;
    }

    let operandText = '';
    let comment = '';
    for (;;) {
      const { operand, comment: c } = splitOperandAndComment(fragText);
      operandText += operand;
      const continues = operand.trim().endsWith(',') && c === '' &&
        i + 1 < lines.length && /^\/\/\s/.test(lines[i + 1]);
      if (continues) {
        i++;
        fragText = lines[i].slice(2).replace(/^\s+/, '');
        continue;
      }
      comment = c;
      break;
    }
    i++;

    const { positional, params } = parseOperands(operandText);
    const op = operation.toUpperCase();

    switch (op) {
      case 'JOB': {
        jclModel.job = buildJob(name, positional, params);
        container = { kind: 'job' };
        break;
      }
      case 'EXEC': {
        const step = buildStep(name, positional, params);
        if (insideProc) {
          currentProc.steps.push(step);
          container = { kind: 'procStep', step };
        } else {
          jclModel.steps.push(step);
          container = { kind: 'step', step };
        }
        break;
      }
      case 'DD': {
        const dd = buildDd(name, positional, params);
        attachDd(dd, Boolean(name));
        if (dd.star) {
          dd.inlineData = [];
          collectingFor = dd;
          delimiter = dd.params.DLM ? dd.params.DLM : null;
        }
        break;
      }
      case 'PROC': {
        currentProc = { name, symbolics: buildSymbolics(params), steps: [] };
        jclModel.procs[name] = currentProc;
        insideProc = true;
        container = { kind: 'proc' };
        break;
      }
      case 'PEND': {
        insideProc = false;
        currentProc = null;
        container = { kind: 'job' };
        break;
      }
      default: {
        jclModel.unrecognized.push({ name, operation, operands: operandText, comment });
      }
    }
  }

  // Resolve in-stream PROC expansion for every step that invokes one.
  for (const step of jclModel.steps) {
    if (step.proc) {
      const procDef = findProc(jclModel.procs, step.proc);
      if (procDef) {
        step.expandedSteps = expandProc(step, procDef);
      }
    }
  }

  return jclModel;
}

// ---------------------------------------------------------------------
// Dataset lineage
// ---------------------------------------------------------------------

/**
 * Build a simple dataset producer/consumer graph from a parsed JCL model.
 * DISP=NEW -> writtenBy; DISP=OLD/SHR -> readBy; DISP=MOD -> both (treated
 * as read-then-extend). Referbacks (`DSN=*.step.ddname` / `DSN=*.ddname`)
 * are resolved to the literal dataset name of the DD they point at.
 * DUMMY/SYSOUT/`DD *` pseudo-datasets are not real datasets and are
 * excluded from the graph.
 *
 * @param {ReturnType<typeof parseJcl>} jclModel
 * @returns {{datasets: Record<string, {writtenBy: string[], readBy: string[]}>}}
 */
export function buildDatasetFlow(jclModel) {
  const datasets = {};
  const stepDdIndex = {};

  function ensure(dsn) {
    if (!datasets[dsn]) datasets[dsn] = { writtenBy: [], readBy: [] };
    return datasets[dsn];
  }

  function record(dsn, stepName, disp) {
    const entry = ensure(dsn);
    const status = disp ? disp.status : 'NEW';
    if (status === 'NEW') {
      if (!entry.writtenBy.includes(stepName)) entry.writtenBy.push(stepName);
    } else if (status === 'MOD') {
      if (!entry.writtenBy.includes(stepName)) entry.writtenBy.push(stepName);
      if (!entry.readBy.includes(stepName)) entry.readBy.push(stepName);
    } else {
      if (!entry.readBy.includes(stepName)) entry.readBy.push(stepName);
    }
  }

  function processDds(stepName, dds) {
    stepDdIndex[stepName] = stepDdIndex[stepName] || {};
    for (const dd of dds) {
      const members = [dd, ...(dd.concatenation || [])];
      for (const entry of members) {
        let dsn = entry.dsn;
        if (!dsn && entry.referback) {
          const rb = entry.referback;
          const scope = rb.step ? stepDdIndex[rb.step] : stepDdIndex[stepName];
          dsn = (scope && scope[rb.ddname]) || null;
        }
        if (dsn && entry.ddname) {
          stepDdIndex[stepName][entry.ddname] = dsn;
        }
        if (!dsn || entry.dummy || entry.sysout || entry.star) continue;
        record(dsn, stepName, entry.disp);
      }
    }
  }

  for (const step of jclModel.steps) {
    if (step.expandedSteps) {
      for (const ex of step.expandedSteps) processDds(ex.name, ex.dds);
    } else {
      processDds(step.name, step.dds);
    }
  }

  return { datasets };
}

export default { parseJcl, buildDatasetFlow };
