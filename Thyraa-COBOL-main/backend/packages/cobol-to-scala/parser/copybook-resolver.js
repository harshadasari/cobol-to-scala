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
 */

import { detectFormat } from './lexer.js';

const MAX_DEPTH = 10;

// COPY <name> [OF|IN <library>] [REPLACING <pairs>] .
// The trailing period is mandatory in COBOL and delimits the statement.
const COPY_PATTERN = /\bCOPY\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*(?:(?:OF|IN)\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*)?(REPLACING\s+[\s\S]*?)?\./gi;

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
function findQuotedRanges(text) {
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
function findCommentRanges(text) {
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
function isInsideAnyRange(ranges, index) {
  for (const [start, end] of ranges) {
    if (index >= start && index < end) return true;
  }
  return false;
}

/**
 * Quote-and-comment-aware variant of `text.replace(pattern, replacer)`: a
 * match whose start index falls inside a quoted string literal, OR inside a
 * comment, is left completely untouched (not passed to `replacer` at all) -
 * this is what stops COPY_PATTERN from firing on ordinary literal text that
 * merely reads like a COPY statement (e.g. a data item declared
 * `VALUE "... COPY DONE. ..."`, where that text is just literal content,
 * never a real COPY statement to expand) or on descriptive prose inside a
 * source comment that happens to mention "COPY something." in passing.
 */
function replaceOutsideQuotes(text, pattern, replacer) {
  const excludedRanges = [...findQuotedRanges(text), ...findCommentRanges(text)];
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const re = new RegExp(pattern.source, flags);
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
    result += text.slice(lastIndex, match.index);
    result += replacer(...match, match.index, text);
    lastIndex = match.index + match[0].length;
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
function parseReplacingPairs(replacingClause) {
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
function applyReplacing(text, pairs) {
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

    return replaceOutsideQuotes(text, COPY_PATTERN, (full, name, library, replacingClause) => {
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
