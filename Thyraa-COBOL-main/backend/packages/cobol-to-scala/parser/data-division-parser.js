/**
 * COBOL Data Division Parser
 * Parses WORKING-STORAGE, FILE, LINKAGE, and LOCAL-STORAGE sections
 */

import { TokenType } from './tokens.js';
import {
  DataItem,
  PicClause,
  OccursClause,
  Level88,
  FileDescription,
  WorkingStorageSection,
  LinkageSection,
  FileSection,
  LocalStorageSection,
  VariableReference,
  Literal,
} from './ast.js';

/**
 * Parser context for tracking state
 */
class ParserContext {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
    this.errors = [];
    // round-7 finding 5: SPECIAL-NAMES' `DECIMAL-POINT IS COMMA` (parsed by
    // parser/index.js's parseEnvironmentDivision) - set once, right after
    // construction, by parseDataDivision's caller; every nested parse
    // function below shares this same `ctx` instance, so this is visible
    // everywhere a comma-decimal VALUE literal needs recognizing
    // (parseValueClause) without threading an options parameter through
    // every single parse function's signature.
    this.decimalPointIsComma = false;
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
    return this.current().value.toUpperCase() === value.toUpperCase();
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

  expect(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    throw new Error(`${message} at line ${this.current()?.line || 'unknown'}`);
  }

  skipTo(...types) {
    while (!this.isAtEnd() && !types.includes(this.current().type)) {
      this.advance();
    }
  }

  skipPeriod() {
    if (this.check(TokenType.PERIOD)) {
      this.advance();
    }
  }
}

/**
 * Parse a PIC clause pattern
 */
function parsePicPattern(pattern) {
  const pic = new PicClause({ pattern });

  // Normalize pattern - expand repetitions
  let expanded = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i].toUpperCase();

    if (i + 1 < pattern.length && pattern[i + 1] === '(') {
      // Find closing paren and get count
      const start = i + 2;
      let end = start;
      while (end < pattern.length && pattern[end] !== ')') {
        end++;
      }
      const count = parseInt(pattern.substring(start, end), 10) || 1;
      expanded += char.repeat(count);
      i = end + 1;
    } else {
      expanded += char;
      i++;
    }
  }

  // CR and DB are two-character trailing sign symbols occupying two
  // storage positions; extract them before the per-character scan so the
  // letters C/R/D/B are not misread.
  let trailingSignPositions = 0;
  if (expanded.endsWith('CR') || expanded.endsWith('DB')) {
    trailingSignPositions = 2;
    expanded = expanded.slice(0, -2);
  }

  // Analyze expanded pattern
  let hasSign = false;
  let hasDecimal = false;
  let intDigits = 0;
  let decDigits = 0;
  let alphaCount = 0;  // A positions (alphabetic)
  let xCount = 0;      // X positions (alphanumeric)
  let digitCount = 0;
  let editChars = 0;
  let inDecimalPart = false;

  for (const char of expanded) {
    switch (char) {
      case 'S':
        hasSign = true;
        break;
      case 'V':
        hasDecimal = true;
        inDecimalPart = true;
        break;
      case '9':
        digitCount++;
        if (inDecimalPart) {
          decDigits++;
        } else {
          intDigits++;
        }
        break;
      case 'X':
        xCount++;
        break;
      case 'A':
        alphaCount++;
        break;
      case 'Z':
      case '*':
        // Zero-suppression positions hold a digit or a space
        editChars++;
        digitCount++;
        if (inDecimalPart) {
          decDigits++;
        } else {
          intDigits++;
        }
        break;
      case '+':
      case '-':
      case '$':
      case ',':
      case 'B':
      case '0':
      case '/':
        // Insertion characters occupy one storage position each
        editChars++;
        break;
      case '.':
        editChars++;
        if (!inDecimalPart) {
          inDecimalPart = true;
        }
        break;
      case 'P':
        // Scaling position - affects the decimal point but occupies no storage
        if (inDecimalPart) {
          decDigits++;
        } else {
          decDigits--;
        }
        break;
    }
  }

  editChars += trailingSignPositions;

  // Determine data type and storage length in character positions.
  // S, V and P never occupy storage (sign/decimal are implied unless
  // SIGN SEPARATE is specified, which is handled at the usage level).
  // A = alphabetic-only, X = alphanumeric.
  if (alphaCount > 0 && xCount === 0 && digitCount === 0) {
    pic.dataType = 'alphabetic';
    pic.length = alphaCount;
  } else if (xCount > 0 || alphaCount > 0) {
    pic.dataType = 'alphanumeric';
    pic.length = xCount + alphaCount + digitCount + editChars;
  } else if (editChars > 0) {
    pic.dataType = 'edited';
    pic.length = digitCount + editChars;
    pic.editPattern = expanded + (trailingSignPositions ? pattern.toUpperCase().slice(-2) : '');
  } else {
    pic.dataType = 'numeric';
    pic.length = digitCount;
  }

  pic.integerDigits = intDigits;
  pic.decimalDigits = decDigits;
  pic.signed = hasSign;
  pic.impliedDecimal = hasDecimal;

  return pic;
}

/**
 * Parse PIC clause from tokens
 */
