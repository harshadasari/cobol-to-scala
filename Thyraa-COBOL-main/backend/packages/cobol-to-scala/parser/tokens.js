/**
 * COBOL Token Definitions
 * Comprehensive token types for COBOL parsing
 */

// Token type constants
export const TokenType = {
  // Divisions
  IDENTIFICATION: 'IDENTIFICATION',
  ENVIRONMENT: 'ENVIRONMENT',
  DATA: 'DATA',
  PROCEDURE: 'PROCEDURE',
  DIVISION: 'DIVISION',
  SECTION: 'SECTION',

  // Data Division Sections
  WORKING_STORAGE: 'WORKING-STORAGE',
  FILE_SECTION: 'FILE',
  LINKAGE: 'LINKAGE',
  LOCAL_STORAGE: 'LOCAL-STORAGE',
  SCREEN: 'SCREEN',
  REPORT: 'REPORT',

  // File Section specific
  FD: 'FD',
  SD: 'SD',
  BLOCK: 'BLOCK',
  CONTAINS: 'CONTAINS',
  RECORD: 'RECORD',
  RECORDS: 'RECORDS',
  LABEL: 'LABEL',
  STANDARD: 'STANDARD',
  OMITTED: 'OMITTED',

  // Level Numbers (01-49, 66, 77, 88)
  LEVEL_NUMBER: 'LEVEL_NUMBER',

  // PIC/PICTURE Clause
  PIC: 'PIC',
  PICTURE: 'PICTURE',
  // Entire picture character-string captured as one token by the lexer
  // (e.g. "9(6)", "X(30)", "S9(7)V99", "ZZ,ZZ9.99"). Digits inside a picture
  // must never be re-tokenized as level numbers or numeric literals.
  PICTURE_STRING: 'PICTURE_STRING',
  PIC_X: 'X',
  PIC_A: 'A',
  PIC_9: '9',
  PIC_S: 'S',
  PIC_V: 'V',
  PIC_P: 'P',
  PIC_Z: 'Z',
  PIC_ASTERISK: '*',
  PIC_PLUS: '+',
  PIC_MINUS: '-',
  PIC_PERIOD: '.',
  PIC_COMMA: ',',
  PIC_CR: 'CR',
  PIC_DB: 'DB',
  PIC_DOLLAR: '$',

  // USAGE Types
  USAGE: 'USAGE',
  COMP: 'COMP',
  COMP_1: 'COMP-1',
  COMP_2: 'COMP-2',
  COMP_3: 'COMP-3',
  COMP_4: 'COMP-4',
  COMP_5: 'COMP-5',
  COMPUTATIONAL: 'COMPUTATIONAL',
  COMPUTATIONAL_1: 'COMPUTATIONAL-1',
  COMPUTATIONAL_2: 'COMPUTATIONAL-2',
  COMPUTATIONAL_3: 'COMPUTATIONAL-3',
  COMPUTATIONAL_4: 'COMPUTATIONAL-4',
  COMPUTATIONAL_5: 'COMPUTATIONAL-5',
  BINARY: 'BINARY',
  PACKED_DECIMAL: 'PACKED-DECIMAL',
  INDEX: 'INDEX',
  DISPLAY: 'DISPLAY',
  POINTER: 'POINTER',
  NATIVE: 'NATIVE',

  // Data Definition
  OCCURS: 'OCCURS',
  TIMES: 'TIMES',
  DEPENDING: 'DEPENDING',
  ON: 'ON',
  INDEXED: 'INDEXED',
  ASCENDING: 'ASCENDING',
  DESCENDING: 'DESCENDING',
  KEY: 'KEY',
  REDEFINES: 'REDEFINES',
  RENAMES: 'RENAMES',
  VALUE: 'VALUE',
  VALUES: 'VALUES',
  FILLER: 'FILLER',
  IS: 'IS',
  ARE: 'ARE',
  BLANK: 'BLANK',
  WHEN: 'WHEN',
  ZERO: 'ZERO',
  ZEROS: 'ZEROS',
  ZEROES: 'ZEROES',
  SPACE: 'SPACE',
  SPACES: 'SPACES',
  HIGH_VALUE: 'HIGH-VALUE',
  HIGH_VALUES: 'HIGH-VALUES',
  LOW_VALUE: 'LOW-VALUE',
  LOW_VALUES: 'LOW-VALUES',
  QUOTE: 'QUOTE',
  QUOTES: 'QUOTES',
  NULL: 'NULL',
  NULLS: 'NULLS',
  ALL: 'ALL',
  JUSTIFIED: 'JUSTIFIED',
  JUST: 'JUST',
  RIGHT: 'RIGHT',
  LEFT: 'LEFT',
  SYNC: 'SYNC',
  SYNCHRONIZED: 'SYNCHRONIZED',
  GLOBAL: 'GLOBAL',
  EXTERNAL: 'EXTERNAL',
  SIGN: 'SIGN',
  LEADING: 'LEADING',
  TRAILING: 'TRAILING',
  SEPARATE: 'SEPARATE',
  CHARACTER: 'CHARACTER',

  // Procedure Division
  PERFORM: 'PERFORM',
  THRU: 'THRU',
  THROUGH: 'THROUGH',
  UNTIL: 'UNTIL',
  VARYING: 'VARYING',
  FROM: 'FROM',
  BY: 'BY',
  WITH: 'WITH',
  TEST: 'TEST',
  BEFORE: 'BEFORE',
  AFTER: 'AFTER',
  END_PERFORM: 'END-PERFORM',

  // Conditional
  IF: 'IF',
  THEN: 'THEN',
  ELSE: 'ELSE',
  END_IF: 'END-IF',
  EVALUATE: 'EVALUATE',
  ALSO: 'ALSO',
  TRUE: 'TRUE',
  FALSE: 'FALSE',
  OTHER: 'OTHER',
  END_EVALUATE: 'END-EVALUATE',
  CONTINUE: 'CONTINUE',
  NEXT: 'NEXT',
  SENTENCE: 'SENTENCE',

  // Data Movement
  MOVE: 'MOVE',
  TO: 'TO',
  CORRESPONDING: 'CORRESPONDING',
  CORR: 'CORR',
  INITIALIZE: 'INITIALIZE',
  REPLACING: 'REPLACING',
  SET: 'SET',
  UP: 'UP',
  DOWN: 'DOWN',

  // Arithmetic
  COMPUTE: 'COMPUTE',
  ADD: 'ADD',
  SUBTRACT: 'SUBTRACT',
  MULTIPLY: 'MULTIPLY',
  DIVIDE: 'DIVIDE',
  GIVING: 'GIVING',
  REMAINDER: 'REMAINDER',
  INTO: 'INTO',
  ROUNDED: 'ROUNDED',
  SIZE: 'SIZE',
  ERROR: 'ERROR',
  NOT: 'NOT',
  ON_SIZE_ERROR: 'ON SIZE ERROR',
  END_ADD: 'END-ADD',
  END_SUBTRACT: 'END-SUBTRACT',
  END_MULTIPLY: 'END-MULTIPLY',
  END_DIVIDE: 'END-DIVIDE',
  END_COMPUTE: 'END-COMPUTE',

  // String Operations
  STRING: 'STRING',
  UNSTRING: 'UNSTRING',
  DELIMITED: 'DELIMITED',
  DELIMITER: 'DELIMITER',
  COUNT: 'COUNT',
  POINTER_KW: 'POINTER',
  OVERFLOW: 'OVERFLOW',
  END_STRING: 'END-STRING',
  END_UNSTRING: 'END-UNSTRING',
  INSPECT: 'INSPECT',
  TALLYING: 'TALLYING',
  CONVERTING: 'CONVERTING',
  FIRST: 'FIRST',
  INITIAL: 'INITIAL',
  REFERENCE: 'REFERENCE',
  CONTENT: 'CONTENT',

  // File Operations
  OPEN: 'OPEN',
  CLOSE: 'CLOSE',
  READ: 'READ',
  WRITE: 'WRITE',
  REWRITE: 'REWRITE',
  DELETE: 'DELETE',
  START: 'START',
  INPUT: 'INPUT',
  OUTPUT: 'OUTPUT',
  I_O: 'I-O',
  EXTEND: 'EXTEND',
  AT: 'AT',
  END: 'END',
  INVALID: 'INVALID',
  END_READ: 'END-READ',
  END_WRITE: 'END-WRITE',
  END_REWRITE: 'END-REWRITE',
  END_DELETE: 'END-DELETE',
  END_START: 'END-START',
  ADVANCING: 'ADVANCING',
  LINE: 'LINE',
  LINES: 'LINES',
  PAGE: 'PAGE',

  // CALL Statement
  CALL: 'CALL',
  USING: 'USING',
  RETURNING: 'RETURNING',
  END_CALL: 'END-CALL',
  CANCEL: 'CANCEL',
  ENTRY: 'ENTRY',

  // Control Flow
  GO: 'GO',
  STOP: 'STOP',
  RUN: 'RUN',
  GOBACK: 'GOBACK',
  EXIT: 'EXIT',
  PROGRAM: 'PROGRAM',
  RETURN: 'RETURN',
  ACCEPT: 'ACCEPT',
  DISPLAY: 'DISPLAY',
  UPON: 'UPON',

  // EXEC SQL/CICS
  EXEC: 'EXEC',
  SQL: 'SQL',
  CICS: 'CICS',
  END_EXEC: 'END-EXEC',
  INCLUDE: 'INCLUDE',
  DECLARE: 'DECLARE',
  CURSOR: 'CURSOR',
  FOR: 'FOR',
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  FETCH: 'FETCH',
  WHERE: 'WHERE',
  ORDER: 'ORDER',
  GROUP: 'GROUP',
  HAVING: 'HAVING',
  UNION: 'UNION',
  JOIN: 'JOIN',
  INNER: 'INNER',
  OUTER: 'OUTER',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  WHENEVER: 'WHENEVER',
  SQLERROR: 'SQLERROR',
  SQLWARNING: 'SQLWARNING',
  FOUND: 'FOUND',

  // COPY Statement
  COPY: 'COPY',
  REPLACING_COPY: 'REPLACING',
  OF: 'OF',
  IN: 'IN',

  // Comparison Operators
  EQUAL: 'EQUAL',
  EQUALS: 'EQUALS',
  GREATER: 'GREATER',
  LESS: 'LESS',
  THAN: 'THAN',
  OR: 'OR',
  AND: 'AND',
  NUMERIC: 'NUMERIC',
  ALPHABETIC: 'ALPHABETIC',
  ALPHABETIC_LOWER: 'ALPHABETIC-LOWER',
  ALPHABETIC_UPPER: 'ALPHABETIC-UPPER',
  POSITIVE: 'POSITIVE',
  NEGATIVE: 'NEGATIVE',

  // Operators
  OP_EQUAL: '=',
  OP_GREATER: '>',
  OP_LESS: '<',
  OP_GREATER_EQUAL: '>=',
  OP_LESS_EQUAL: '<=',
  OP_NOT_EQUAL: '<>',
  OP_PLUS: '+',
  OP_MINUS: '-',
  OP_MULTIPLY: '*',
  OP_DIVIDE: '/',
  OP_POWER: '**',
  OP_LPAREN: '(',
  OP_RPAREN: ')',
  OP_COLON: ':',

  // Literals
  STRING_LITERAL: 'STRING_LITERAL',
  NUMERIC_LITERAL: 'NUMERIC_LITERAL',
  HEX_LITERAL: 'HEX_LITERAL',

  // Identifiers
  IDENTIFIER: 'IDENTIFIER',
  QUALIFIED_NAME: 'QUALIFIED_NAME',
  HOST_VARIABLE: 'HOST_VARIABLE',

  // Special
  PERIOD: 'PERIOD',
  COMMA: 'COMMA',
  SEMICOLON: 'SEMICOLON',
  NEWLINE: 'NEWLINE',
  EOF: 'EOF',
  UNKNOWN: 'UNKNOWN',
};

