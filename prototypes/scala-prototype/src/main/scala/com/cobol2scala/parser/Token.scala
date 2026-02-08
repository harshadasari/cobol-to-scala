package com.cobol2scala.parser

/**
 * COBOL tokens produced by the lexer.
 *
 * COBOL has a fixed-format structure:
 * - Columns 1-6: Sequence numbers (ignored)
 * - Column 7: Indicator (*, /, -, D, or space)
 * - Columns 8-11: Area A (divisions, sections, paragraphs, 01/77 levels)
 * - Columns 12-72: Area B (statements, subordinate items)
 * - Columns 73-80: Identification (ignored)
 */

case class Position(line: Int, column: Int):
  override def toString: String = s"$line:$column"

case class Located[+A](value: A, start: Position, end: Position):
  def map[B](f: A => B): Located[B] = Located(f(value), start, end)

enum Token:
  // Keywords
  case IDENTIFICATION, DIVISION, ENVIRONMENT, DATA, PROCEDURE
  case WORKING_STORAGE, SECTION, FILE, LINKAGE, LOCAL_STORAGE
  case FD, SD, COPY, REPLACING
  case PIC, PICTURE, VALUE, VALUES
  case USAGE, COMP, COMP_1, COMP_2, COMP_3, COMP_4, COMP_5
  case BINARY, PACKED_DECIMAL, DISPLAY
  case OCCURS, TIMES, DEPENDING, ON, INDEXED, BY
  case REDEFINES, RENAMES, THRU, THROUGH
  case PERFORM, UNTIL, VARYING, FROM, AFTER, WITH, TEST, BEFORE
  case IF, THEN, ELSE, END_IF
  case EVALUATE, WHEN, OTHER, END_EVALUATE
  case MOVE, TO, CORRESPONDING
  case ADD, SUBTRACT, MULTIPLY, DIVIDE, COMPUTE, GIVING, REMAINDER
  case STRING, UNSTRING, DELIMITED, INTO, POINTER, OVERFLOW
  case INSPECT, TALLYING, REPLACING_KW, CONVERTING, ALL, LEADING, FIRST
  case READ, WRITE, REWRITE, DELETE, START, OPEN, CLOSE
  case INPUT, OUTPUT, I_O, EXTEND
  case AT, END, NOT, INVALID, KEY
  case CALL, USING, RETURNING, CANCEL, ENTRY
  case GO, STOP, RUN, GOBACK, EXIT, CONTINUE
  case ACCEPT, DISPLAY_VERB
  case INITIALIZE, SET, TRUE_KW, FALSE_KW
  case EXEC, SQL, CICS, END_EXEC
  case FILLER

  // Structural
  case Period
  case Comma
  case LeftParen
  case RightParen
  case Colon
  case EqualSign
  case GreaterThan
  case LessThan
  case GreaterOrEqual
  case LessOrEqual
  case NotEqual
  case Plus
  case Minus
  case Asterisk
  case Slash
  case DoubleStar // **

  // Literals and identifiers
  case Identifier(name: String)
  case IntegerLiteral(value: Long)
  case DecimalLiteral(value: BigDecimal)
  case StringLiteral(value: String)
  case PicString(pattern: String)  // Special handling for PIC patterns
  case LevelNumber(level: Int)     // 01-49, 66, 77, 88

  // Special
  case Newline
  case EOF
  case Error(message: String)