function parsePicClause(ctx) {
  // Skip PIC or PICTURE keyword
  if (ctx.match(TokenType.PIC, TokenType.PICTURE)) {
    // Skip optional IS
    ctx.matchValue('IS');
  }

  // Preferred path: the lexer captured the whole picture character-string
  // as a single PICTURE_STRING token (see Lexer.scanPictureString).
  if (ctx.check(TokenType.PICTURE_STRING)) {
    return parsePicPattern(ctx.advance().value);
  }

  // Legacy fallback: reassemble the pattern from individual tokens
  // (only reachable for token streams not produced by our lexer).
  let pattern = '';
  const picTokens = [
    TokenType.IDENTIFIER,
    TokenType.NUMERIC_LITERAL,
    TokenType.OP_LPAREN,
    TokenType.OP_RPAREN,
    TokenType.OP_PLUS,
    TokenType.OP_MINUS,
    TokenType.COMMA,
  ];

  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for end of PIC clause
    if (current.type === TokenType.PERIOD) break;
    if (current.type === TokenType.USAGE) break;
    if (current.type === TokenType.COMP) break;
    if (current.type === TokenType.OCCURS) break;
    if (current.type === TokenType.REDEFINES) break;
    if (current.type === TokenType.VALUE) break;
    if (current.type === TokenType.LEVEL_NUMBER) break;
    if (current.type === TokenType.NUMERIC_LITERAL && /^\d{1,2}$/.test(current.value)) {
      // Check if this looks like a level number
      const num = parseInt(current.value, 10);
      if ((num >= 1 && num <= 49) || num === 66 || num === 77 || num === 88) {
        break;
      }
    }

    // Common keywords that end a PIC clause
    const endKeywords = [
      'BLANK', 'JUSTIFIED', 'JUST', 'SYNC', 'SYNCHRONIZED',
      'SIGN', 'EXTERNAL', 'GLOBAL',
    ];
    if (endKeywords.includes(current.value?.toUpperCase())) break;

    // Build pattern
    if (current.type === TokenType.OP_LPAREN) {
      pattern += '(';
      ctx.advance();
    } else if (current.type === TokenType.OP_RPAREN) {
      pattern += ')';
      ctx.advance();
    } else if (picTokens.includes(current.type) || current.type === TokenType.STRING_LITERAL) {
      pattern += current.value;
      ctx.advance();
    } else {
      break;
    }
  }

  return parsePicPattern(pattern);
}

/**
 * round-16 finding 6: GnuCOBOL's native fixed-width binary USAGEs
 * (BINARY-CHAR/BINARY-SHORT/BINARY-LONG/BINARY-DOUBLE) are the one USAGE
 * family that is legally declared with NO PIC clause at all - the usage
 * name itself fully determines the item's storage width and implied
 * numeric picture (unlike COMP/COMP-4/COMP-5/BINARY, which only ever modify
 * an explicit PIC). `parseUsageClause`'s pre-fix `usageMap` didn't recognize
 * any of these hyphenated names at all (lexed as a single identifier token,
 * same as COMP-3 - see lexer.js's scanIdentifier), so `USAGE BINARY-LONG`
 * fell through `usageMap[upperValue]` undefined, returned the fallback
 * `'DISPLAY'` WITHOUT consuming the `BINARY-LONG` token, and the main
 * data-item clause loop's own "skip unknown tokens" fallback silently
 * discarded it - the item ended up USAGE DISPLAY with no PIC at all,
 * treated as a string (ADD behaved like concatenation: "30"+"1"="301").
 * Exported so `parseDataItemClauses` below can synthesize the implicit PIC
 * these usages imply once the whole clause loop has finished (a PIC clause
 * appearing before OR after USAGE in the source is equally legal COBOL, so
 * the synthesis has to happen after the full loop, not inline here).
 */
export const IMPLICIT_BINARY_PIC_DIGITS = {
  'BINARY-CHAR': 3,
  'BINARY-SHORT': 5,
  'BINARY-LONG': 10,
  'BINARY-DOUBLE': 20,
};

/**
 * Parse USAGE clause
 */
function parseUsageClause(ctx) {
  // Skip USAGE keyword if present
  ctx.matchValue('USAGE');
  ctx.matchValue('IS');

  const current = ctx.current();
  if (!current) return 'DISPLAY';

  const usageMap = {
    'COMP': 'COMP',
    'COMP-1': 'COMP-1',
    'COMP-2': 'COMP-2',
    'COMP-3': 'COMP-3',
    'COMP-4': 'COMP-4',
    'COMP-5': 'COMP-5',
    'COMPUTATIONAL': 'COMP',
    'COMPUTATIONAL-1': 'COMP-1',
    'COMPUTATIONAL-2': 'COMP-2',
    'COMPUTATIONAL-3': 'COMP-3',
    'COMPUTATIONAL-4': 'COMP-4',
    'COMPUTATIONAL-5': 'COMP-5',
    'BINARY': 'BINARY',
    'BINARY-CHAR': 'BINARY-CHAR',
    'BINARY-SHORT': 'BINARY-SHORT',
    'BINARY-LONG': 'BINARY-LONG',
    'BINARY-DOUBLE': 'BINARY-DOUBLE',
    'PACKED-DECIMAL': 'COMP-3',
    'INDEX': 'INDEX',
    'DISPLAY': 'DISPLAY',
    'POINTER': 'POINTER',
  };

  const upperValue = current.value.toUpperCase();
  if (usageMap[upperValue]) {
    ctx.advance();
    return usageMap[upperValue];
  }

  return 'DISPLAY';
}