// Keywords lookup map (case-insensitive)
export const Keywords = new Map([
  // Divisions
  ['IDENTIFICATION', TokenType.IDENTIFICATION],
  ['ID', TokenType.IDENTIFICATION],
  ['ENVIRONMENT', TokenType.ENVIRONMENT],
  ['DATA', TokenType.DATA],
  ['PROCEDURE', TokenType.PROCEDURE],
  ['DIVISION', TokenType.DIVISION],
  ['SECTION', TokenType.SECTION],

  // Data Division Sections
  ['WORKING-STORAGE', TokenType.WORKING_STORAGE],
  ['FILE', TokenType.FILE_SECTION],
  ['LINKAGE', TokenType.LINKAGE],
  ['LOCAL-STORAGE', TokenType.LOCAL_STORAGE],
  ['SCREEN', TokenType.SCREEN],
  ['REPORT', TokenType.REPORT],

  // File Section
  ['FD', TokenType.FD],
  ['SD', TokenType.SD],
  ['BLOCK', TokenType.BLOCK],
  ['CONTAINS', TokenType.CONTAINS],
  ['RECORD', TokenType.RECORD],
  ['RECORDS', TokenType.RECORDS],
  ['LABEL', TokenType.LABEL],
  ['STANDARD', TokenType.STANDARD],
  ['OMITTED', TokenType.OMITTED],

  // PIC/PICTURE
  ['PIC', TokenType.PIC],
  ['PICTURE', TokenType.PICTURE],

  // USAGE Types
  ['USAGE', TokenType.USAGE],
  ['COMP', TokenType.COMP],
  ['COMP-1', TokenType.COMP_1],
  ['COMP-2', TokenType.COMP_2],
  ['COMP-3', TokenType.COMP_3],
  ['COMP-4', TokenType.COMP_4],
  ['COMP-5', TokenType.COMP_5],
  ['COMPUTATIONAL', TokenType.COMPUTATIONAL],
  ['COMPUTATIONAL-1', TokenType.COMPUTATIONAL_1],
  ['COMPUTATIONAL-2', TokenType.COMPUTATIONAL_2],
  ['COMPUTATIONAL-3', TokenType.COMPUTATIONAL_3],
  ['COMPUTATIONAL-4', TokenType.COMPUTATIONAL_4],
  ['COMPUTATIONAL-5', TokenType.COMPUTATIONAL_5],
  ['BINARY', TokenType.BINARY],
  ['PACKED-DECIMAL', TokenType.PACKED_DECIMAL],
  ['INDEX', TokenType.INDEX],
  ['DISPLAY', TokenType.DISPLAY],
  ['POINTER', TokenType.POINTER],
  ['NATIVE', TokenType.NATIVE],

  // Data Definition
  ['OCCURS', TokenType.OCCURS],
  ['TIMES', TokenType.TIMES],
  ['DEPENDING', TokenType.DEPENDING],
  ['ON', TokenType.ON],
  ['INDEXED', TokenType.INDEXED],
  ['ASCENDING', TokenType.ASCENDING],
  ['DESCENDING', TokenType.DESCENDING],
  ['KEY', TokenType.KEY],
  ['REDEFINES', TokenType.REDEFINES],
  ['RENAMES', TokenType.RENAMES],
  ['VALUE', TokenType.VALUE],
  ['VALUES', TokenType.VALUES],
  ['FILLER', TokenType.FILLER],
  ['IS', TokenType.IS],
  ['ARE', TokenType.ARE],
  ['BLANK', TokenType.BLANK],
  ['WHEN', TokenType.WHEN],
  ['ZERO', TokenType.ZERO],
  ['ZEROS', TokenType.ZEROS],
  ['ZEROES', TokenType.ZEROES],
  ['SPACE', TokenType.SPACE],
  ['SPACES', TokenType.SPACES],
  ['HIGH-VALUE', TokenType.HIGH_VALUE],
  ['HIGH-VALUES', TokenType.HIGH_VALUES],
  ['LOW-VALUE', TokenType.LOW_VALUE],
  ['LOW-VALUES', TokenType.LOW_VALUES],
  ['QUOTE', TokenType.QUOTE],
  ['QUOTES', TokenType.QUOTES],
  ['NULL', TokenType.NULL],
  ['NULLS', TokenType.NULLS],
  ['ALL', TokenType.ALL],
  ['JUSTIFIED', TokenType.JUSTIFIED],
  ['JUST', TokenType.JUST],
  ['RIGHT', TokenType.RIGHT],
  ['LEFT', TokenType.LEFT],
  ['SYNC', TokenType.SYNC],
  ['SYNCHRONIZED', TokenType.SYNCHRONIZED],
  ['GLOBAL', TokenType.GLOBAL],
  ['EXTERNAL', TokenType.EXTERNAL],
  ['SIGN', TokenType.SIGN],
  ['LEADING', TokenType.LEADING],
  ['TRAILING', TokenType.TRAILING],
  ['SEPARATE', TokenType.SEPARATE],
  ['CHARACTER', TokenType.CHARACTER],

  // Procedure Division
  ['PERFORM', TokenType.PERFORM],
  ['THRU', TokenType.THRU],
  ['THROUGH', TokenType.THROUGH],
  ['UNTIL', TokenType.UNTIL],
  ['VARYING', TokenType.VARYING],
  ['FROM', TokenType.FROM],
  ['BY', TokenType.BY],
  ['WITH', TokenType.WITH],
  ['TEST', TokenType.TEST],
  ['BEFORE', TokenType.BEFORE],
  ['AFTER', TokenType.AFTER],
  ['END-PERFORM', TokenType.END_PERFORM],

  // Conditional
  ['IF', TokenType.IF],
  ['THEN', TokenType.THEN],
  ['ELSE', TokenType.ELSE],
  ['END-IF', TokenType.END_IF],
  ['EVALUATE', TokenType.EVALUATE],
  ['ALSO', TokenType.ALSO],
  ['TRUE', TokenType.TRUE],
  ['FALSE', TokenType.FALSE],
  ['OTHER', TokenType.OTHER],
  ['END-EVALUATE', TokenType.END_EVALUATE],
  ['CONTINUE', TokenType.CONTINUE],
  ['NEXT', TokenType.NEXT],
  ['SENTENCE', TokenType.SENTENCE],

  // Data Movement
  ['MOVE', TokenType.MOVE],
  ['TO', TokenType.TO],
  ['CORRESPONDING', TokenType.CORRESPONDING],
  ['CORR', TokenType.CORR],
  ['INITIALIZE', TokenType.INITIALIZE],
  ['REPLACING', TokenType.REPLACING],
  ['SET', TokenType.SET],
  ['UP', TokenType.UP],
  ['DOWN', TokenType.DOWN],

  // Arithmetic
  ['COMPUTE', TokenType.COMPUTE],
  ['ADD', TokenType.ADD],
  ['SUBTRACT', TokenType.SUBTRACT],
  ['MULTIPLY', TokenType.MULTIPLY],
  ['DIVIDE', TokenType.DIVIDE],
  ['GIVING', TokenType.GIVING],
  ['REMAINDER', TokenType.REMAINDER],
  ['INTO', TokenType.INTO],
  ['ROUNDED', TokenType.ROUNDED],
  ['SIZE', TokenType.SIZE],
  ['ERROR', TokenType.ERROR],
  ['NOT', TokenType.NOT],
  ['END-ADD', TokenType.END_ADD],
  ['END-SUBTRACT', TokenType.END_SUBTRACT],
  ['END-MULTIPLY', TokenType.END_MULTIPLY],
  ['END-DIVIDE', TokenType.END_DIVIDE],
  ['END-COMPUTE', TokenType.END_COMPUTE],

  // String Operations
  ['STRING', TokenType.STRING],
  ['UNSTRING', TokenType.UNSTRING],
  ['DELIMITED', TokenType.DELIMITED],
  ['DELIMITER', TokenType.DELIMITER],
  ['COUNT', TokenType.COUNT],
  ['OVERFLOW', TokenType.OVERFLOW],
  ['END-STRING', TokenType.END_STRING],
  ['END-UNSTRING', TokenType.END_UNSTRING],
  ['INSPECT', TokenType.INSPECT],
  ['TALLYING', TokenType.TALLYING],
  ['CONVERTING', TokenType.CONVERTING],
  ['FIRST', TokenType.FIRST],
  ['INITIAL', TokenType.INITIAL],
  ['REFERENCE', TokenType.REFERENCE],
  ['CONTENT', TokenType.CONTENT],

  // File Operations
  ['OPEN', TokenType.OPEN],
  ['CLOSE', TokenType.CLOSE],
  ['READ', TokenType.READ],
  ['WRITE', TokenType.WRITE],
  ['REWRITE', TokenType.REWRITE],
  ['DELETE', TokenType.DELETE],
  ['START', TokenType.START],
  ['INPUT', TokenType.INPUT],
  ['OUTPUT', TokenType.OUTPUT],
  ['I-O', TokenType.I_O],
  ['EXTEND', TokenType.EXTEND],
  ['AT', TokenType.AT],
  ['END', TokenType.END],
  ['INVALID', TokenType.INVALID],
  ['END-READ', TokenType.END_READ],
  ['END-WRITE', TokenType.END_WRITE],
  ['END-REWRITE', TokenType.END_REWRITE],
  ['END-DELETE', TokenType.END_DELETE],
  ['END-START', TokenType.END_START],
  ['ADVANCING', TokenType.ADVANCING],
  ['LINE', TokenType.LINE],
  ['LINES', TokenType.LINES],
  ['PAGE', TokenType.PAGE],

  // CALL Statement
  ['CALL', TokenType.CALL],
  ['USING', TokenType.USING],
  ['RETURNING', TokenType.RETURNING],
  ['END-CALL', TokenType.END_CALL],
  ['CANCEL', TokenType.CANCEL],
  ['ENTRY', TokenType.ENTRY],

  // Control Flow
  ['GO', TokenType.GO],
  ['STOP', TokenType.STOP],
  ['RUN', TokenType.RUN],
  ['GOBACK', TokenType.GOBACK],
  ['EXIT', TokenType.EXIT],
  ['PROGRAM', TokenType.PROGRAM],
  ['RETURN', TokenType.RETURN],
  ['ACCEPT', TokenType.ACCEPT],
  ['UPON', TokenType.UPON],

  // EXEC SQL/CICS
  ['EXEC', TokenType.EXEC],
  ['SQL', TokenType.SQL],
  ['CICS', TokenType.CICS],
  ['END-EXEC', TokenType.END_EXEC],
  ['INCLUDE', TokenType.INCLUDE],
  ['DECLARE', TokenType.DECLARE],
  ['CURSOR', TokenType.CURSOR],
  ['FOR', TokenType.FOR],
  ['SELECT', TokenType.SELECT],
  ['INSERT', TokenType.INSERT],
  ['UPDATE', TokenType.UPDATE],
  ['FETCH', TokenType.FETCH],
  ['WHERE', TokenType.WHERE],
  ['ORDER', TokenType.ORDER],
  ['GROUP', TokenType.GROUP],
  ['HAVING', TokenType.HAVING],
  ['UNION', TokenType.UNION],
  ['JOIN', TokenType.JOIN],
  ['INNER', TokenType.INNER],
  ['OUTER', TokenType.OUTER],
  ['COMMIT', TokenType.COMMIT],
  ['ROLLBACK', TokenType.ROLLBACK],
  ['WHENEVER', TokenType.WHENEVER],
  ['SQLERROR', TokenType.SQLERROR],
  ['SQLWARNING', TokenType.SQLWARNING],
  ['FOUND', TokenType.FOUND],

  // COPY Statement
  ['COPY', TokenType.COPY],
  ['OF', TokenType.OF],
  ['IN', TokenType.IN],

  // Comparison Keywords
  ['EQUAL', TokenType.EQUAL],
  ['EQUALS', TokenType.EQUALS],
  ['GREATER', TokenType.GREATER],
  ['LESS', TokenType.LESS],
  ['THAN', TokenType.THAN],
  ['OR', TokenType.OR],
  ['AND', TokenType.AND],
  ['NUMERIC', TokenType.NUMERIC],
  ['ALPHABETIC', TokenType.ALPHABETIC],
  ['ALPHABETIC-LOWER', TokenType.ALPHABETIC_LOWER],
  ['ALPHABETIC-UPPER', TokenType.ALPHABETIC_UPPER],
  ['POSITIVE', TokenType.POSITIVE],
  ['NEGATIVE', TokenType.NEGATIVE],
]);

