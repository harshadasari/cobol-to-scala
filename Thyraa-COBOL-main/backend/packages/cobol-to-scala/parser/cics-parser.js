/**
 * parser/cics-parser.js
 *
 * Phase 4 (online systems): classifies EXEC CICS command *content* strings
 * into a structured model.
 *
 * `parser/procedure-parser.js`'s `parseExecStatement` already isolates every
 * `EXEC CICS ... END-EXEC` block from the token stream, but deliberately
 * leaves its body opaque: `{type: 'EXEC', execType: 'CICS', content}` where
 * `content` is the space-joined token values between `CICS` and `END-EXEC`
 * (string/hex literal quotes are already stripped by the lexer, so
 * `MAP('CUSTMAP')` arrives here as the token sequence `MAP ( CUSTMAP )`).
 * This module is the next step: turn that opaque string into
 * `{command, options, respHandling, raw}` without touching the opaque
 * capture itself (this file is additive only - `procedure-parser.js` is not
 * modified).
 *
 * ## Command grammar handled
 *
 * A CICS command is a verb (one word, e.g. `READ`, `SEND`) optionally
 * followed by a *bare* second keyword that changes which command family it
 * is - `READQ`/`WRITEQ`/`DELETEQ` + `TS`/`TD` (transient data vs temporary
 * storage), `HANDLE` + `CONDITION`/`ABEND`, `IGNORE` + `CONDITION` - followed
 * by zero or more options, each either `NAME(value)` or a bare flag `NAME`
 * (stored as `true`). This module parses that grammar *generically*: every
 * `NAME(value)`/bare-`NAME` token is captured into `options`, regardless of
 * command, so a keyword this module doesn't specifically know about is still
 * preserved rather than dropped (coverage-honesty rule from
 * `docs/CAPABILITY_AUDIT_AND_ROADMAP.md`). `SEND`/`RECEIVE` are special-cased
 * *after* option parsing: real CICS syntax writes the BMS map name as the
 * `MAP(...)` option itself (there is no bare "MAP" keyword between the verb
 * and its options), so `SEND`/`RECEIVE` are reclassified to `SEND MAP`/
 * `RECEIVE MAP` only when an `options.MAP` value is actually present.
 *
 * A command whose verb (after the above normalization) isn't one of the
 * commands this module explicitly models gets `command: 'UNKNOWN'` - but
 * `options` and `raw` are still populated on a best-effort basis; nothing is
 * ever silently discarded, only the *classification* degrades.
 *
 * ## Value parsing simplifications (documented, not silent)
 *
 * - Option values are the space-joined inner tokens of a parenthesized
 *   group (so a value that itself contains nested parens, e.g. a subscripted
 *   data reference `TABLE ( 3 )`, is flattened to `"TABLE 3"` rather than
 *   preserving the parens) - adequate for a classification/scaffolding layer;
 *   not a full expression parser.
 * - `RESP`/`RESP2` are surfaced twice: once in `options` (so nothing that
 *   appeared in the source is hidden) and again, normalized, in the
 *   top-level `respHandling` field (`{resp, resp2}` with `null` for
 *   whichever of the two is absent, or `null` altogether when neither
 *   appears) - a convenience for callers that want to know "does this call
 *   handle its own exceptional conditions" without re-deriving it from
 *   `options` themselves.
 */

const SECOND_WORD_MODIFIERS = new Set(['TS', 'TD', 'CONDITION', 'ABEND']);

// Every compound/simple verb this module has an opinion about. Anything else
// normalizes to command: 'UNKNOWN' (raw + best-effort options are still kept).
const KNOWN_COMMANDS = new Set([
  'SEND MAP', 'RECEIVE MAP', 'SEND', 'RECEIVE',
  'READ', 'WRITE', 'REWRITE', 'DELETE',
  'READQ TS', 'WRITEQ TS', 'DELETEQ TS',
  'READQ TD', 'WRITEQ TD', 'DELETEQ TD',
  'LINK', 'XCTL', 'RETURN',
  'HANDLE CONDITION', 'HANDLE ABEND', 'IGNORE CONDITION',
  'ASSIGN', 'ADDRESS',
  'GETMAIN', 'FREEMAIN',
  'START', 'RETRIEVE',
  'SYNCPOINT', 'ABEND',
]);