/**
 * Parse OCCURS clause
 */
function parseOccursClause(ctx) {
  // Skip OCCURS keyword
  ctx.matchValue('OCCURS');

  const occurs = new OccursClause();

  // Get the count
  if (ctx.check(TokenType.NUMERIC_LITERAL)) {
    occurs.times = parseInt(ctx.advance().value, 10);
  }

  // Check for TO (variable length)
  if (ctx.matchValue('TO')) {
    occurs.minTimes = occurs.times;
    if (ctx.check(TokenType.NUMERIC_LITERAL)) {
      occurs.maxTimes = parseInt(ctx.advance().value, 10);
      occurs.times = occurs.maxTimes;
    }
  }

  // Skip TIMES if present
  ctx.matchValue('TIMES');

  // Parse DEPENDING ON
  if (ctx.matchValue('DEPENDING')) {
    ctx.matchValue('ON');
    if (ctx.check(TokenType.IDENTIFIER)) {
      occurs.dependingOn = ctx.advance().value;
    }
  }

  // Parse ASCENDING/DESCENDING KEY
  while (ctx.matchValue('ASCENDING', 'DESCENDING')) {
    const isAscending = ctx.tokens[ctx.position - 1].value.toUpperCase() === 'ASCENDING';
    ctx.matchValue('KEY');
    ctx.matchValue('IS');

    const keys = [];
    while (ctx.check(TokenType.IDENTIFIER)) {
      keys.push(ctx.advance().value);
    }

    if (isAscending) {
      occurs.ascending = occurs.ascending.concat(keys);
    } else {
      occurs.descending = occurs.descending.concat(keys);
    }
  }

  // Parse INDEXED BY
  if (ctx.matchValue('INDEXED')) {
    ctx.matchValue('BY');
    while (ctx.check(TokenType.IDENTIFIER)) {
      occurs.indexedBy.push(ctx.advance().value);
    }
  }

  return occurs;
}

/**
 * Parse VALUE clause
 */
function parseValueClause(ctx) {
  // Skip VALUE keyword
  ctx.matchValue('VALUE', 'VALUES');
  ctx.matchValue('IS', 'ARE');

  const values = [];

  // round-7 finding 5: under SPECIAL-NAMES' `DECIMAL-POINT IS COMMA`, a VALUE
  // literal like `123,45` uses a comma - not a period - as its own decimal
  // point (the lexer has no SPECIAL-NAMES context at tokenize time, so it
  // always tokenizes this as NUMERIC_LITERAL "123", COMMA, NUMERIC_LITERAL
  // "45", identically to how two ordinary comma-*separated* VALUEs would
  // tokenize - see u03/u03b's own repro). Immediately adjacent
  // NUMERIC_LITERAL-COMMA-NUMERIC_LITERAL is otherwise meaningless as a
  // multi-value VALUE clause for a non-88-level elementary item (that shape
  // only makes sense for a level-88's own VALUES list, parsed separately by
  // parseLevel88, not here), so this narrow, mode-gated combination is safe.
  const readNumericLiteral = () => {
    const first = ctx.advance().value;
    if (
      ctx.decimalPointIsComma &&
      ctx.check(TokenType.COMMA) &&
      ctx.peek(1)?.type === TokenType.NUMERIC_LITERAL
    ) {
      ctx.advance(); // comma (the decimal point, in this mode)
      const frac = ctx.advance().value;
      return `${first}.${frac}`;
    }
    return first;
  };

  do {
    let value = null;

    // Check for figurative constants
    if (ctx.matchValue('ZERO', 'ZEROS', 'ZEROES')) {
      value = { type: 'figurative', value: 'ZERO' };
    } else if (ctx.matchValue('SPACE', 'SPACES')) {
      value = { type: 'figurative', value: 'SPACE' };
    } else if (ctx.matchValue('HIGH-VALUE', 'HIGH-VALUES')) {
      value = { type: 'figurative', value: 'HIGH-VALUE' };
    } else if (ctx.matchValue('LOW-VALUE', 'LOW-VALUES')) {
      value = { type: 'figurative', value: 'LOW-VALUE' };
    } else if (ctx.matchValue('QUOTE', 'QUOTES')) {
      value = { type: 'figurative', value: 'QUOTE' };
    } else if (ctx.matchValue('NULL', 'NULLS')) {
      value = { type: 'figurative', value: 'NULL' };
    } else if (ctx.matchValue('ALL')) {
      // ALL followed by a literal
      if (ctx.check(TokenType.STRING_LITERAL)) {
        value = { type: 'all', value: ctx.advance().value };
      }
    } else if (ctx.check(TokenType.STRING_LITERAL)) {
      value = { type: 'string', value: ctx.advance().value };
    } else if (ctx.check(TokenType.NUMERIC_LITERAL)) {
      value = { type: 'numeric', value: readNumericLiteral() };
    } else if (ctx.check(TokenType.OP_PLUS) || ctx.check(TokenType.OP_MINUS)) {
      const sign = ctx.advance().value;
      if (ctx.check(TokenType.NUMERIC_LITERAL)) {
        value = { type: 'numeric', value: sign + readNumericLiteral() };
      }
    }

    if (value) {
      values.push(value);
    }

    // Check for THRU/THROUGH for level 88
    if (ctx.matchValue('THRU', 'THROUGH')) {
      // Parse through value
      if (ctx.check(TokenType.STRING_LITERAL) || ctx.check(TokenType.NUMERIC_LITERAL)) {
        const throughValue = ctx.advance().value;
        if (values.length > 0) {
          values[values.length - 1].through = throughValue;
        }
      }
    }

  } while (ctx.match(TokenType.COMMA) || ctx.checkValue('THRU') || ctx.checkValue('THROUGH'));

  return values.length === 1 ? values[0] : values;
}