object Token:
  // Map of COBOL keywords to tokens
  val keywords: Map[String, Token] = Map(
    "IDENTIFICATION" -> Token.IDENTIFICATION,
    "DIVISION" -> Token.DIVISION,
    "ENVIRONMENT" -> Token.ENVIRONMENT,
    "DATA" -> Token.DATA,
    "PROCEDURE" -> Token.PROCEDURE,
    "WORKING-STORAGE" -> Token.WORKING_STORAGE,
    "SECTION" -> Token.SECTION,
    "FILE" -> Token.FILE,
    "LINKAGE" -> Token.LINKAGE,
    "LOCAL-STORAGE" -> Token.LOCAL_STORAGE,
    "FD" -> Token.FD,
    "SD" -> Token.SD,
    "COPY" -> Token.COPY,
    "REPLACING" -> Token.REPLACING,
    "PIC" -> Token.PIC,
    "PICTURE" -> Token.PICTURE,
    "VALUE" -> Token.VALUE,
    "VALUES" -> Token.VALUES,
    "USAGE" -> Token.USAGE,
    "COMP" -> Token.COMP,
    "COMPUTATIONAL" -> Token.COMP,
    "COMP-1" -> Token.COMP_1,
    "COMPUTATIONAL-1" -> Token.COMP_1,
    "COMP-2" -> Token.COMP_2,
    "COMPUTATIONAL-2" -> Token.COMP_2,
    "COMP-3" -> Token.COMP_3,
    "COMPUTATIONAL-3" -> Token.COMP_3,
    "COMP-4" -> Token.COMP_4,
    "COMPUTATIONAL-4" -> Token.COMP_4,
    "COMP-5" -> Token.COMP_5,
    "COMPUTATIONAL-5" -> Token.COMP_5,
    "BINARY" -> Token.BINARY,
    "PACKED-DECIMAL" -> Token.PACKED_DECIMAL,
    "DISPLAY" -> Token.DISPLAY,
    "OCCURS" -> Token.OCCURS,
    "TIMES" -> Token.TIMES,
    "DEPENDING" -> Token.DEPENDING,
    "ON" -> Token.ON,
    "INDEXED" -> Token.INDEXED,
    "BY" -> Token.BY,
    "REDEFINES" -> Token.REDEFINES,
    "RENAMES" -> Token.RENAMES,
    "THRU" -> Token.THRU,
    "THROUGH" -> Token.THROUGH,
    "PERFORM" -> Token.PERFORM,
    "UNTIL" -> Token.UNTIL,
    "VARYING" -> Token.VARYING,
    "FROM" -> Token.FROM,
    "AFTER" -> Token.AFTER,
    "WITH" -> Token.WITH,
    "TEST" -> Token.TEST,
    "BEFORE" -> Token.BEFORE,
    "IF" -> Token.IF,
    "THEN" -> Token.THEN,
    "ELSE" -> Token.ELSE,
    "END-IF" -> Token.END_IF,
    "EVALUATE" -> Token.EVALUATE,
    "WHEN" -> Token.WHEN,
    "OTHER" -> Token.OTHER,
    "END-EVALUATE" -> Token.END_EVALUATE,
    "MOVE" -> Token.MOVE,
    "TO" -> Token.TO,
    "CORRESPONDING" -> Token.CORRESPONDING,
    "CORR" -> Token.CORRESPONDING,
    "ADD" -> Token.ADD,
    "SUBTRACT" -> Token.SUBTRACT,
    "MULTIPLY" -> Token.MULTIPLY,
    "DIVIDE" -> Token.DIVIDE,
    "COMPUTE" -> Token.COMPUTE,
    "GIVING" -> Token.GIVING,
    "REMAINDER" -> Token.REMAINDER,
    "STRING" -> Token.STRING,
    "UNSTRING" -> Token.UNSTRING,
    "DELIMITED" -> Token.DELIMITED,
    "INTO" -> Token.INTO,
    "POINTER" -> Token.POINTER,
    "OVERFLOW" -> Token.OVERFLOW,
    "INSPECT" -> Token.INSPECT,
    "TALLYING" -> Token.TALLYING,
    "CONVERTING" -> Token.CONVERTING,
    "ALL" -> Token.ALL,
    "LEADING" -> Token.LEADING,
    "FIRST" -> Token.FIRST,
    "READ" -> Token.READ,
    "WRITE" -> Token.WRITE,
    "REWRITE" -> Token.REWRITE,
    "DELETE" -> Token.DELETE,
    "START" -> Token.START,
    "OPEN" -> Token.OPEN,
    "CLOSE" -> Token.CLOSE,
    "INPUT" -> Token.INPUT,
    "OUTPUT" -> Token.OUTPUT,
    "I-O" -> Token.I_O,
    "EXTEND" -> Token.EXTEND,
    "AT" -> Token.AT,
    "END" -> Token.END,
    "NOT" -> Token.NOT,
    "INVALID" -> Token.INVALID,
    "KEY" -> Token.KEY,
    "CALL" -> Token.CALL,
    "USING" -> Token.USING,
    "RETURNING" -> Token.RETURNING,
    "CANCEL" -> Token.CANCEL,
    "ENTRY" -> Token.ENTRY,
    "GO" -> Token.GO,
    "STOP" -> Token.STOP,
    "RUN" -> Token.RUN,
    "GOBACK" -> Token.GOBACK,
    "EXIT" -> Token.EXIT,
    "CONTINUE" -> Token.CONTINUE,
    "ACCEPT" -> Token.ACCEPT,
    "INITIALIZE" -> Token.INITIALIZE,
    "SET" -> Token.SET,
    "TRUE" -> Token.TRUE_KW,
    "FALSE" -> Token.FALSE_KW,
    "EXEC" -> Token.EXEC,
    "SQL" -> Token.SQL,
    "CICS" -> Token.CICS,
    "END-EXEC" -> Token.END_EXEC,
    "FILLER" -> Token.FILLER
  )

  def isLevelNumber(s: String): Option[Int] =
    s.toIntOption.filter(n =>
      (n >= 1 && n <= 49) || n == 66 || n == 77 || n == 88
    )
