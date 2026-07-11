/**
 * COBOL Lexer/Tokenizer
 * Handles both fixed-format (columns 1-6 sequence, 7 indicator, 8-72 code, 73-80 identification)
 * and free-format COBOL
 */

import { TokenType, Keywords, Token, ValidLevelNumbers } from './tokens.js';

/**
 * Lexer configuration
 */
const LexerConfig = {
  FIXED_FORMAT_LINE_LENGTH: 80,
  SEQUENCE_AREA_END: 6,     // Columns 1-6
  INDICATOR_COLUMN: 7,       // Column 7
  AREA_A_START: 8,          // Column 8
  AREA_A_END: 11,           // Columns 8-11
  AREA_B_START: 12,         // Column 12
  CODE_AREA_END: 72,        // Columns 8-72
  IDENTIFICATION_START: 73,  // Columns 73-80
};

/**
 * Determine if source is fixed-format or free-format
 */
function detectFormat(source) {
  const lines = source.split(/\r?\n/);
  let fixedFormatIndicators = 0;
  let freeFormatIndicators = 0;

  for (let i = 0; i < Math.min(lines.length, 50); i++) {
    const line = lines[i];
    if (line.length === 0) continue;

    // Check for fixed-format indicators
    if (line.length >= 7) {
      const col7 = line.charAt(6);
      // Asterisk or hyphen in column 7 suggests fixed format
      if (col7 === '*' || col7 === '-' || col7 === '/') {
        fixedFormatIndicators++;
      }
      // Sequence numbers in columns 1-6
      if (/^\d{6}/.test(line)) {
        fixedFormatIndicators++;
      }
    }

    // Check for free-format indicators
    if (line.trim().startsWith('*>')) {
      freeFormatIndicators++;
    }
    // Lines starting with non-space in column 1-6 area that aren't sequence numbers
    if (line.length > 0 && /^[A-Za-z]/.test(line)) {
      freeFormatIndicators++;
    }
  }

  return fixedFormatIndicators > freeFormatIndicators ? 'fixed' : 'free';
}

/**
 * Preprocess fixed-format COBOL source
 * - Remove sequence numbers and identification areas
 * - Handle continuation lines
 * - Remove comment lines
 */
function preprocessFixedFormat(source) {
  const lines = source.split(/\r?\n/);
  const processedLines = [];
  let continuationBuffer = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Pad line to handle short lines
    if (line.length < LexerConfig.CODE_AREA_END) {
      line = line.padEnd(LexerConfig.CODE_AREA_END);
    }

    // Get indicator column (column 7, index 6)
    const indicator = line.length > 6 ? line.charAt(6) : ' ';

    // Skip comment lines (asterisk or slash in column 7)
    if (indicator === '*' || indicator === '/') {
      continue;
    }

    // Skip debug lines (D in column 7)
    if (indicator === 'D' || indicator === 'd') {
      continue;
    }

    // Extract code area (columns 8-72, indices 7-71)
    let codePart = line.substring(7, Math.min(line.length, 72));

    // Handle continuation lines (hyphen in column 7)
    if (indicator === '-') {
      // Remove leading spaces from continuation, preserving string continuations
      const trimmedCode = codePart.trimStart();
      // If previous line ended with an open string, handle appropriately
      if (continuationBuffer.endsWith("'") || continuationBuffer.endsWith('"')) {
        // String continuation - join directly
        continuationBuffer = continuationBuffer.slice(0, -1) + trimmedCode;
      } else {
        continuationBuffer += trimmedCode;
      }
      continue;
    }

    // If we have a continuation buffer, output it first
    if (continuationBuffer) {
      processedLines.push({
        content: continuationBuffer,
        originalLine: i,
      });
      continuationBuffer = '';
    }

    // Store current line (trimming trailing spaces)
    const trimmedCode = codePart.trimEnd();
    if (trimmedCode) {
      processedLines.push({
        content: trimmedCode,
        originalLine: i + 1,
      });
    }
  }

  // Don't forget any remaining continuation buffer
  if (continuationBuffer) {
    processedLines.push({
      content: continuationBuffer,
      originalLine: lines.length,
    });
  }

  return processedLines;
}

/**
 * Preprocess free-format COBOL source
 */