/**
 * Parse a single data item (one level number entry)
 */
function parseDataItem(ctx) {
  const startToken = ctx.current();

  // Get level number
  let level = 0;
  if (ctx.check(TokenType.LEVEL_NUMBER)) {
    level = parseInt(ctx.advance().value, 10);
  } else if (ctx.check(TokenType.NUMERIC_LITERAL)) {
    const num = parseInt(ctx.current().value, 10);
    if ((num >= 1 && num <= 49) || num === 66 || num === 77 || num === 88) {
      level = num;
      ctx.advance();
    }
  }

  if (level === 0) {
    return null;
  }

  const item = new DataItem({
    level,
    location: { line: startToken.line, column: startToken.column },
  });

  // Get name or FILLER
  if (ctx.matchValue('FILLER')) {
    item.name = 'FILLER';
    item.isFiller = true;
  } else if (ctx.check(TokenType.IDENTIFIER)) {
    item.name = ctx.advance().value;
  } else {
    // Anonymous filler
    item.name = 'FILLER';
    item.isFiller = true;
  }

  // Parse clauses until period or next level number
  while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
    const current = ctx.current();

    // Check for next level number
    if (ctx.check(TokenType.LEVEL_NUMBER)) break;
    if (ctx.check(TokenType.NUMERIC_LITERAL)) {
      const num = parseInt(current.value, 10);
      if ((num >= 1 && num <= 49) || num === 66 || num === 77 || num === 88) {
        break;
      }
    }

    // REDEFINES clause
    if (ctx.matchValue('REDEFINES')) {
      if (ctx.check(TokenType.IDENTIFIER)) {
        item.redefines = ctx.advance().value;
      }
      continue;
    }

    // RENAMES clause (level 66)
    if (ctx.matchValue('RENAMES')) {
      if (ctx.check(TokenType.IDENTIFIER)) {
        item.renames = ctx.advance().value;
      }
      if (ctx.matchValue('THRU', 'THROUGH')) {
        if (ctx.check(TokenType.IDENTIFIER)) {
          item.renamesThrough = ctx.advance().value;
        }
      }
      continue;
    }

    // PIC/PICTURE clause
    if (ctx.checkValue('PIC') || ctx.checkValue('PICTURE')) {
      item.pic = parsePicClause(ctx);
      continue;
    }

    // USAGE clause (COMP/COMPUTATIONAL carry optional -1..-5 suffixes,
    // e.g. COMP-3, which are lexed as single hyphenated tokens). round-16
    // finding 6: BINARY-CHAR/BINARY-SHORT/BINARY-LONG/BINARY-DOUBLE are
    // likewise lexed as one hyphenated identifier token and are legal
    // WITHOUT a preceding "USAGE"/"USAGE IS" keyword, same as bare BINARY -
    // recognized directly here (not just via parseUsageClause's own
    // usageMap, which only fires once this dispatch condition is already
    // true).
    if (ctx.checkValue('USAGE') ||
        /^(COMP|COMPUTATIONAL)(-[1-5])?$/i.test(current.value || '') ||
        /^BINARY-(CHAR|SHORT|LONG|DOUBLE)$/i.test(current.value || '') ||
        ctx.checkValue('BINARY') || ctx.checkValue('PACKED-DECIMAL') ||
        ctx.checkValue('INDEX') || ctx.checkValue('DISPLAY') || ctx.checkValue('POINTER')) {
      item.usage = parseUsageClause(ctx);
      continue;
    }

    // SIGNED/UNSIGNED - only meaningful following one of the fixed-width
    // native binary USAGEs above (`BINARY-LONG UNSIGNED`), but harmless to
    // recognize unconditionally (no other clause uses these keywords).
    // Defaults to signed when omitted (GnuCOBOL's own default for these
    // USAGEs) - see the implicit-PIC synthesis below.
    if (ctx.matchValue('SIGNED')) {
      item.usageSigned = true;
      continue;
    }
    if (ctx.matchValue('UNSIGNED')) {
      item.usageSigned = false;
      continue;
    }

    // OCCURS clause
    if (ctx.checkValue('OCCURS')) {
      item.occurs = parseOccursClause(ctx);
      continue;
    }

    // VALUE clause
    if (ctx.checkValue('VALUE') || ctx.checkValue('VALUES')) {
      item.value = parseValueClause(ctx);
      continue;
    }

    // BLANK WHEN ZERO
    if (ctx.matchValue('BLANK')) {
      ctx.matchValue('WHEN');
      ctx.matchValue('ZERO', 'ZEROS', 'ZEROES');
      item.blankWhenZero = true;
      continue;
    }

    // JUSTIFIED/JUST
    if (ctx.matchValue('JUSTIFIED', 'JUST')) {
      item.justified = ctx.matchValue('RIGHT') ? 'RIGHT' : 'LEFT';
      continue;
    }

    // SYNCHRONIZED/SYNC
    if (ctx.matchValue('SYNCHRONIZED', 'SYNC')) {
      item.sync = true;
      ctx.matchValue('LEFT', 'RIGHT');
      continue;
    }

    // SIGN clause
    if (ctx.matchValue('SIGN')) {
      ctx.matchValue('IS');
      const leading = ctx.matchValue('LEADING');
      const trailing = ctx.matchValue('TRAILING');
      let separate = false;
      if (ctx.matchValue('SEPARATE')) {
        ctx.matchValue('CHARACTER');
        separate = true;
      }
      item.sign = {
        leading: leading || !trailing,
        separate,
      };
      continue;
    }

    // EXTERNAL
    if (ctx.matchValue('EXTERNAL')) {
      item.isExternal = true;
      continue;
    }

    // GLOBAL
    if (ctx.matchValue('GLOBAL')) {
      item.isGlobal = true;
      continue;
    }

    // Skip unknown tokens
    ctx.advance();
  }

  // round-16 finding 6: a bare fixed-width native binary USAGE
  // (BINARY-CHAR/BINARY-SHORT/BINARY-LONG/BINARY-DOUBLE) with no explicit
  // PIC clause implies its own numeric picture - it's the one USAGE family
  // legally declared without one at all. Applied only when no PIC clause
  // was actually parsed above (an explicit `PIC S9(n) BINARY-LONG` - legal,
  // if unusual - keeps its own declared picture untouched). Digit widths are
  // the number of decimal digits needed to display the USAGE's full
  // storage-width magnitude (oracle-verified for BINARY-LONG via e14: a
  // 4-byte field DISPLAYs as `+0000000030`, 10 digits, not the 9 a plain
  // "5-9 digits -> 4 bytes" COMP tiering would suggest - these fixed-width
  // USAGEs pick their own byte width directly from the USAGE name, not from
  // any digit count, so elementaryByteLength (layout.js) special-cases them
  // the same way, independent of this synthesized digit count). Signed
  // unless an explicit UNSIGNED clause was seen (item.usageSigned === false)
  // - GnuCOBOL's own default for every one of these USAGEs.
  if (!item.pic && IMPLICIT_BINARY_PIC_DIGITS[item.usage]) {
    const digits = IMPLICIT_BINARY_PIC_DIGITS[item.usage];
    const signed = item.usageSigned !== false;
    item.pic = new PicClause({
      pattern: `${signed ? 'S' : ''}9(${digits})`,
      dataType: 'numeric',
      length: digits,
      integerDigits: digits,
      decimalDigits: 0,
      signed,
    });
  }

  // Skip period if present
  ctx.skipPeriod();

  return item;
}