// Level numbers that are valid in COBOL
export const ValidLevelNumbers = new Set([
  ...Array.from({ length: 49 }, (_, i) => i + 1), // 01-49
  66, // RENAMES
  77, // Independent items
  88, // Condition names
]);

// Figurative constants
export const FigurativeConstants = new Set([
  'ZERO', 'ZEROS', 'ZEROES',
  'SPACE', 'SPACES',
  'HIGH-VALUE', 'HIGH-VALUES',
  'LOW-VALUE', 'LOW-VALUES',
  'QUOTE', 'QUOTES',
  'NULL', 'NULLS',
  'ALL',
]);

// USAGE type mappings
export const UsageTypes = new Map([
  ['COMP', 'COMP'],
  ['COMP-1', 'COMP-1'],
  ['COMP-2', 'COMP-2'],
  ['COMP-3', 'COMP-3'],
  ['COMP-4', 'COMP-4'],
  ['COMP-5', 'COMP-5'],
  ['COMPUTATIONAL', 'COMP'],
  ['COMPUTATIONAL-1', 'COMP-1'],
  ['COMPUTATIONAL-2', 'COMP-2'],
  ['COMPUTATIONAL-3', 'COMP-3'],
  ['COMPUTATIONAL-4', 'COMP-4'],
  ['COMPUTATIONAL-5', 'COMP-5'],
  ['BINARY', 'BINARY'],
  ['PACKED-DECIMAL', 'COMP-3'],
  ['INDEX', 'INDEX'],
  ['DISPLAY', 'DISPLAY'],
  ['POINTER', 'POINTER'],
]);

/**
 * Token class representing a single token
 */
export class Token {
  constructor(type, value, line, column, position) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
    this.position = position;
  }

  toString() {
    return `Token(${this.type}, "${this.value}", line=${this.line}, col=${this.column})`;
  }

  is(type) {
    return this.type === type;
  }

  isOneOf(...types) {
    return types.includes(this.type);
  }

  isKeyword() {
    return Keywords.has(this.value.toUpperCase());
  }

  isLevelNumber() {
    if (this.type !== TokenType.NUMERIC_LITERAL) return false;
    const num = parseInt(this.value, 10);
    return ValidLevelNumbers.has(num);
  }

  isFigurativeConstant() {
    return FigurativeConstants.has(this.value.toUpperCase());
  }
}

export default {
  TokenType,
  Keywords,
  ValidLevelNumbers,
  FigurativeConstants,
  UsageTypes,
  Token,
};
