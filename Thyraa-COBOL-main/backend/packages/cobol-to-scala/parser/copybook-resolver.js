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

const MAX_DEPTH = 10;

// COPY <name> [OF|IN <library>] [REPLACING <pairs>] .
// The trailing period is mandatory in COBOL and delimits the statement.
const COPY_PATTERN = /\bCOPY\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*(?:(?:OF|IN)\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*)?(REPLACING\s+[\s\S]*?)?\./gi;

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

    return text.replace(COPY_PATTERN, (full, name, library, replacingClause) => {
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