/**
 * Parse level 88 condition
 */
function parseLevel88(ctx, parentItem) {
  const startToken = ctx.current();

  // Skip level number
  ctx.advance();

  const condition = new Level88({
    location: { line: startToken.line, column: startToken.column },
  });

  // Get condition name
  if (ctx.check(TokenType.IDENTIFIER)) {
    condition.name = ctx.advance().value;
  }

  // Parse VALUES clause
  if (ctx.matchValue('VALUE', 'VALUES')) {
    ctx.matchValue('IS', 'ARE');

    const values = [];
    do {
      let value = null;

      if (ctx.check(TokenType.STRING_LITERAL)) {
        value = { type: 'string', value: ctx.advance().value };
      } else if (ctx.check(TokenType.NUMERIC_LITERAL)) {
        value = { type: 'numeric', value: ctx.advance().value };
      } else if (ctx.matchValue('ZERO', 'ZEROS', 'ZEROES')) {
        value = { type: 'figurative', value: 'ZERO' };
      } else if (ctx.matchValue('SPACE', 'SPACES')) {
        value = { type: 'figurative', value: 'SPACE' };
      }

      // round-12 finding 1: the pre-fix loop condition below continued
      // unconditionally on any non-PERIOD/non-EOF token, even when NONE of
      // the branches above recognized the current token at all (e.g. the
      // WHEN of a trailing `WHEN SET TO FALSE IS ...` clause, which this
      // do-while's own body has no branch for) - since nothing in that case
      // ever advances ctx, the loop spun forever without ever reading
      // another token. A value-less iteration means there is nothing more
      // for *this* VALUE clause to consume; stop and let the WHEN SET TO
      // FALSE / bare FALSE IS handling below (or the caller) take over.
      if (!value) break;

      // Check for THRU/THROUGH
      if (ctx.matchValue('THRU', 'THROUGH')) {
        if (ctx.check(TokenType.STRING_LITERAL) || ctx.check(TokenType.NUMERIC_LITERAL)) {
          value.through = ctx.advance().value;
        }
      }
      values.push(value);
    } while (ctx.match(TokenType.COMMA) || (!ctx.check(TokenType.PERIOD) && !ctx.isAtEnd()));

    condition.values = values;
  }

  // Check for the COBOL-2002+ "WHEN SET TO FALSE IS literal-3" clause (the
  // standard grammar for an 88-level's false value), tolerating a bare
  // "FALSE IS literal-3" too (pre-existing behavior, kept for leniency).
  const parseFalseValueLiteral = () => {
    // Normalized to the exact same `{ type, value }` shape `condition.values`
    // entries use (see the VALUE-clause loop above), so generator/
    // expression-gen.js's level88ValueLiteral can format either one
    // identically - see level88FalseValueAssignment.
    if (ctx.check(TokenType.STRING_LITERAL)) {
      condition.falseValue = { type: 'string', value: ctx.advance().value };
    } else if (ctx.check(TokenType.NUMERIC_LITERAL)) {
      condition.falseValue = { type: 'numeric', value: ctx.advance().value };
    } else if (ctx.matchValue('ZERO', 'ZEROS', 'ZEROES')) {
      condition.falseValue = { type: 'figurative', value: 'ZERO' };
    } else if (ctx.matchValue('SPACE', 'SPACES')) {
      condition.falseValue = { type: 'figurative', value: 'SPACE' };
    }
  };

  if (ctx.matchValue('WHEN')) {
    ctx.matchValue('SET');
    ctx.matchValue('TO');
    if (ctx.matchValue('FALSE')) {
      ctx.matchValue('IS');
      parseFalseValueLiteral();
    }
  } else if (ctx.matchValue('FALSE')) {
    ctx.matchValue('IS');
    parseFalseValueLiteral();
  }

  ctx.skipPeriod();

  return condition;
}

