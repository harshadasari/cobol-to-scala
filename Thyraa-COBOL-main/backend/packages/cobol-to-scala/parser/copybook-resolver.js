/**
 * copybook-resolver.js
 * Expands COPY statements into COBOL source before parsing.
 *
 * Real-world COBOL programs keep record layouts in copybooks; a program
 * cannot be analyzed or converted meaningfully without inlining them.
 * This resolver performs the standard preprocessing step:
 *
 *   COPY CUSTOMER.
 *   COPY CUSTOMER OF PAYLIB.
 *   COPY CUSTOMER REPLACING ==:PREFIX:== BY ==CUST==.
 *   COPY CUSTOMER REPLACING OLD-NAME BY NEW-NAME.
 *
 * Copybook content is supplied as a map of name -> source text. Lookup is
 * case-insensitive and tolerant of common file extensions (.cpy, .cob,
 * .copy, .cbl). Expansion is recursive with cycle detection.
 *
 * round-40 finding 6: several of this file's own quote/comment-aware
 * statement-boundary helpers (findQuotedRanges/findCommentRanges/
 * isInsideAnyRange/findStatementEnd) and its pseudo-text pair parser/
 * substitution (parseReplacingPairs/applyReplacing) are exported and reused
 * as-is by parser/replace-resolver.js for the standalone REPLACE statement
 * (`REPLACE ==text==BY==text==.` - source-text pseudo-text substitution NOT
 * tied to a COPY, but using the identical pseudo-text substitution rules) -
 * see that module's own doc comment.
 */

import { detectFormat } from './lexer.js';

const MAX_DEPTH = 10;

// COPY <name> [OF|IN <library>] - matches only the HEADER of a COPY
// statement (the copybook name and an optional OF/IN library qualifier),
// deliberately NOT attempting to capture through to the statement's own
// REPLACING clause/terminating period in this one regex - see
// findStatementEnd's own doc comment (round-22 finding 3) for why a
// REPLACING clause's own BY-text can contain a quoted literal with an
// embedded period, which a single non-greedy `[\s\S]*?\.` capture (this
// pattern's own pre-round-22 shape) can never safely bound.
const COPY_HEADER_PATTERN = /\bCOPY\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*(?:(?:OF|IN)\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*)?/gi;

/**
 * Find every quoted-string-literal span in text, as [start, end) character
 * ranges (end is exclusive, one past the closing quote). Mirrors
 * parser/lexer.js's own `Lexer#scanString` quote handling exactly: either
 * quote character opens a literal, a doubled quote of the SAME kind inside
 * it is an escaped literal quote (stays inside), and an unterminated
 * literal is cut off at end-of-line (same "string continues on next line"
 * bail-out the real tokenizer uses). Reusing this same walk (rather than a
 * regex-lookahead guess) is what lets COPY-statement detection agree with
 * the main tokenizer about what "inside a literal" means.
 */
export function findQuotedRanges(text) {
  const ranges = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      while (i < n) {
        if (text[i] === quote) {
          if (text[i + 1] === quote) {
            i += 2; // doubled quote - escaped, stays inside the literal
            continue;
          }
          i++; // consume closing quote
          break;
        }
        if (text[i] === '\n') {
          // Unterminated on this line - same bail-out scanString uses
          break;
        }
        i++;
      }
      ranges.push([start, i]);
    } else {
      i++;
    }
  }
  return ranges;
}

/**
 * Find every comment span in text, as [start, end) character ranges,
 * mirroring lexer.js's own `detectFormat`/`preprocessFixedFormat`/
 * `preprocessFreeFormat` comment recognition: a fixed-format comment line
 * (indicator column - column 7 - holding `*`, `/`, or `D`/`d` for a debug
 * line) is stripped in its entirety; a free-format inline `*>` comment
 * (honored regardless of detected format, exactly like
 * `preprocessFreeFormat` already does unconditionally) strips from `*>` to
 * end of line. This is what keeps a COPY-statement lookalike that only
 * ever appears in a source comment (e.g. this very file's own header
 * commentary describing this bug) from being mistaken for a real COPY
 * statement, matching cobc's own preprocessor, which never looks at
 * comment text at all.
 */
