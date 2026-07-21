// Main entry point for cobol-to-scala package
import { tokenize } from './parser/lexer.js';
import { parseDataDivision } from './parser/data-division-parser.js';
import { parseProcedureDivision } from './parser/procedure-parser.js';
import { parseSqlBlock } from './parser/sql-parser.js';
import { expandCopybooks } from './parser/copybook-resolver.js';
import { expandReplaceStatements } from './parser/replace-resolver.js';
import { parseEnvironmentDivision } from './parser/index.js';
import { generateScala, generateMultiProgramScala } from './generator/scala-generator.js';

/**
 * Tokenize+parse a single COBOL program's already-copybook-expanded source
 * text into the `{ dataItems, procedures, sqlBlocks, tokens,
 * environmentDivision }` shape every ast consumer (generateScala et al.)
 * expects. Factored out of parseCobol so convertToScala's round-7 finding 1
 * multi-PROGRAM-ID path (splitProgramSources below) can run this once per
 * program segment without re-running copybook expansion on each slice (COPY
 * REPLACING is expanded once, up front, against the *whole* original
 * source - see convertToScala).
 */
function parseCobolTokens(source, options) {
  const tokens = tokenize(source, options);
  // ENVIRONMENT DIVISION (FILE-CONTROL/SELECT...ASSIGN, and - round-7 finding
  // 5 - SPECIAL-NAMES' DECIMAL-POINT IS COMMA) parsed *before* the DATA
  // DIVISION now, specifically so its decimalPointIsComma flag can be handed
  // to parseDataDivision - a VALUE clause literal like `123,45` needs it to
  // parse as a single comma-decimal value rather than two comma-*separated*
  // ones (see data-division-parser.js's parseValueClause). Previously never
  // called from this entry point at all, so FILE-CONTROL info (the file
  // name -> ASSIGN TO path mapping OPEN/file-path codegen needs) never
  // reached the generator regardless of what the DATA/PROCEDURE DIVISIONs
  // declared (round-5 finding 1a). parser/index.js's parseCobol already
  // called this; convertToScala() below goes through *this* parseCobol, not
  // that one, so it had to be wired in here too.
  const environmentDivision = parseEnvironmentDivision(tokens);
  const dataItems = parseDataDivision(tokens, { decimalPointIsComma: environmentDivision.decimalPointIsComma });
  const procedures = parseProcedureDivision(tokens);
  const sqlBlocks = []; // Extract SQL blocks

  return { dataItems, procedures, sqlBlocks, tokens, environmentDivision };
}

/**
 * Parse COBOL source into data items, procedures and SQL blocks.
 *
 * @param {string} source - COBOL source text
 * @param {object} [options]
 * @param {object} [options.copybooks] - map of copybook name -> source text;
 *   COPY statements are expanded before parsing when provided
 * @param {string} [options.format] - 'fixed' | 'free' (auto-detected otherwise)
 */
export function parseCobol(source, options = {}) {
  // round-40 finding 6: the standalone REPLACE statement (source-text
  // pseudo-text substitution, distinct from COPY ... REPLACING) is expanded
  // unconditionally, before COPY expansion - unlike COPY, it needs no
  // external `options.copybooks` map, and a source with no REPLACE statement
  // at all comes back byte-identical (see expandReplaceStatements's own doc
  // comment), so this is always safe to run.
  let effectiveSource = expandReplaceStatements(source);
  let copybookReport = { expanded: [], missing: [] };

  if (options.copybooks && Object.keys(options.copybooks).length > 0) {
    const result = expandCopybooks(effectiveSource, options.copybooks, options);
    effectiveSource = result.source;
    copybookReport = { expanded: result.expanded, missing: result.missing };
  }

  return {
    ...parseCobolTokens(effectiveSource, options),
    copybooks: copybookReport
  };
}