/**
 * Build hierarchical structure from flat level numbers
 */
function buildHierarchy(items) {
  const roots = [];
  const stack = [];

  for (const item of items) {
    // Skip level 88 items - they should already be attached to their parent
    if (item.level === 88) continue;

    // Level 66 and 77 are always at root level
    if (item.level === 66 || item.level === 77) {
      roots.push(item);
      continue;
    }

    // Pop stack until we find a parent with lower level number
    while (stack.length > 0) {
      const parent = stack[stack.length - 1];
      if (parent.level < item.level) {
        break;
      }
      stack.pop();
    }

    if (stack.length === 0) {
      // This is a root item (usually level 01)
      roots.push(item);
    } else {
      // Add as child of current parent
      const parent = stack[stack.length - 1];
      parent.children.push(item);
    }

    // Push this item onto the stack (it could be a parent)
    stack.push(item);
  }

  return roots;
}

/**
 * Parse WORKING-STORAGE SECTION
 */
export function parseWorkingStorageSection(ctx) {
  const items = [];
  let currentItem = null;

  // Skip section header
  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for end of section
    if (current.type === TokenType.LINKAGE ||
        current.type === TokenType.FILE_SECTION ||
        current.type === TokenType.LOCAL_STORAGE ||
        current.type === TokenType.PROCEDURE ||
        (current.type === TokenType.IDENTIFIER && current.value.toUpperCase() === 'SCREEN') ||
        (current.type === TokenType.IDENTIFIER && current.value.toUpperCase() === 'REPORT')) {
      break;
    }

    // Skip SECTION keyword and period
    if (current.type === TokenType.SECTION || current.type === TokenType.PERIOD) {
      ctx.advance();
      continue;
    }

    // Check for level 88
    if (ctx.check(TokenType.NUMERIC_LITERAL) && ctx.current().value === '88') {
      // Parser-loop audit (round-12, prompted by finding 1's infinite-loop
      // class): parseLevel88 must run unconditionally here, even when
      // `currentItem` is null (a stray/leading 88-level with no preceding
      // elementary item to attach to - malformed COBOL, but this parser must
      // never hang on it) - parseLevel88 itself never dereferences
      // `parentItem` (only the *caller* decides where to attach the
      // resulting condition), so it's always safe to call purely to consume
      // the level-88 entry's own tokens. Skipping the call entirely (the
      // pre-fix behavior) left `continue` looping back to this exact same
      // unconsumed '88' token forever - the identical no-progress shape
      // finding 1 hung on, just gated behind a different (malformed-input)
      // precondition instead of always-reachable valid syntax.
      const condition = parseLevel88(ctx, currentItem);
      if (currentItem) {
        currentItem.conditions.push(condition);
      }
      continue;
    }

    // Skip EXEC SQL blocks in WORKING-STORAGE (like EXEC SQL INCLUDE SQLCA)
    if (ctx.checkValue('EXEC')) {
      while (!ctx.isAtEnd() && !ctx.checkValue('END-EXEC')) {
        ctx.advance();
      }
      ctx.matchValue('END-EXEC');
      ctx.skipPeriod();
      continue;
    }

    // Parse data item
    const item = parseDataItem(ctx);
    if (item) {
      currentItem = item;
      items.push(item);
    } else {
      // Skip unknown token to prevent infinite loop
      ctx.advance();
    }
  }

  const hierarchy = buildHierarchy(items);
  return new WorkingStorageSection({ items: hierarchy });
}

/**
 * Parse FILE SECTION
 */
export function parseFileSection(ctx) {
  const files = [];

  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for end of section
    if (current.type === TokenType.WORKING_STORAGE ||
        current.type === TokenType.LINKAGE ||
        current.type === TokenType.LOCAL_STORAGE ||
        current.type === TokenType.PROCEDURE) {
      break;
    }

    // Skip SECTION keyword and period
    if (current.type === TokenType.SECTION || current.type === TokenType.PERIOD) {
      ctx.advance();
      continue;
    }

    // Parse FD or SD
    if (current.type === TokenType.FD || current.type === TokenType.SD) {
      const fileDesc = parseFileDescription(ctx);
      if (fileDesc) {
        files.push(fileDesc);
      }
      continue;
    }

    ctx.advance();
  }

  return new FileSection({ files });
}