function preprocessFreeFormat(source) {
  const lines = source.split(/\r?\n/);
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip free-format comments (*> style)
    const commentIndex = line.indexOf('*>');
    if (commentIndex !== -1) {
      line = line.substring(0, commentIndex);
    }

    // Skip lines that start with >> (compiler directives)
    if (line.trim().startsWith('>>')) {
      continue;
    }

    const trimmed = line.trimEnd();
    if (trimmed) {
      processedLines.push({
        content: trimmed,
        originalLine: i + 1,
      });
    }
  }

  return processedLines;
}

/**
 * Main tokenizer class
 */
class Lexer {
  constructor(source, options = {}) {
    this.originalSource = source;
    this.options = {
      format: options.format || detectFormat(source),
      ...options,
    };
    this.tokens = [];
    this.currentLine = 1;
    this.currentColumn = 1;
    this.position = 0;
    this.source = '';
    this.lineMapping = [];
  }

  /**
   * Tokenize the source code
   */
  tokenize() {
    // Preprocess based on format
    const processedLines = this.options.format === 'fixed'
      ? preprocessFixedFormat(this.originalSource)
      : preprocessFreeFormat(this.originalSource);

    // Join lines for tokenization, keeping track of line mapping
    this.source = processedLines.map(l => l.content).join('\n');
    this.lineMapping = processedLines.map(l => l.originalLine);

    this.position = 0;
    this.currentLine = 1;
    this.currentColumn = 1;
    this.tokens = [];

    while (!this.isAtEnd()) {
      this.scanToken();
    }

    // Add EOF token
    this.tokens.push(new Token(
      TokenType.EOF,
      '',
      this.currentLine,
      this.currentColumn,
      this.position
    ));

    return this.tokens;
  }

  isAtEnd() {
    return this.position >= this.source.length;
  }

  peek(offset = 0) {
    const pos = this.position + offset;
    if (pos >= this.source.length) return '\0';
    return this.source.charAt(pos);
  }

  advance() {
    const char = this.source.charAt(this.position);
    this.position++;
    if (char === '\n') {
      this.currentLine++;
      this.currentColumn = 1;
    } else {
      this.currentColumn++;
    }
    return char;
  }

  addToken(type, value) {
    const originalLine = this.lineMapping[this.currentLine - 1] || this.currentLine;
    this.tokens.push(new Token(type, value, originalLine, this.currentColumn, this.position));
  }

  scanToken() {
    this.skipWhitespace();

    if (this.isAtEnd()) return;

    const startLine = this.currentLine;
    const startColumn = this.currentColumn;
    const startPosition = this.position;

    const char = this.advance();

    // Single-character tokens
    switch (char) {
      case '.':
        this.addTokenAt(TokenType.PERIOD, '.', startLine, startColumn, startPosition);
        return;
      case ',':
        this.addTokenAt(TokenType.COMMA, ',', startLine, startColumn, startPosition);
        return;
      case ';':
        this.addTokenAt(TokenType.SEMICOLON, ';', startLine, startColumn, startPosition);
        return;
      case '(':
        this.addTokenAt(TokenType.OP_LPAREN, '(', startLine, startColumn, startPosition);
        return;
      case ')':
        this.addTokenAt(TokenType.OP_RPAREN, ')', startLine, startColumn, startPosition);
        return;
      case ':':
        this.addTokenAt(TokenType.OP_COLON, ':', startLine, startColumn, startPosition);
        return;
      case '+':
        this.addTokenAt(TokenType.OP_PLUS, '+', startLine, startColumn, startPosition);
        return;
      case '-':
        // Could be minus or part of identifier
        if (this.isDigit(this.peek())) {
          this.position--;
          this.currentColumn--;
          this.scanNumber();
          return;
        }
        this.addTokenAt(TokenType.OP_MINUS, '-', startLine, startColumn, startPosition);
        return;
      case '*':
        if (this.peek() === '*') {
          this.advance();
          this.addTokenAt(TokenType.OP_POWER, '**', startLine, startColumn, startPosition);
        } else {
          this.addTokenAt(TokenType.OP_MULTIPLY, '*', startLine, startColumn, startPosition);
        }
        return;
      case '/':
        this.addTokenAt(TokenType.OP_DIVIDE, '/', startLine, startColumn, startPosition);
        return;
      case '=':
        this.addTokenAt(TokenType.OP_EQUAL, '=', startLine, startColumn, startPosition);
        return;
      case '>':
        if (this.peek() === '=') {
          this.advance();
          this.addTokenAt(TokenType.OP_GREATER_EQUAL, '>=', startLine, startColumn, startPosition);
        } else {
          this.addTokenAt(TokenType.OP_GREATER, '>', startLine, startColumn, startPosition);
        }
        return;
      case '<':
        if (this.peek() === '=') {
          this.advance();
          this.addTokenAt(TokenType.OP_LESS_EQUAL, '<=', startLine, startColumn, startPosition);
        } else if (this.peek() === '>') {
          this.advance();
          this.addTokenAt(TokenType.OP_NOT_EQUAL, '<>', startLine, startColumn, startPosition);
        } else {
          this.addTokenAt(TokenType.OP_LESS, '<', startLine, startColumn, startPosition);
        }
        return;
      case "'":
      case '"':
        this.position--;
        this.currentColumn--;
        this.scanString(char);
        return;
      case '\n':
        // Already handled in advance()
        return;
    }

    // Numbers
    if (this.isDigit(char)) {
      this.position--;
      this.currentColumn--;
      this.scanNumber();
      return;
    }

    // Identifiers and keywords
    if (this.isAlpha(char)) {
      this.position--;
      this.currentColumn--;
      this.scanIdentifier();
      return;
    }

    // Unknown character
    this.addTokenAt(TokenType.UNKNOWN, char, startLine, startColumn, startPosition);
  }

