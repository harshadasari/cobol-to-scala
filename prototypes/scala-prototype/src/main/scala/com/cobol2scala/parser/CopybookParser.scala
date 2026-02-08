package com.cobol2scala.parser

import scala.collection.mutable.ListBuffer

/**
 * Parser for COBOL copybooks (DATA DIVISION structures).
 *
 * Parses a flat list of data items with level numbers into a
 * hierarchical structure.
 */
class CopybookParser(tokens: List[Located[Token]]):
  private var pos = 0

  def parse(): Either[String, Copybook] =
    try
      val items = parseDataItems()
      val hierarchy = buildHierarchy(items)
      Right(Copybook(None, hierarchy))
    catch
      case e: Exception => Left(e.getMessage)

  /**
   * Parse all data items from the token stream.
   */
  private def parseDataItems(): List[DataItem] =
    val items = ListBuffer[DataItem]()

    while !isAtEnd && !isEndOfSection do
      peek.value match
        case Token.LevelNumber(_) =>
          items += parseDataItem()
        case Token.Period =>
          advance()  // Skip stray periods
        case _ =>
          advance()  // Skip unknown tokens

    items.toList

  /**
   * Parse a single data item.
   */
  private def parseDataItem(): DataItem =
    val levelToken = expect[Token.LevelNumber]("level number")
    val level = levelToken match
      case Token.LevelNumber(n) => n
      case _ => throw new RuntimeException("Expected level number")

    // Parse name or FILLER
    val name: Option[String] = peek.value match
      case Token.Identifier(n) =>
        advance()
        Some(n)
      case Token.FILLER =>
        advance()
        None
      case Token.PIC | Token.PICTURE =>
        None  // Anonymous item
      case _ =>
        None

    // Parse clauses
    var pic: Option[PicClause] = None
    var usage: Usage = Usage.Display
    var value: Option[LiteralValue] = None
    var occurs: Option[OccursClause] = None
    var redefines: Option[String] = None
    var renames: Option[RenamesClause] = None
    val conditions = ListBuffer[Level88]()

    // Parse until period
    while !isAtEnd && peek.value != Token.Period do
      peek.value match
        case Token.PIC | Token.PICTURE =>
          advance()
          pic = Some(parsePicClause())

        case Token.USAGE =>
          advance()
          // Optional IS
          if peek.value == Token.Identifier("IS") then advance()
          usage = parseUsage()

        case Token.COMP =>
          usage = Usage.Comp
          advance()

        case Token.COMP_1 =>
          usage = Usage.Comp1
          advance()

        case Token.COMP_2 =>
          usage = Usage.Comp2
          advance()

        case Token.COMP_3 | Token.PACKED_DECIMAL =>
          usage = Usage.Comp3
          advance()

        case Token.COMP_4 | Token.BINARY =>
          usage = Usage.Comp
          advance()

        case Token.COMP_5 =>
          usage = Usage.Comp5
          advance()

        case Token.VALUE | Token.VALUES =>
          advance()
          // Optional IS/ARE
          if peek.value == Token.Identifier("IS") || peek.value == Token.Identifier("ARE") then
            advance()
          value = Some(parseLiteral())

        case Token.OCCURS =>
          advance()
          occurs = Some(parseOccurs())

        case Token.REDEFINES =>
          advance()
          redefines = Some(expectIdentifier("field name"))

        case Token.RENAMES =>
          advance()
          val from = expectIdentifier("field name")
          val to = if peek.value == Token.THRU || peek.value == Token.THROUGH then
            advance()
            Some(expectIdentifier("field name"))
          else None
          renames = Some(RenamesClause(from, to))

        case _ =>
          advance()  // Skip unknown clause

    // Consume period
    if peek.value == Token.Period then advance()

    // Parse level 88 conditions that follow
    while !isAtEnd && peek.value == Token.LevelNumber(88) do
      conditions += parseLevel88()

    DataItem(
      level = level,
      name = name,
      pic = pic,
      usage = usage,
      value = value,
      occurs = occurs,
      redefines = redefines,
      renames = renames,
      conditions = conditions.toList
    )

  /**
   * Parse a PIC clause pattern into a PicClause.
   */
  private def parsePicClause(): PicClause =
    val pattern = peek.value match
      case Token.PicString(p) =>
        advance()
        p
      case Token.Identifier(p) =>
        advance()
        p
      case _ =>
        throw new RuntimeException(s"Expected PIC pattern, got ${peek.value}")

    parsePicPattern(pattern)

  /**
   * Parse a PIC pattern string into semantic information.
   */
  private def parsePicPattern(pattern: String): PicClause =
    var totalDigits = 0
    var decimalDigits = 0
    var signed = false
    var afterDecimal = false
    var isEdited = false
    var dataType: PicType = PicType.Alphanumeric

    var i = 0
    while i < pattern.length do
      val ch = pattern.charAt(i).toUpper

      ch match
        case 'S' =>
          signed = true
          i += 1

        case 'V' =>
          afterDecimal = true
          i += 1

        case '9' =>
          dataType = PicType.Numeric
          val count = parseRepetition(pattern, i)
          if afterDecimal then decimalDigits += count else totalDigits += count
          i = skipRepetition(pattern, i)

        case 'X' =>
          dataType = PicType.Alphanumeric
          val count = parseRepetition(pattern, i)
          totalDigits += count
          i = skipRepetition(pattern, i)

        case 'A' =>
          dataType = PicType.Alphabetic
          val count = parseRepetition(pattern, i)
          totalDigits += count
          i = skipRepetition(pattern, i)

        case 'Z' | '$' | '*' | '+' | '-' | 'B' | '0' | '/' | '.' | ',' =>
          isEdited = true
          dataType = if dataType == PicType.Alphanumeric then
            PicType.AlphanumericEdited
          else
            PicType.NumericEdited
          val count = parseRepetition(pattern, i)
          totalDigits += count
          i = skipRepetition(pattern, i)

        case 'P' =>
          // Assumed decimal position
          val count = parseRepetition(pattern, i)
          if afterDecimal then decimalDigits += count else totalDigits += count
          i = skipRepetition(pattern, i)

        case '(' =>
          // Skip - handled by parseRepetition
          i += 1

        case ')' =>
          i += 1

        case _ if ch.isDigit =>
          // Part of repetition count
          while i < pattern.length && pattern.charAt(i).isDigit do i += 1

        case _ =>
          i += 1

    // Add decimal digits to total
    totalDigits += decimalDigits

    PicClause(
      dataType = dataType,
      totalDigits = totalDigits,
      decimalDigits = decimalDigits,
      signed = signed,
      isEdited = isEdited,
      rawPattern = pattern
    )

  /**
   * Parse repetition count from PIC pattern.
   * E.g., "9(5)" returns 5, "999" counts individual 9s.
   */
  private def parseRepetition(pattern: String, start: Int): Int =
    val ch = pattern.charAt(start)
    var i = start + 1

    if i < pattern.length && pattern.charAt(i) == '(' then
      // Parenthesized count: X(10)
      i += 1
      val numStart = i
      while i < pattern.length && pattern.charAt(i).isDigit do i += 1
      if numStart < i then
        pattern.substring(numStart, i).toInt
      else
        1
    else
      // Count consecutive same characters: XXX = 3
      var count = 1
      while i < pattern.length && pattern.charAt(i).toUpper == ch.toUpper do
        count += 1
        i += 1
      count

  private def skipRepetition(pattern: String, start: Int): Int =
    val ch = pattern.charAt(start)
    var i = start + 1

    if i < pattern.length && pattern.charAt(i) == '(' then
      while i < pattern.length && pattern.charAt(i) != ')' do i += 1
      if i < pattern.length then i + 1 else i
    else
      while i < pattern.length && pattern.charAt(i).toUpper == ch.toUpper do i += 1
      i

  /**
   * Parse USAGE clause value.
   */
  private def parseUsage(): Usage =
    peek.value match
      case Token.COMP | Token.BINARY => advance(); Usage.Comp
      case Token.COMP_1 => advance(); Usage.Comp1
      case Token.COMP_2 => advance(); Usage.Comp2
      case Token.COMP_3 | Token.PACKED_DECIMAL => advance(); Usage.Comp3
      case Token.COMP_5 => advance(); Usage.Comp5
      case Token.DISPLAY => advance(); Usage.Display
      case Token.Identifier("INDEX") => advance(); Usage.Index
      case _ => Usage.Display

  /**
   * Parse OCCURS clause.
   */
  private def parseOccurs(): OccursClause =
    val times = expectInteger("occurrence count")

    var dependingOn: Option[String] = None
    var minTimes: Option[Int] = None
    val indexedBy = ListBuffer[String]()
    val keys = ListBuffer[OccursKey]()

    // Optional TIMES keyword
    if peek.value == Token.TIMES then advance()

    // Parse additional clauses
    var continue = true
    while continue && !isAtEnd && peek.value != Token.Period do
      peek.value match
        case Token.TO =>
          // OCCURS min TO max - we already have min, now get max
          advance()
          minTimes = Some(times)
          val maxTimes = expectInteger("maximum occurrences")
          if peek.value == Token.TIMES then advance()
          // Return with new times
          return parseOccursContinuation(maxTimes, minTimes, indexedBy, keys)

        case Token.DEPENDING =>
          advance()
          if peek.value == Token.ON then advance()
          dependingOn = Some(expectIdentifier("field name"))

        case Token.INDEXED =>
          advance()
          if peek.value == Token.BY then advance()
          while peek.value.isInstanceOf[Token.Identifier] do
            val Token.Identifier(name) = peek.value: @unchecked
            indexedBy += name
            advance()

        case Token.Identifier("ASCENDING") | Token.Identifier("DESCENDING") =>
          val ascending = peek.value == Token.Identifier("ASCENDING")
          advance()
          if peek.value == Token.KEY then advance()
          if peek.value == Token.Identifier("IS") then advance()
          keys += OccursKey(ascending, expectIdentifier("key field"))

        case _ =>
          continue = false

    OccursClause(times, dependingOn, minTimes, indexedBy.toList, keys.toList)

  private def parseOccursContinuation(
    times: Int,
    minTimes: Option[Int],
    indexedBy: ListBuffer[String],
    keys: ListBuffer[OccursKey]
  ): OccursClause =
    var dependingOn: Option[String] = None

    var continue = true
    while continue && !isAtEnd && peek.value != Token.Period do
      peek.value match
        case Token.DEPENDING =>
          advance()
          if peek.value == Token.ON then advance()
          dependingOn = Some(expectIdentifier("field name"))

        case Token.INDEXED =>
          advance()
          if peek.value == Token.BY then advance()
          while peek.value.isInstanceOf[Token.Identifier] do
            val Token.Identifier(name) = peek.value: @unchecked
            indexedBy += name
            advance()

        case _ =>
          continue = false

    OccursClause(times, dependingOn, minTimes, indexedBy.toList, keys.toList)

  /**
   * Parse a level 88 condition.
   */
  private def parseLevel88(): Level88 =
    expect[Token.LevelNumber]("88")
    val name = expectIdentifier("condition name")

    // VALUE/VALUES IS/ARE
    if peek.value == Token.VALUE || peek.value == Token.VALUES then advance()
    if peek.value == Token.Identifier("IS") || peek.value == Token.Identifier("ARE") then advance()

    val values = parseConditionValues()

    if peek.value == Token.Period then advance()

    Level88(name, ConditionValue(values))

  /**
   * Parse condition values (single values and ranges).
   */
  private def parseConditionValues(): List[ConditionValueItem] =
    val items = ListBuffer[ConditionValueItem]()

    var continue = true
    while continue && !isAtEnd && peek.value != Token.Period do
      val first = parseLiteral()

      if peek.value == Token.THRU || peek.value == Token.THROUGH then
        advance()
        val second = parseLiteral()
        items += ConditionValueItem.Range(first, second)
      else
        items += ConditionValueItem.Single(first)

      // Check for more values
      peek.value match
        case Token.StringLiteral(_) | Token.IntegerLiteral(_) | Token.DecimalLiteral(_) =>
          // Continue
        case Token.Identifier("ZERO") | Token.Identifier("ZEROS") |
             Token.Identifier("SPACE") | Token.Identifier("SPACES") |
             Token.Identifier("HIGH-VALUE") | Token.Identifier("HIGH-VALUES") |
             Token.Identifier("LOW-VALUE") | Token.Identifier("LOW-VALUES") =>
          // Continue
        case _ =>
          continue = false

    items.toList

  /**
   * Parse a literal value.
   */
  private def parseLiteral(): LiteralValue =
    peek.value match
      case Token.StringLiteral(s) =>
        advance()
        LiteralValue.StringLit(s)

      case Token.IntegerLiteral(n) =>
        advance()
        LiteralValue.NumericLit(BigDecimal(n))

      case Token.DecimalLiteral(n) =>
        advance()
        LiteralValue.NumericLit(n)

      case Token.Identifier(name) =>
        advance()
        name.toUpperCase match
          case "ZERO" | "ZEROS" | "ZEROES" => LiteralValue.FigurativeConstant("ZERO")
          case "SPACE" | "SPACES" => LiteralValue.FigurativeConstant("SPACE")
          case "HIGH-VALUE" | "HIGH-VALUES" => LiteralValue.FigurativeConstant("HIGH-VALUE")
          case "LOW-VALUE" | "LOW-VALUES" => LiteralValue.FigurativeConstant("LOW-VALUE")
          case "QUOTE" | "QUOTES" => LiteralValue.FigurativeConstant("QUOTE")
          case "NULL" | "NULLS" => LiteralValue.FigurativeConstant("NULL")
          case "ALL" =>
            val lit = parseLiteral()
            LiteralValue.FigurativeConstant(s"ALL $lit")
          case _ => LiteralValue.StringLit(name)

      case _ =>
        throw new RuntimeException(s"Expected literal, got ${peek.value}")

  /**
   * Build hierarchical structure from flat list of data items.
   */
  private def buildHierarchy(items: List[DataItem]): List[DataItem] =
    if items.isEmpty then return Nil

    val result = ListBuffer[DataItem]()
    var i = 0

    while i < items.length do
      val item = items(i)

      if item.level == 1 || item.level == 77 then
        // Top-level item - collect children
        val (withChildren, nextIdx) = collectChildren(items, i)
        result += withChildren
        i = nextIdx
      else
        // Orphan item (shouldn't happen in well-formed COBOL)
        result += item
        i += 1

    result.toList

  /**
   * Collect children for a group item.
   */
  private def collectChildren(items: List[DataItem], startIdx: Int): (DataItem, Int) =
    val parent = items(startIdx)
    val children = ListBuffer[DataItem]()
    var i = startIdx + 1

    while i < items.length do
      val item = items(i)

      // Items with higher level numbers are children (subordinate)
      // Level 66, 77, 88 are special
      if item.level <= parent.level && item.level != 66 && item.level != 88 then
        // Same or lower level - sibling or parent's sibling
        return (parent.copy(children = children.toList), i)
      else if item.level == 66 || item.level == 88 then
        // Special levels - add as children
        children += item
        i += 1
      else
        // Subordinate item - recursively collect its children
        val (withChildren, nextIdx) = collectChildren(items, i)
        children += withChildren
        i = nextIdx

    (parent.copy(children = children.toList), i)

  // Helper methods
  private def peek: Located[Token] =
    if pos < tokens.length then tokens(pos)
    else Located(Token.EOF, Position(0, 0), Position(0, 0))

  private def advance(): Located[Token] =
    val current = peek
    pos += 1
    current

  private def isAtEnd: Boolean = pos >= tokens.length || peek.value == Token.EOF

  private def isEndOfSection: Boolean =
    peek.value match
      case Token.PROCEDURE | Token.IDENTIFICATION | Token.ENVIRONMENT =>
        true
      case _ => false

  private def expect[T <: Token](expected: String)(using ev: T <:< Token): Token =
    val token = peek.value
    advance()
    token

  private def expectIdentifier(context: String): String =
    peek.value match
      case Token.Identifier(name) =>
        advance()
        name
      case other =>
        throw new RuntimeException(s"Expected identifier for $context, got $other")

  private def expectInteger(context: String): Int =
    peek.value match
      case Token.IntegerLiteral(n) =>
        advance()
        n.toInt
      case other =>
        throw new RuntimeException(s"Expected integer for $context, got $other")

object CopybookParser:
  def parse(source: String): Either[String, Copybook] =
    val tokens = Lexer.tokenize(source)
    CopybookParser(tokens).parse()

  def parseFile(path: String): Either[String, Copybook] =
    val source = scala.io.Source.fromFile(path).mkString
    parse(source)