/**
 * Parse FD/SD entry
 */
function parseFileDescription(ctx) {
  const type = ctx.current().value.toUpperCase();
  ctx.advance();

  const fd = new FileDescription({ type });

  // Get file name
  if (ctx.check(TokenType.IDENTIFIER)) {
    fd.name = ctx.advance().value;
  }

  // Parse FD clauses until period
  while (!ctx.isAtEnd() && !ctx.check(TokenType.PERIOD)) {
    if (ctx.matchValue('BLOCK')) {
      ctx.matchValue('CONTAINS');
      if (ctx.check(TokenType.NUMERIC_LITERAL)) {
        fd.blockContains = parseInt(ctx.advance().value, 10);
      }
      ctx.matchValue('TO');
      if (ctx.check(TokenType.NUMERIC_LITERAL)) {
        ctx.advance(); // max block size
      }
      ctx.matchValue('RECORDS', 'CHARACTERS');
      continue;
    }

    if (ctx.matchValue('RECORD')) {
      ctx.matchValue('CONTAINS');
      if (ctx.check(TokenType.NUMERIC_LITERAL)) {
        fd.recordContains = parseInt(ctx.advance().value, 10);
      }
      ctx.matchValue('TO');
      if (ctx.check(TokenType.NUMERIC_LITERAL)) {
        ctx.advance(); // max record size
      }
      ctx.matchValue('CHARACTERS');
      continue;
    }

    if (ctx.matchValue('LABEL')) {
      ctx.matchValue('RECORD', 'RECORDS');
      ctx.matchValue('IS', 'ARE');
      if (ctx.matchValue('STANDARD')) {
        fd.labelRecords = 'STANDARD';
      } else if (ctx.matchValue('OMITTED')) {
        fd.labelRecords = 'OMITTED';
      }
      continue;
    }

    if (ctx.matchValue('DATA')) {
      ctx.matchValue('RECORD', 'RECORDS');
      ctx.matchValue('IS', 'ARE');
      while (ctx.check(TokenType.IDENTIFIER)) {
        fd.dataRecords.push(ctx.advance().value);
      }
      continue;
    }

    ctx.advance();
  }

  ctx.skipPeriod();

  // Parse record definitions (01 level items)
  const records = [];
  let currentItem = null;

  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for next FD/SD or end of section
    if (current.type === TokenType.FD ||
        current.type === TokenType.SD ||
        current.type === TokenType.WORKING_STORAGE ||
        current.type === TokenType.LINKAGE ||
        current.type === TokenType.PROCEDURE) {
      break;
    }

    // Check for level 88
    if (ctx.check(TokenType.NUMERIC_LITERAL) && ctx.current().value === '88') {
      // Parser-loop audit (round-12, prompted by finding 1's infinite-loop
      // class): parseLevel88 must run unconditionally here, even when
      // `currentItem` is null (a stray/leading 88-level with no preceding
      // elementary item to attach to - malformed COBOL, but this parser must
      // never hang on it) - parseLevel88 itself never dereferences
      // `parentItem` (only the *caller* decides where to attach the
      // resulting condition), so it's always safe to call purely to consume
      // the level-88 entry's own tokens. Skipping the call entirely (the
      // pre-fix behavior) left `continue` looping back to this exact same
      // unconsumed '88' token forever - the identical no-progress shape
      // finding 1 hung on, just gated behind a different (malformed-input)
      // precondition instead of always-reachable valid syntax.
      const condition = parseLevel88(ctx, currentItem);
      if (currentItem) {
        currentItem.conditions.push(condition);
      }
      continue;
    }

    // Parse data item
    const item = parseDataItem(ctx);
    if (item) {
      currentItem = item;
      records.push(item);
    }
  }

  fd.records = buildHierarchy(records);
  return fd;
}

/**
 * Parse LINKAGE SECTION
 */
export function parseLinkageSection(ctx) {
  const items = [];
  let currentItem = null;

  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for end of section
    if (current.type === TokenType.WORKING_STORAGE ||
        current.type === TokenType.FILE_SECTION ||
        current.type === TokenType.LOCAL_STORAGE ||
        current.type === TokenType.PROCEDURE) {
      break;
    }

    // Skip SECTION keyword and period
    if (current.type === TokenType.SECTION || current.type === TokenType.PERIOD) {
      ctx.advance();
      continue;
    }

    // Check for level 88
    if (ctx.check(TokenType.NUMERIC_LITERAL) && ctx.current().value === '88') {
      // Parser-loop audit (round-12, prompted by finding 1's infinite-loop
      // class): parseLevel88 must run unconditionally here, even when
      // `currentItem` is null (a stray/leading 88-level with no preceding
      // elementary item to attach to - malformed COBOL, but this parser must
      // never hang on it) - parseLevel88 itself never dereferences
      // `parentItem` (only the *caller* decides where to attach the
      // resulting condition), so it's always safe to call purely to consume
      // the level-88 entry's own tokens. Skipping the call entirely (the
      // pre-fix behavior) left `continue` looping back to this exact same
      // unconsumed '88' token forever - the identical no-progress shape
      // finding 1 hung on, just gated behind a different (malformed-input)
      // precondition instead of always-reachable valid syntax.
      const condition = parseLevel88(ctx, currentItem);
      if (currentItem) {
        currentItem.conditions.push(condition);
      }
      continue;
    }

    // Parse data item
    const item = parseDataItem(ctx);
    if (item) {
      currentItem = item;
      items.push(item);
    }
  }

  const hierarchy = buildHierarchy(items);
  return new LinkageSection({ items: hierarchy });
}