export function findCommentRanges(text) {
  const ranges = [];
  const format = detectFormat(text);
  let offset = 0;
  for (const line of text.split('\n')) {
    if (format === 'fixed') {
      const indicator = line.length > 6 ? line.charAt(6) : ' ';
      if (indicator === '*' || indicator === '/' || indicator === 'D' || indicator === 'd') {
        ranges.push([offset, offset + line.length]);
        offset += line.length + 1;
        continue;
      }
    }
    const commentIdx = line.indexOf('*>');
    if (commentIdx !== -1) {
      ranges.push([offset + commentIdx, offset + line.length]);
    }
    offset += line.length + 1; // +1 for the '\n' split on
  }
  return ranges;
}

/**
 * True if `index` falls inside one of the ranges built by findQuotedRanges/
 * findCommentRanges (each individually start-ascending by construction, but
 * the merged/concatenated list passed in here may not be, hence the full
 * scan rather than an early break).
 */
export function isInsideAnyRange(ranges, index) {
  for (const [start, end] of ranges) {
    if (index >= start && index < end) return true;
  }
  return false;
}

/**
 * round-22 finding 3: find the index of the true statement-terminating
 * period at or after `from` - the first `.` character whose own index does
 * NOT fall inside any of `excludedRanges` (quoted literals/comments - see
 * findQuotedRanges/findCommentRanges). Returns -1 if none exists (an
 * unterminated COPY statement - left completely untouched by the caller,
 * same as any other malformed input).
 *
 * This is what a REPLACING clause's own termination search needs and the
 * old single-regex `(REPLACING\s+[\s\S]*?)?\.` capture could never provide:
 * a REPLACING pair's own BY-text can itself be a quoted literal containing
 * an embedded, doubled-quote-escaped period (e.g. `BY =="IT""S COPY
 * DONE."==` - the COBOL doubled-quote convention for a literal quote
 * character inside a literal) - a plain non-greedy regex capture stops at
 * the FIRST `.` it finds, full stop, even when that period is itself inside
 * the quoted replacement text, silently truncating the REPLACING clause (and
 * dropping any pairs that come after it) right there. Scanning character by
 * character and skipping any period inside `excludedRanges` - the exact same
 * ranges COPY-statement DETECTION already uses to decide whether a match's
 * own START falls inside a quote (round-21 finding 1) - extends that same
 * quote-awareness to the clause's own END instead of assuming the first
 * literal `.` is always it.
 */
export function findStatementEnd(text, from, excludedRanges) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '.' && !isInsideAnyRange(excludedRanges, i)) return i;
  }
  return -1;
}

/**
 * Quote-and-comment-aware COPY-statement scanner: finds every real COPY
 * statement in `text` (a HEADER match via COPY_HEADER_PATTERN whose own
 * start index does NOT fall inside a quoted string literal or a comment -
 * round-21 finding 1 - immediately followed by that statement's own true,
 * quote-aware terminating period - round-22 finding 3), and calls
 * `replacer(fullStatementText, name, library, replacingClause)` for each one,
 * splicing its return value in place of the whole statement (header through
 * terminating period, inclusive).
 *
 * A header match whose start falls inside a quote/comment is left completely
 * untouched (not passed to `replacer` at all) - this is what stops a
 * lookalike COPY-statement HEADER from firing on ordinary literal text that
 * merely reads like a COPY statement (e.g. a data item declared `VALUE "...
 * COPY DONE. ..."`, where that text is just literal content, never a real
 * COPY statement to expand) or on descriptive prose inside a source comment
 * that happens to mention "COPY something." in passing.
 *
 * A header match with no findable true terminating period (findStatementEnd
 * returns -1 - an unterminated/malformed COPY) is likewise left untouched -
 * there is no safe way to know where such a statement would even end.
 */
function replaceCopyStatements(text, replacer) {
  const excludedRanges = [...findQuotedRanges(text), ...findCommentRanges(text)];
  const re = new RegExp(COPY_HEADER_PATTERN.source, COPY_HEADER_PATTERN.flags);
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (isInsideAnyRange(excludedRanges, match.index)) {
      // Not a real COPY statement - leave this occurrence untouched and
      // keep scanning past it.
      if (match[0].length === 0) re.lastIndex++;
      continue;
    }

    const headerEnd = match.index + match[0].length;
    const periodIdx = findStatementEnd(text, headerEnd, excludedRanges);
    if (periodIdx === -1) {
      // Unterminated COPY statement - can't safely determine its extent;
      // leave it (and everything after it) exactly as-is.
      continue;
    }

    // Everything between the header (name + optional OF/IN library) and the
    // true terminating period is either blank/whitespace (a plain `COPY
    // NAME.`) or a REPLACING clause - never anything else, per COBOL's own
    // COPY statement grammar.
    const tail = text.slice(headerEnd, periodIdx);
    const replacingMatch = /^\s*(REPLACING[\s\S]*)$/i.exec(tail);
    const replacingClause = replacingMatch ? replacingMatch[1] : undefined;
    const fullStatement = text.slice(match.index, periodIdx + 1);

    result += text.slice(lastIndex, match.index);
    result += replacer(fullStatement, match[1], match[2], replacingClause);
    lastIndex = periodIdx + 1;
    re.lastIndex = lastIndex;
  }
  result += text.slice(lastIndex);
  return result;
}

