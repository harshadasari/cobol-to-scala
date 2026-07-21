/**
 * replace-resolver.js
 *
 * round-40 finding 6 (pp11): expands a standalone COBOL REPLACE statement -
 * source-text pseudo-text substitution, a compile-time directive distinct
 * from `COPY ... REPLACING` (parser/copybook-resolver.js), not tied to a
 * COPY at all:
 *
 *   REPLACE ==:WIDTH:== BY ==5== ==:INIT:== BY ==99==.
 *   ...
 *   01 WS-NUM PIC 9(:WIDTH:) VALUE :INIT:.
 *   REPLACE OFF.
 *
 * Before this fix, neither the lexer nor the parser had ANY REPLACE-specific
 * handling: `REPLACE` lexed as a bare IDENTIFIER, the `==...==` pseudo-text
 * delimiters and the `:WIDTH:`/`:INIT:` markers inside them lexed as bare
 * identifiers too (the colons dropped as insignificant), and nothing in
 * `parser/index.js`'s `parseIdentificationDivision` (which scans the region
 * between PROGRAM-ID and DATA DIVISION) recognized any of it - the whole
 * REPLACE statement was silently skipped as an unrecognized clause, leaving
 * a bare `PIC 9(WIDTH)` / `VALUE INIT` for the DATA DIVISION parser to choke
 * on silently (falling back to default PIC 9(1)/VALUE 0, with no error
 * surfaced anywhere - confirmed via direct token inspection while
 * investigating pp11).
 *
 * SCOPE DECISION (round-40, per the campaign's own latitude for this
 * finding): this is the NARROW, common-case implementation, not a fully
 * general one. It handles:
 *   - one or more standalone REPLACE statements, each installing a fresh set
 *     of pseudo-text/word substitution pairs (parsed via
 *     copybook-resolver.js's own parseReplacingPairs - the EXACT SAME pair
 *     grammar and pseudo-text-vs-word distinction COPY ... REPLACING
 *     already uses, reused as-is rather than reimplemented);
 *   - REPLACE OFF, which clears the currently-active pairs;
 *   - each REPLACE statement's own pairs apply to every line of source
 *     between IT and the next REPLACE statement (or REPLACE OFF, or end of
 *     source) - substitution applied via copybook-resolver.js's own
 *     applyReplacing, again reused unchanged;
 *   - quote/comment-aware statement-boundary detection (reusing
 *     copybook-resolver.js's findQuotedRanges/findCommentRanges/
 *     isInsideAnyRange/findStatementEnd), so a REPLACE-statement lookalike
 *     inside a string literal or comment is never mistaken for a real one,
 *     and a pseudo-text operand containing an embedded period doesn't
 *     truncate the statement early - exactly the same protections COPY's
 *     own REPLACING clause already has.
 *
 * NOT implemented (out of scope for this round, no corpus program exercises
 * these): partial-word pseudo-text matching across a token boundary beyond
 * what applyReplacing's own word-boundary regex already does, nested/
 * overlapping REPLACE scopes, and REPLACE ... LEADING/TRAILING (a rare
 * COBOL 2014 addition). A source using one of these unsupported shapes
 * degrades to this function's ordinary "no REPLACE statement recognized
 * here" behavior for that specific unsupported piece (the surrounding
 * ordinary pairs/statements are unaffected) rather than crashing.
 *
 * The key correctness bar (matching this finding's own write-up) is that an
 * unrecognized/unsupported REPLACE shape must never SILENTLY corrupt
 * unrelated PIC/VALUE clauses the way the pre-fix parser did - the common,
 * whole-pseudo-text-token substitution case pp11 actually exercises is now
 * fully, correctly implemented end-to-end (verified byte-exact against real
 * cobc/scala-cli - see tests/oracle/README.md's round-40 table).
 */

import {
  findQuotedRanges,
  findCommentRanges,
  isInsideAnyRange,
  findStatementEnd,
  parseReplacingPairs,
  applyReplacing,
} from './copybook-resolver.js';

// `REPLACE` as a standalone keyword - a whole COBOL word, never a substring
// of a longer identifier, and never `REPLACING` (COPY's own clause keyword,
// which always spells the whole word "REPLACING" - this pattern's own
// trailing `\b` boundary already excludes it, since `\b` sits between `E`
// and `I`, not consuming into the "-ING" suffix... actually a JS `\bREPLACE\b`
// would NOT match inside "REPLACING" at all: \b requires a word/non-word
// transition, and "REPLACE" immediately followed by "ING" is still inside
// the same word class (letters), so there's no boundary there - "REPLACING"
// never matches `\bREPLACE\b`).
const REPLACE_HEADER_PATTERN = /\bREPLACE\b/gi;

/**
 * Expand every standalone REPLACE statement in `source`, applying its own
 * pseudo-text/word substitution pairs to all following source text up to the
 * next REPLACE statement (or end of source). Returns the possibly-rewritten
 * source; a source with no REPLACE statement at all comes back completely
 * unchanged (byte-identical), so this is a safe, always-on preprocessing
 * step - unlike COPY expansion, which only runs when the caller supplies a
 * `copybooks` map, REPLACE needs no such option since it never depends on
 * external copybook content.
 */
export function expandReplaceStatements(source) {
  if (!/\bREPLACE\b/i.test(source)) return source;

  const excludedRanges = [...findQuotedRanges(source), ...findCommentRanges(source)];
  const re = new RegExp(REPLACE_HEADER_PATTERN.source, REPLACE_HEADER_PATTERN.flags);

  let result = '';
  let lastIndex = 0;
  let activePairs = [];
  let match;

  while ((match = re.exec(source)) !== null) {
    if (isInsideAnyRange(excludedRanges, match.index)) {
      if (match[0].length === 0) re.lastIndex++;
      continue;
    }

    const headerEnd = match.index + match[0].length;
    const periodIdx = findStatementEnd(source, headerEnd, excludedRanges);
    if (periodIdx === -1) {
      // Unterminated REPLACE - can't safely determine its extent; leave it
      // (and everything after it) exactly as-is, same as an unterminated
      // COPY statement in copybook-resolver.js.
      continue;
    }

    const body = source.slice(headerEnd, periodIdx).trim();

    // Apply whatever pairs were active BEFORE this REPLACE statement to the
    // stretch of source between the previous REPLACE (or start of source)
    // and this one.
    const between = source.slice(lastIndex, match.index);
    result += activePairs.length > 0 ? applyReplacing(between, activePairs) : between;
    // The REPLACE statement itself is a compile-time directive, not COBOL
    // program text - drop it from the output entirely (a single blank line
    // in its place, mirroring copybook-resolver.js's own COPY-statement
    // removal convention, so line numbers in the rest of the source shift
    // as little as possible).
    result += '\n';

    activePairs = /^OFF$/i.test(body) ? [] : parseReplacingPairs(`REPLACING ${body}`);

    lastIndex = periodIdx + 1;
    re.lastIndex = lastIndex;
  }

  const tail = source.slice(lastIndex);
  result += activePairs.length > 0 ? applyReplacing(tail, activePairs) : tail;
  return result;
}

export default { expandReplaceStatements };