/**
 * Parse LOCAL-STORAGE SECTION
 */
export function parseLocalStorageSection(ctx) {
  const items = [];
  let currentItem = null;

  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // Check for end of section
    if (current.type === TokenType.WORKING_STORAGE ||
        current.type === TokenType.FILE_SECTION ||
        current.type === TokenType.LINKAGE ||
        current.type === TokenType.PROCEDURE) {
      break;
    }

    // Skip SECTION keyword and period
    if (current.type === TokenType.SECTION || current.type === TokenType.PERIOD) {
      ctx.advance();
      continue;
    }

    // Check for level 88
    if (ctx.check(TokenType.NUMERIC_LITERAL) && ctx.current().value === '88') {
      // Parser-loop audit (round-12, prompted by finding 1's infinite-loop
      // class): parseLevel88 must run unconditionally here, even when
      // `currentItem` is null (a stray/leading 88-level with no preceding
      // elementary item to attach to - malformed COBOL, but this parser must
      // never hang on it) - parseLevel88 itself never dereferences
      // `parentItem` (only the *caller* decides where to attach the
      // resulting condition), so it's always safe to call purely to consume
      // the level-88 entry's own tokens. Skipping the call entirely (the
      // pre-fix behavior) left `continue` looping back to this exact same
      // unconsumed '88' token forever - the identical no-progress shape
      // finding 1 hung on, just gated behind a different (malformed-input)
      // precondition instead of always-reachable valid syntax.
      const condition = parseLevel88(ctx, currentItem);
      if (currentItem) {
        currentItem.conditions.push(condition);
      }
      continue;
    }

    // Parse data item
    const item = parseDataItem(ctx);
    if (item) {
      currentItem = item;
      items.push(item);
    }
  }

  const hierarchy = buildHierarchy(items);
  return new LocalStorageSection({ items: hierarchy });
}

/**
 * Main function to parse DATA DIVISION
 */
export function parseDataDivision(tokens, options = {}) {
  const ctx = new ParserContext(tokens);
  ctx.decimalPointIsComma = !!options.decimalPointIsComma;
  const result = {
    fileSection: null,
    workingStorageSection: null,
    localStorageSection: null,
    linkageSection: null,
  };

  // Find DATA DIVISION
  let foundDivision = false;
  while (!ctx.isAtEnd()) {
    if (ctx.checkValue('DATA') && ctx.peek(1)?.value?.toUpperCase() === 'DIVISION') {
      ctx.advance(); // DATA
      ctx.advance(); // DIVISION
      ctx.skipPeriod();
      foundDivision = true;
      break;
    }
    ctx.advance();
  }

  // Standalone copybook mode: copybooks are bare record fragments with no
  // DATA DIVISION or section headers. When the source starts directly with
  // level-numbered data items, parse them as a working-storage section.
  if (!foundDivision) {
    ctx.position = 0;
    const startsWithDataItem = !ctx.isAtEnd() && (
      ctx.check(TokenType.LEVEL_NUMBER) ||
      (ctx.check(TokenType.NUMERIC_LITERAL) && /^\d{1,2}$/.test(ctx.current().value || ''))
    );
    const hasSectionHeaders = tokens.some(t =>
      t.type === TokenType.WORKING_STORAGE ||
      t.type === TokenType.FILE_SECTION ||
      t.type === TokenType.LINKAGE ||
      t.type === TokenType.LOCAL_STORAGE
    );

    if (startsWithDataItem && !hasSectionHeaders) {
      result.workingStorageSection = parseWorkingStorageSection(ctx);
      return result;
    }
  }

  // Parse sections
  while (!ctx.isAtEnd()) {
    const current = ctx.current();

    // End of DATA DIVISION
    if (current.type === TokenType.PROCEDURE) {
      break;
    }

    // FILE SECTION
    if (current.type === TokenType.FILE_SECTION) {
      ctx.advance();
      result.fileSection = parseFileSection(ctx);
      continue;
    }

    // WORKING-STORAGE SECTION
    if (current.type === TokenType.WORKING_STORAGE) {
      ctx.advance();
      result.workingStorageSection = parseWorkingStorageSection(ctx);
      continue;
    }

    // LINKAGE SECTION
    if (current.type === TokenType.LINKAGE) {
      ctx.advance();
      result.linkageSection = parseLinkageSection(ctx);
      continue;
    }

    // LOCAL-STORAGE SECTION
    if (current.type === TokenType.LOCAL_STORAGE) {
      ctx.advance();
      result.localStorageSection = parseLocalStorageSection(ctx);
      continue;
    }

    ctx.advance();
  }

  return result;
}

export { ParserContext, parsePicPattern, buildHierarchy };

export default {
  parseDataDivision,
  parseWorkingStorageSection,
  parseFileSection,
  parseLinkageSection,
  parseLocalStorageSection,
  parsePicPattern,
  buildHierarchy,
  ParserContext,
};