  addTokenAt(type, value, line, column, position) {
    const originalLine = this.lineMapping[line - 1] || line;
    this.tokens.push(new Token(type, value, originalLine, column, position));
  }

  skipWhitespace() {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r') {
        this.advance();
      } else if (char === '\n') {
        this.advance();
      } else {
        break;
      }
    }
  }

  isDigit(char) {
    return char >= '0' && char <= '9';
  }

  isAlpha(char) {
    return (char >= 'a' && char <= 'z') ||
           (char >= 'A' && char <= 'Z') ||
           char === '_';
  }

  isAlphaNumeric(char) {
    return this.isAlpha(char) || this.isDigit(char) || char === '-';
  }

  scanString(quoteChar) {
    const startLine = this.currentLine;
    const startColumn = this.currentColumn;
    const startPosition = this.position;

    this.advance(); // consume opening quote
    let value = '';
    let isHex = false;

    // Check for hex literal (X"..." or X'...')
    if (this.position >= 2) {
      const prevChar = this.source.charAt(this.position - 2);
      if (prevChar.toUpperCase() === 'X') {
        isHex = true;
      }
    }

    while (!this.isAtEnd()) {
      const char = this.peek();

      if (char === quoteChar) {
        // Check for escaped quote (doubled)
        if (this.peek(1) === quoteChar) {
          value += quoteChar;
          this.advance();
          this.advance();
        } else {
          break;
        }
      } else if (char === '\n') {
        // String continues on next line (should have been handled by continuation)
        break;
      } else {
        value += char;
        this.advance();
      }
    }

    // Consume closing quote
    if (this.peek() === quoteChar) {
      this.advance();
    }

    const tokenType = isHex ? TokenType.HEX_LITERAL : TokenType.STRING_LITERAL;
    this.addTokenAt(tokenType, value, startLine, startColumn, startPosition);
  }

  scanNumber() {
    const startLine = this.currentLine;
    const startColumn = this.currentColumn;
    const startPosition = this.position;

    let value = '';

    // Handle optional sign
    if (this.peek() === '+' || this.peek() === '-') {
      value += this.advance();
    }

    // Integer part
    while (this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Check if this is actually a COBOL identifier starting with digits
    // (e.g., "0000-MAIN-PARAGRAPH" or "1000-INITIALIZE")
    if (this.peek() === '-' && this.isAlpha(this.peek(1))) {
      // It's a paragraph/identifier that starts with digits
      while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '-')) {
        value += this.advance();
      }
      // Remove trailing hyphens
      while (value.endsWith('-')) {
        value = value.slice(0, -1);
        this.position--;
        this.currentColumn--;
      }
      this.addTokenAt(TokenType.IDENTIFIER, value, startLine, startColumn, startPosition);
      return;
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peek(1))) {
      value += this.advance(); // consume '.'
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Exponent part
    const peekChar = this.peek();
    if (peekChar && peekChar.toUpperCase() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    this.addTokenAt(TokenType.NUMERIC_LITERAL, value, startLine, startColumn, startPosition);
  }

  /**
   * Scan the picture character-string that follows a PIC/PICTURE keyword.
   * Emits an optional IS keyword token followed by a single PICTURE_STRING
   * token. The picture string is terminated by whitespace or by a period
   * that ends the sentence (a period followed by whitespace/EOF); a period
   * with a picture character after it is part of the picture (PIC 9(3).99).
   */
  scanPictureString() {
    this.skipWhitespace();

    // Optional IS between PIC and the picture string
    if ((this.peek() === 'I' || this.peek() === 'i') &&
        (this.peek(1) === 'S' || this.peek(1) === 's') &&
        !this.isPictureChar(this.peek(2))) {
      const isLine = this.currentLine;
      const isColumn = this.currentColumn;
      const isPosition = this.position;
      this.advance();
      this.advance();
      this.addTokenAt(Keywords.get('IS') || TokenType.IDENTIFIER, 'IS', isLine, isColumn, isPosition);
      this.skipWhitespace();
    }

    const startLine = this.currentLine;
    const startColumn = this.currentColumn;
    const startPosition = this.position;
    let value = '';

    while (!this.isAtEnd()) {
      const char = this.peek();

      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        break;
      }
      if (char === '.') {
        // Sentence-ending period: not followed by another picture character
        const next = this.peek(1);
        if (next === '\0' || next === ' ' || next === '\t' || next === '\r' || next === '\n' || next === '.') {
          break;
        }
      }
      if (!this.isPictureChar(char) && char !== '.') {
        break;
      }
      value += this.advance();
    }

    if (value.length > 0) {
      this.addTokenAt(TokenType.PICTURE_STRING, value.toUpperCase(), startLine, startColumn, startPosition);
    }
  }

  /**
   * Characters that may legally appear in a picture character-string.
   * Symbols: A B E G N P S V X Z 9 0 / , + - * $ ( ) and CR/DB pairs.
   */
  isPictureChar(char) {
    if (!char || char === '\0') return false;
    return /[ABEGNPSVXZCRDabegnpsvxzcrd90-9()/,+\-*$]/.test(char);
  }

  scanIdentifier() {
    const startLine = this.currentLine;
    const startColumn = this.currentColumn;
    const startPosition = this.position;

    let value = '';

    // First character must be alphabetic
    if (this.isAlpha(this.peek())) {
      value += this.advance();
    }

    // Subsequent characters can be alphanumeric or hyphen
    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    // Remove trailing hyphens (not valid in COBOL identifiers)
    while (value.endsWith('-')) {
      value = value.slice(0, -1);
      this.position--;
      this.currentColumn--;
    }

    const upperValue = value.toUpperCase();

    // Check if it's a keyword
    if (Keywords.has(upperValue)) {
      this.addTokenAt(Keywords.get(upperValue), value, startLine, startColumn, startPosition);
      // PIC/PICTURE introduces a picture character-string which must be
      // lexed as a single token: characters like 9, X, S, V and digits in
      // parentheses would otherwise be misread as level numbers, numeric
      // literals or identifiers (e.g. the 9 in "PIC 9(6)").
      if (upperValue === 'PIC' || upperValue === 'PICTURE') {
        this.scanPictureString();
      }
      return;
    }

    // Check if it's a level number
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && ValidLevelNumbers.has(numValue)) {
      this.addTokenAt(TokenType.LEVEL_NUMBER, value, startLine, startColumn, startPosition);
      return;
    }

    // Regular identifier
    this.addTokenAt(TokenType.IDENTIFIER, value, startLine, startColumn, startPosition);
  }
}

/**
 * Main tokenize function
 * @param {string} source - COBOL source code
 * @param {object} options - Tokenization options
 * @returns {Token[]} Array of tokens
 */
export function tokenize(source, options = {}) {
  const lexer = new Lexer(source, options);
  return lexer.tokenize();
}

/**
 * Tokenize with format detection
 */
export function tokenizeAuto(source) {
  const format = detectFormat(source);
  return tokenize(source, { format });
}

/**
 * Get format of source
 */
export function getFormat(source) {
  return detectFormat(source);
}

export { Lexer, detectFormat, preprocessFixedFormat, preprocessFreeFormat };

export default {
  tokenize,
  tokenizeAuto,
  getFormat,
  Lexer,
  detectFormat,
  preprocessFixedFormat,
  preprocessFreeFormat,
};