function tokenizeCicsContent(content) {
  return content.trim().split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Read a parenthesized option value starting at `tokens[openIdx] === '('`.
 * Returns the inner tokens joined by a single space (parens themselves
 * stripped - see file header) plus the index just past the matching `)`.
 */
function readParenValue(tokens, openIdx) {
  let depth = 0;
  let i = openIdx;
  const inner = [];
  do {
    const t = tokens[i];
    if (t === '(') depth++;
    else if (t === ')') depth--;
    else inner.push(t);
    i++;
  } while (depth > 0 && i < tokens.length);
  return { value: inner.join(' '), nextIndex: i };
}

/**
 * Parse the option-list portion of a CICS command (everything after the
 * verb, and after a compound second word if present) into a plain object.
 * Every `NAME(value)` becomes `options.NAME = value`; every bare `NAME`
 * (not followed by `(`) becomes `options.NAME = true`.
 */
function parseOptions(tokens, startIdx) {
  const options = {};
  let idx = startIdx;
  while (idx < tokens.length) {
    const name = tokens[idx].toUpperCase();
    idx++;
    if (tokens[idx] === '(') {
      const { value, nextIndex } = readParenValue(tokens, idx);
      options[name] = value;
      idx = nextIndex;
    } else {
      options[name] = true;
    }
  }
  return options;
}

/**
 * Classify a single EXEC CICS command's raw content string (the `content`
 * field of a `{type: 'EXEC', execType: 'CICS', content}` node) into
 * `{command, options, respHandling, raw}`.
 *
 * @param {string} content
 * @returns {{command: string, options: Record<string, string|true>, respHandling: {resp: string|null, resp2: string|null}|null, raw: string}}
 */
export function classifyCicsCommand(content) {
  const raw = (content || '').trim();
  if (!raw) {
    return { command: 'UNKNOWN', options: {}, respHandling: null, raw };
  }

  const tokens = tokenizeCicsContent(raw);
  if (tokens.length === 0) {
    return { command: 'UNKNOWN', options: {}, respHandling: null, raw };
  }

  let verb = tokens[0].toUpperCase();
  let idx = 1;

  // Compound verb: HANDLE CONDITION/ABEND, IGNORE CONDITION, READQ/WRITEQ/
  // DELETEQ TS/TD - a *bare* second keyword (not itself an option value).
  if (
    idx < tokens.length &&
    SECOND_WORD_MODIFIERS.has(tokens[idx].toUpperCase()) &&
    tokens[idx + 1] !== '('
  ) {
    verb += ` ${tokens[idx].toUpperCase()}`;
    idx++;
  }

  const options = parseOptions(tokens, idx);

  // SEND/RECEIVE MAP: real CICS syntax has no bare "MAP" keyword - MAP(name)
  // is itself the option that marks this as a BMS screen operation.
  if ((verb === 'SEND' || verb === 'RECEIVE') && options.MAP !== undefined) {
    verb = `${verb} MAP`;
  }

  const command = KNOWN_COMMANDS.has(verb) ? verb : 'UNKNOWN';

  let respHandling = null;
  if (options.RESP !== undefined || options.RESP2 !== undefined) {
    respHandling = {
      resp: options.RESP !== undefined ? options.RESP : null,
      resp2: options.RESP2 !== undefined ? options.RESP2 : null,
    };
  }

  return { command, options, respHandling, raw };
}

/**
 * Recursively walk a statement list (and everything nested inside
 * IF/EVALUATE/inline-PERFORM bodies) invoking `visit` on every statement
 * node - so an `EXEC CICS` block nested inside conditional logic is found
 * just as reliably as one directly in a paragraph's top-level statement list.
 */
function walkStatements(statements, visit) {
  for (const stmt of statements || []) {
    if (!stmt) continue;
    visit(stmt);
    switch (stmt.type) {
      case 'IfStatement':
        walkStatements(stmt.thenStatements, visit);
        walkStatements(stmt.elseStatements, visit);
        break;
      case 'EvaluateStatement':
        for (const when of stmt.whenClauses || []) walkStatements(when.statements, visit);
        walkStatements(stmt.whenOther, visit);
        break;
      case 'PerformStatement':
        walkStatements(stmt.statements, visit);
        break;
      default:
        break;
    }
  }
}

/**
 * Find and classify every EXEC CICS command in a parsed program.
 *
 * @param {object} parsedProgram - the return value of `parser/index.js`'s
 *   `parseCobol(source)` (specifically its flattened `.procedures` list -
 *   every section, every section's paragraphs, and every standalone
 *   paragraph, each with a `.name` and `.statements`).
 * @returns {Array<{paragraph: string|null, command: string, options: object, respHandling: object|null, raw: string}>}
 *   in source order within each paragraph (and paragraphs in the order
 *   `parser/index.js#getProcedures` produces them).
 */
export function parseAllCicsCommands(parsedProgram) {
  const procedures = parsedProgram?.procedures || [];
  const commands = [];

  for (const proc of procedures) {
    walkStatements(proc.statements, (stmt) => {
      if (stmt.type === 'EXEC' && stmt.execType?.toUpperCase() === 'CICS') {
        commands.push({
          paragraph: proc.name || null,
          ...classifyCicsCommand(stmt.content),
        });
      }
    });
  }

  return commands;
}

export default { classifyCicsCommand, parseAllCicsCommands };