/**
 * Split a COBOL source containing more than one PROGRAM-ID into one segment
 * per program (round-7 finding 1: contained/sequential multi-program
 * sources - see the u01 repro this was refuted against: a calling program
 * immediately followed by its own callee, both complete
 * IDENTIFICATION/DATA/PROCEDURE DIVISIONs, in one file - a shape cobc itself
 * compiles and runs natively). Returns `null` when the source has 0 or 1
 * PROGRAM-ID declarations - every corpus program that existed before this -
 * so convertToScala falls back to the exact pre-round-7 single-program path
 * with zero behavior change.
 *
 * Splits on trimmed line content (tolerant of a fixed-format sequence-number
 * prefix in columns 1-6, hence the `[\s\d]*` lead) rather than tokenizing up
 * front, specifically so each resulting slice can be handed to the
 * existing, unmodified single-program tokenize/parse pipeline
 * (parseCobolTokens) unchanged - this function only decides *where* to cut,
 * never how to parse.
 */
function splitProgramSources(source) {
  const lines = source.split('\n');
  const idDivisionRe = /^[\s\d]*\b(IDENTIFICATION|ID)\s+DIVISION\b/i;
  const endProgramRe = /^[\s\d]*\bEND\s+PROGRAM\b/i;

  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (idDivisionRe.test(lines[i])) starts.push(i);
  }
  if (starts.length <= 1) return null;

  const segments = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const nextStart = i + 1 < starts.length ? starts[i + 1] : lines.length;
    // Stop at this program's own `END PROGRAM <name>.` line, if present,
    // rather than always running to the next IDENTIFICATION DIVISION - the
    // single-program parser has no notion of that statement at all, and
    // leaving it in the slice risks it being misparsed as a stray paragraph.
    let end = nextStart;
    for (let j = from; j < nextStart; j++) {
      if (endProgramRe.test(lines[j])) { end = j; break; }
    }
    segments.push(lines.slice(from, end).join('\n'));
  }
  return segments;
}

export function convertToScala(source, options = {}) {
  // round-40 finding 6: see parseCobol's identical comment above - REPLACE
  // is expanded unconditionally, ahead of (and independently of) COPY
  // expansion.
  let effectiveSource = expandReplaceStatements(source);
  let copybookReport = { expanded: [], missing: [] };

  if (options.copybooks && Object.keys(options.copybooks).length > 0) {
    const result = expandCopybooks(effectiveSource, options.copybooks, options);
    effectiveSource = result.source;
    copybookReport = { expanded: result.expanded, missing: result.missing };
  }

  const segments = splitProgramSources(effectiveSource);
  if (segments) {
    // round-7 finding 1: multi-PROGRAM-ID source - parse each program
    // independently (each is an ordinary, complete COBOL program on its
    // own) and link them together via generateMultiProgramScala's CALL
    // wiring, instead of the single-ast path below (which has no concept of
    // more than one PROGRAM-ID and would otherwise mash every program's
    // divisions together into one nonsensical ast).
    const programs = segments.map(text => ({
      programId: null, // resolved from each ast's own tokens by generateMultiProgramScala/extractProgramName
      ast: { ...parseCobolTokens(text, options), copybooks: copybookReport }
    }));
    const result = generateMultiProgramScala(programs, options);
    return {
      ast: programs[0].ast,
      scala: result.code,
      filename: result.filename,
      objectName: result.objectName,
      packageName: result.packageName,
      copybooks: copybookReport
    };
  }

  const ast = { ...parseCobolTokens(effectiveSource, options), copybooks: copybookReport };
  const result = generateScala(ast, options);
  return {
    ast,
    scala: result.code,        // The generated Scala code as string
    filename: result.filename,  // Suggested filename
    objectName: result.objectName,
    packageName: result.packageName,
    copybooks: ast.copybooks    // Which copybooks were expanded / missing
  };
}

export {
  tokenize,
  parseDataDivision,
  parseProcedureDivision,
  generateScala,
  generateMultiProgramScala,
  expandCopybooks,
  expandReplaceStatements
};