/**
 * Build a case-insensitive, extension-tolerant lookup for copybook content.
 */
function buildLookup(copybooks) {
  const lookup = new Map();
  for (const [rawName, content] of Object.entries(copybooks || {})) {
    const base = rawName.replace(/\.(cpy|cob|cbl|copy|txt)$/i, '');
    lookup.set(rawName.toUpperCase(), content);
    lookup.set(base.toUpperCase(), content);
  }
  return lookup;
}

/**
 * Parse the pairs of a REPLACING clause. Supports pseudo-text delimited
 * operands (==text==) and plain word operands.
 */
export function parseReplacingPairs(replacingClause) {
  if (!replacingClause) return [];

  const body = replacingClause.replace(/^REPLACING\s+/i, '');
  const pairs = [];

  // ==pseudo-text== BY ==pseudo-text==  |  word BY word (mixed forms allowed)
  const pairPattern = /(==([\s\S]*?)==|[A-Za-z0-9:()'"-]+)\s+BY\s+(==([\s\S]*?)==|[A-Za-z0-9:()'"-]+)/gi;
  let match;
  while ((match = pairPattern.exec(body)) !== null) {
    const fromIsPseudo = match[2] !== undefined;
    const toIsPseudo = match[4] !== undefined;
    const from = fromIsPseudo ? match[2] : match[1];
    const to = toIsPseudo ? match[4] : match[3];
    if (from) {
      pairs.push({ from: from.trim(), to: (to || '').trim(), pseudoText: fromIsPseudo });
    }
  }
  return pairs;
}

/**
 * Apply REPLACING pairs to copybook text. Pseudo-text operands (==text==)
 * replace any textual occurrence - this is how prefix substitution like
 * ==:PRE:== BY ==CUST== works on partial words. Plain word operands only
 * replace whole COBOL words.
 */
export function applyReplacing(text, pairs) {
  let result = text;
  for (const { from, to, pseudoText } of pairs) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = pseudoText
      ? new RegExp(escaped, 'g')
      : new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`, 'g');
    result = result.replace(pattern, to);
  }
  return result;
}

/**
 * Strip sequence-number and identification areas from fixed-format copybook
 * lines is intentionally NOT done here: the main lexer already handles
 * fixed-format preprocessing, so copybook text is inlined verbatim.
 */

/**
 * Expand all COPY statements in COBOL source.
 *
 * @param {string} source - COBOL source text
 * @param {object} copybooks - map of copybook name -> copybook source text
 * @param {object} [options]
 * @param {number} [options.maxDepth] - recursion limit (default 10)
 * @returns {{source: string, expanded: string[], missing: string[]}}
 */
export function expandCopybooks(source, copybooks = {}, options = {}) {
  const lookup = buildLookup(copybooks);
  const maxDepth = options.maxDepth || MAX_DEPTH;
  const expanded = [];
  const missing = [];

  function expand(text, depth, stack) {
    if (depth > maxDepth) {
      return text;
    }

    return replaceCopyStatements(text, (full, name, library, replacingClause) => {
      const key = name.toUpperCase();

      if (stack.includes(key)) {
        // Circular COPY - leave a marker instead of recursing forever
        return `      *> CIRCULAR COPY ${name} SKIPPED`;
      }

      const content = lookup.get(key);
      if (content === undefined) {
        if (!missing.includes(name)) missing.push(name);
        return full; // leave the original COPY statement in place
      }

      if (!expanded.includes(name)) expanded.push(name);

      let body = content;
      const pairs = parseReplacingPairs(replacingClause);
      if (pairs.length > 0) {
        body = applyReplacing(body, pairs);
      }

      // Recursively expand nested COPY statements inside the copybook
      const inlined = expand(body, depth + 1, [...stack, key]);

      // Surround with newlines so inlined text keeps its own line/column
      // structure under fixed-format preprocessing
      return `\n${inlined}\n`;
    });
  }

  const result = expand(source, 1, []);
  return { source: result, expanded, missing };
}

export default { expandCopybooks };
