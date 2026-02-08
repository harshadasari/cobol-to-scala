package com.cobol2scala.parser

import scala.collection.mutable.ListBuffer

/**
 * COBOL Lexer - converts source text to tokens.
 *
 * Handles COBOL's unique fixed-format structure:
 * - Columns 1-6: Sequence numbers (ignored)
 * - Column 7: Indicator (* = comment, - = continuation, D = debug)
 * - Columns 8-11: Area A
 * - Columns 12-72: Area B
 * - Columns 73-80: Identification (ignored)
 */
class Lexer(source: String):
  private var pos = 0
  private var line = 1
  private var column = 1
  private var inPicClause = false  // Special handling for PIC patterns

  // Preprocessed source with continuations joined
  private val lines: Array[String] = preprocessSource(source)
  private var lineIndex = 0
  private var currentLine: String = if lines.nonEmpty then lines(0) else ""

  /**
   * Preprocess source: join continuation lines and strip columns.
   */
  private def preprocessSource(src: String): Array[String] =
    val rawLines = src.split("\n", -1)
    val result = ListBuffer[String]()
    var i = 0

    while i < rawLines.length do
      val rawLine = rawLines(i)

      // Skip empty lines
      if rawLine.length < 7 then
        result += ""
        i += 1
      else
        val indicator = if rawLine.length > 6 then rawLine.charAt(6) else ' '

        indicator match
          case '*' | '/' =>
            // Comment line - skip entirely
            result += ""
            i += 1

          case 'D' | 'd' =>
            // Debug line - treat as comment for now
            result += ""
            i += 1

          case '-' =>
            // Continuation line - append to previous
            if result.nonEmpty then
              val continued = extractCode(rawLine)
              // Find the continuation point (first non-space or quote)
              val contText = continued.dropWhile(_ == ' ')
              // Remove trailing content from previous line and append
              val prev = result.last.stripTrailing
              result(result.length - 1) = prev + contText
            i += 1

          case _ =>
            // Normal line - extract columns 8-72
            val code = extractCode(rawLine)
            result += code
            i += 1

    result.toArray

  /**
   * Extract code area (columns 8-72) from a COBOL line.
   */
  private def extractCode(line: String): String =
    if line.length <= 7 then ""
    else
      val start = 7  // Column 8 (0-indexed = 7)
      val end = math.min(72, line.length)  // Column 72
      line.substring(start, end)

  /**
   * Tokenize the entire source.
   */
  def tokenize(): List[Located[Token]] =
    val tokens = ListBuffer[Located[Token]]()
    var continue = true

    while continue do
      val token = nextToken()
      tokens += token
      if token.value == Token.EOF then continue = false

    tokens.toList

  /**
   * Get the next token from the source.
   */
  def nextToken(): Located[Token] =
    skipWhitespace()

    if lineIndex >= lines.length then
      return Located(Token.EOF, Position(line, column), Position(line, column))

    if pos >= currentLine.length then
      // End of current line
      advanceLine()
      return nextToken()

    val startPos = Position(line, column)
    val ch = currentLine.charAt(pos)

    val token: Token = ch match
      case '.' =>
        advance()
        Token.Period

      case ',' =>
        advance()
        Token.Comma

      case '(' =>
        advance()
        Token.LeftParen

      case ')' =>
        advance()
        Token.RightParen

      case ':' =>
        advance()
        Token.Colon

      case '+' =>
        advance()
        Token.Plus

      case '-' =>
        // Could be minus or part of identifier
        if pos + 1 < currentLine.length && currentLine.charAt(pos + 1).isDigit then
          readNumber()
        else
          advance()
          Token.Minus

      case '*' =>
        advance()
        if pos < currentLine.length && currentLine.charAt(pos) == '*' then
          advance()
          Token.DoubleStar
        else
          Token.Asterisk

      case '/' =>
        advance()
        Token.Slash

      case '=' =>
        advance()
        Token.EqualSign

      case '>' =>
        advance()
        if pos < currentLine.length && currentLine.charAt(pos) == '=' then
          advance()
          Token.GreaterOrEqual
        else
          Token.GreaterThan

      case '<' =>
        advance()
        if pos < currentLine.length && currentLine.charAt(pos) == '=' then
          advance()
          Token.LessOrEqual
        else if pos < currentLine.length && currentLine.charAt(pos) == '>' then
          advance()
          Token.NotEqual
        else
          Token.LessThan

      case '"' | '\'' =>
        readString(ch)

      case _ if ch.isDigit =>
        readNumberOrLevel()

      case _ if ch.isLetter =>
        readIdentifierOrKeyword()

      case _ =>
        advance()
        Token.Error(s"Unexpected character: $ch")

    val endPos = Position(line, column)
    Located(token, startPos, endPos)

  /**
   * Read a number or level number.
   */
  private def readNumberOrLevel(): Token =
    val start = pos
    while pos < currentLine.length && (currentLine.charAt(pos).isDigit || currentLine.charAt(pos) == '.') do
      advance()

    val text = currentLine.substring(start, pos)

    // Check if followed by whitespace and is a valid level number
    val isAtBoundary = pos >= currentLine.length || !currentLine.charAt(pos).isLetterOrDigit

    if isAtBoundary then
      Token.isLevelNumber(text) match
        case Some(level) => Token.LevelNumber(level)
        case None =>
          if text.contains('.') then
            Token.DecimalLiteral(BigDecimal(text))
          else
            Token.IntegerLiteral(text.toLong)
    else
      if text.contains('.') then
        Token.DecimalLiteral(BigDecimal(text))
      else
        Token.IntegerLiteral(text.toLong)

  /**
   * Read a number (possibly signed or decimal).
   */
  private def readNumber(): Token =
    val start = pos
    if currentLine.charAt(pos) == '-' || currentLine.charAt(pos) == '+' then
      advance()

    while pos < currentLine.length && currentLine.charAt(pos).isDigit do
      advance()

    if pos < currentLine.length && currentLine.charAt(pos) == '.' then
      advance()
      while pos < currentLine.length && currentLine.charAt(pos).isDigit do
        advance()
      Token.DecimalLiteral(BigDecimal(currentLine.substring(start, pos)))
    else
      Token.IntegerLiteral(currentLine.substring(start, pos).toLong)

  /**
   * Read a string literal (single or double quoted).
   */
  private def readString(quote: Char): Token =
    advance()  // Skip opening quote
    val sb = StringBuilder()

    while pos < currentLine.length && currentLine.charAt(pos) != quote do
      if currentLine.charAt(pos) == quote then
        // Check for escaped quote (doubled)
        if pos + 1 < currentLine.length && currentLine.charAt(pos + 1) == quote then
          sb.append(quote)
          advance()
          advance()
        else
          // End of string - will exit loop
          ()
      else
        sb.append(currentLine.charAt(pos))
        advance()

    if pos < currentLine.length then
      advance()  // Skip closing quote

    Token.StringLiteral(sb.toString)

  /**
   * Read an identifier or keyword.
   * COBOL identifiers can contain hyphens.
   */
  private def readIdentifierOrKeyword(): Token =
    val start = pos

    // First character must be letter
    while pos < currentLine.length &&
          (currentLine.charAt(pos).isLetterOrDigit || currentLine.charAt(pos) == '-') do
      advance()

    // Don't end with hyphen
    while pos > start && currentLine.charAt(pos - 1) == '-' do
      pos -= 1
      column -= 1

    val text = currentLine.substring(start, pos).toUpperCase

    // Check if this is after PIC/PICTURE - handle specially
    if inPicClause then
      inPicClause = false
      return readPicPattern(start)

    // Check for PIC/PICTURE keyword
    if text == "PIC" || text == "PICTURE" then
      inPicClause = true
      return Token.keywords.getOrElse(text, Token.Identifier(text))

    // Check for level number (standalone digits)
    Token.isLevelNumber(text) match
      case Some(level) => Token.LevelNumber(level)
      case None =>
        // Check keywords
        Token.keywords.getOrElse(text, Token.Identifier(text))

  /**
   * Read a PIC pattern (special handling for PIC clause values).
   * PIC patterns can contain characters like X, 9, S, V, P, A, Z, $, etc.
   */
  private def readPicPattern(from: Int): Token =
    // Reset position and re-read as PIC pattern
    pos = from
    skipWhitespace()

    val start = pos
    var parenDepth = 0

    while pos < currentLine.length do
      val ch = currentLine.charAt(pos)
      if ch == '(' then parenDepth += 1
      else if ch == ')' then parenDepth -= 1

      // Stop at whitespace or period (unless in parens)
      if parenDepth == 0 && (ch == ' ' || ch == '.' || ch == '\t') then
        // Check if this looks like end of PIC
        if ch == '.' || (ch == ' ' && !isPicContinuation()) then
          val pattern = currentLine.substring(start, pos)
          return Token.PicString(pattern)

      advance()

    Token.PicString(currentLine.substring(start, pos))

  /**
   * Check if what follows looks like a PIC continuation.
   */
  private def isPicContinuation(): Boolean =
    val saved = pos
    skipWhitespace()
    val result = if pos < currentLine.length then
      val ch = currentLine.charAt(pos).toUpper
      ch == '(' || ch == '9' || ch == 'X' || ch == 'A' || ch == 'S' ||
      ch == 'V' || ch == 'P' || ch == 'Z' || ch == '$' || ch == '-' ||
      ch == '+' || ch == '*' || ch == 'B' || ch == '0' || ch == '/'
    else false
    pos = saved
    result

  private def advance(): Unit =
    pos += 1
    column += 1

  private def advanceLine(): Unit =
    lineIndex += 1
    line += 1
    column = 1
    pos = 0
    if lineIndex < lines.length then
      currentLine = lines(lineIndex)

  private def skipWhitespace(): Unit =
    while pos < currentLine.length && (currentLine.charAt(pos) == ' ' || currentLine.charAt(pos) == '\t') do
      advance()

object Lexer:
  def tokenize(source: String): List[Located[Token]] =
    Lexer(source).tokenize()

  def tokenizeFile(path: String): List[Located[Token]] =
    val source = scala.io.Source.fromFile(path).mkString
    tokenize(source)
