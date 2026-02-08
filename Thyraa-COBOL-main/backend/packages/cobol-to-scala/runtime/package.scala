package com.thyraa.cobol

/**
 * Package object providing COBOL runtime utilities and type aliases.
 */
package object runtime:
  // Type aliases for common COBOL types

  /** Unsigned integer numeric (PIC 9(n)) */
  type Pic9 = Int

  /** Long unsigned integer numeric (PIC 9(n) for n > 9) */
  type Pic9Long = Long

  /** Signed numeric with decimals (PIC S9(n)V9(m)) */
  type PicS9V = BigDecimal

  /** Fixed-length alphanumeric (PIC X(n)) */
  type PicX = FixedString

  /** Packed decimal (COMP-3) */
  type Comp3 = BigDecimal

  /** Binary numeric (COMP / COMP-4) */
  type Comp = Int

  /** Binary long (COMP / COMP-4 for large values) */
  type CompLong = Long

  /** Native binary (COMP-5) */
  type Comp5 = Int

  // Extension methods for String to support COBOL semantics
  extension (s: String)
    /**
     * Convert string to fixed-length FixedString.
     */
    def toFixedString(length: Int): FixedString = FixedString(s, length)

    /**
     * Check if string contains only numeric characters (COBOL NUMERIC test).
     */
    def isNumeric: Boolean =
      val trimmed = s.trim
      if trimmed.isEmpty then false
      else
        val startIdx = if trimmed.headOption.exists(c => c == '+' || c == '-') then 1 else 0
        var hasDecimal = false
        var idx = startIdx
        while idx < trimmed.length do
          val c = trimmed(idx)
          if c == '.' then
            if hasDecimal then return false // Multiple decimals
            hasDecimal = true
          else if !c.isDigit then
            return false
          idx += 1
        end while
        idx > startIdx // At least one character after optional sign

    /**
     * Check if string contains only alphabetic characters (COBOL ALPHABETIC test).
     */
    def isAlphabetic: Boolean =
      s.forall(c => c.isLetter || c == ' ')

    /**
     * Check if string contains only alphabetic uppercase (COBOL ALPHABETIC-UPPER test).
     */
    def isAlphabeticUpper: Boolean =
      s.forall(c => (c.isLetter && c.isUpper) || c == ' ')

    /**
     * Check if string contains only alphabetic lowercase (COBOL ALPHABETIC-LOWER test).
     */
    def isAlphabeticLower: Boolean =
      s.forall(c => (c.isLetter && c.isLower) || c == ' ')

    /**
     * Parse string as numeric value.
     */
    def numericValue: BigDecimal =
      val trimmed = s.trim
      if trimmed.isEmpty then BigDecimal(0)
      else BigDecimal(trimmed)

    /**
     * Convert to uppercase (COBOL FUNCTION UPPER-CASE).
     */
    def toUpperCase: String = s.toUpperCase

    /**
     * Convert to lowercase (COBOL FUNCTION LOWER-CASE).
     */
    def toLowerCase: String = s.toLowerCase

    /**
     * Get length (COBOL FUNCTION LENGTH).
     */
    def cobolLength: Int = s.length

    /**
     * INSPECT TALLYING - count occurrences.
     */
    def countOccurrences(target: String): Int =
      if target.isEmpty then 0
      else
        var count = 0
        var idx = 0
        while idx <= s.length - target.length do
          if s.substring(idx, idx + target.length) == target then
            count += 1
            idx += target.length
          else
            idx += 1
        end while
        count

    /**
     * INSPECT REPLACING - replace occurrences.
     */
    def replaceAll(from: String, to: String): String =
      s.replace(from, to)

    /**
     * STRING ... DELIMITED BY.
     */
    def delimitedBy(delimiter: String): String =
      val idx = s.indexOf(delimiter)
      if idx < 0 then s else s.substring(0, idx)

  // Extension methods for Int
  extension (i: Int)
    /**
     * Format integer to display format with leading zeros.
     */
    def toDisplay(digits: Int): String =
      val absValue = math.abs(i)
      val formatted = s"%0${digits}d".format(absValue)
      if i < 0 then "-" + formatted else formatted

    /**
     * Convert to BigDecimal for arithmetic.
     */
    def toBigDecimal: BigDecimal = BigDecimal(i)

  // Extension methods for Long
  extension (l: Long)
    /**
     * Format long to display format with leading zeros.
     */
    def toDisplay(digits: Int): String =
      val absValue = math.abs(l)
      val formatted = s"%0${digits}d".format(absValue)
      if l < 0 then "-" + formatted else formatted

    /**
     * Convert to BigDecimal for arithmetic.
     */
    def toBigDecimal: BigDecimal = BigDecimal(l)

  // Extension methods for BigDecimal
  extension (bd: BigDecimal)
    /**
     * Format BigDecimal to COBOL display format.
     * @param totalDigits Total number of digits (before and after decimal)
     * @param decimals Number of decimal places
     */
    def toCobol(totalDigits: Int, decimals: Int): String =
      val scaled = bd.setScale(decimals, BigDecimal.RoundingMode.HALF_EVEN)
      val isNegative = scaled < 0
      val absValue = scaled.abs

      // Get integer and decimal parts
      val scaledUp = (absValue * BigDecimal(10).pow(decimals)).toBigInt
      val integerDigits = totalDigits - decimals
      val formatted = scaledUp.toString.reverse.padTo(totalDigits, '0').reverse

      // Insert decimal point if needed
      val withDecimal = if decimals > 0 then
        formatted.substring(0, integerDigits) + "." + formatted.substring(integerDigits)
      else
        formatted

      if isNegative then "-" + withDecimal else withDecimal

    /**
     * Format with sign (COBOL SIGN LEADING SEPARATE).
     */
    def toCobolSigned(totalDigits: Int, decimals: Int): String =
      val sign = if bd < 0 then "-" else "+"
      sign + bd.abs.toCobol(totalDigits, decimals)

    /**
     * Round to specified scale using COBOL rounding rules.
     */
    def roundCobol(scale: Int): BigDecimal =
      bd.setScale(scale, BigDecimal.RoundingMode.HALF_EVEN)

    /**
     * Truncate to specified scale (no rounding).
     */
    def truncateCobol(scale: Int): BigDecimal =
      bd.setScale(scale, BigDecimal.RoundingMode.DOWN)

  // COBOL special values
  val ZEROES: String = "0"
  val ZEROS: String = "0"
  val SPACES: String = " "
  val SPACE: String = " "
  val LOW_VALUES: Char = '\u0000'
  val HIGH_VALUES: Char = '\u00FF'
  val QUOTES: String = "\""
  val QUOTE: String = "\""

  /**
   * Fill a string with a character to specified length.
   */
  def fill(char: Char, length: Int): String = char.toString * length

  /**
   * Create spaces of specified length.
   */
  def spaces(length: Int): String = " " * length

  /**
   * Create zeros of specified length.
   */
  def zeros(length: Int): String = "0" * length

  /**
   * COBOL MOVE semantics - right-justify numeric, left-justify alphanumeric.
   */
  def moveNumeric(value: String, length: Int): String =
    val trimmed = value.trim
    if trimmed.length >= length then trimmed.takeRight(length)
    else ("0" * (length - trimmed.length)) + trimmed

  def moveAlphanumeric(value: String, length: Int): String =
    if value.length >= length then value.take(length)
    else value + (" " * (length - value.length))

  /**
   * COBOL CORRESPONDING move - copies fields with matching names.
   */
  def moveCorresponding[A, B](source: A, target: B)(using
    sourceFields: Map[String, Any],
    targetFields: Map[String, Any]
  ): B =
    // This would require reflection or macros for full implementation
    // Placeholder for now
    target

  /**
   * Reference modification (COBOL substring).
   * @param s The source string
   * @param start 1-based start position
   * @param length Number of characters (optional)
   */
  def refMod(s: String, start: Int, length: Option[Int] = None): String =
    val startIdx = math.max(0, start - 1)
    length match
      case Some(len) => s.slice(startIdx, startIdx + len)
      case None => s.drop(startIdx)

  /**
   * COBOL EVALUATE helper.
   */
  def evaluate[T, R](value: T)(cases: (T => Boolean, R)*)(other: => R): R =
    cases.find((predicate, _) => predicate(value)) match
      case Some((_, result)) => result
      case None => other

  /**
   * COBOL PERFORM UNTIL helper.
   */
  inline def performUntil(condition: => Boolean)(body: => Unit): Unit =
    while !condition do body

  /**
   * COBOL PERFORM TIMES helper.
   */
  inline def performTimes(times: Int)(body: => Unit): Unit =
    var i = 0
    while i < times do
      body
      i += 1

  /**
   * COBOL PERFORM VARYING helper.
   */
  def performVarying(from: Int, by: Int, until: Int => Boolean)(body: Int => Unit): Unit =
    var i = from
    while !until(i) do
      body(i)
      i += by

  /**
   * COBOL ACCEPT DATE.
   */
  def acceptDate(): String =
    val now = java.time.LocalDate.now()
    f"${now.getYear}%04d${now.getMonthValue}%02d${now.getDayOfMonth}%02d"

  /**
   * COBOL ACCEPT TIME.
   */
  def acceptTime(): String =
    val now = java.time.LocalTime.now()
    f"${now.getHour}%02d${now.getMinute}%02d${now.getSecond}%02d${now.getNano / 10000000}%02d"

  /**
   * COBOL ACCEPT DAY (Julian date YYDDD).
   */
  def acceptDay(): String =
    val now = java.time.LocalDate.now()
    f"${now.getYear % 100}%02d${now.getDayOfYear}%03d"

  /**
   * COBOL ACCEPT DAY-OF-WEEK (1=Monday, 7=Sunday).
   */
  def acceptDayOfWeek(): Int =
    java.time.LocalDate.now().getDayOfWeek.getValue

  /**
   * COBOL FUNCTION CURRENT-DATE (21 characters: YYYYMMDDHHMMSSssZZZZZ).
   */
  def currentDate(): String =
    val now = java.time.ZonedDateTime.now()
    val offset = now.getOffset
    val offsetHours = offset.getTotalSeconds / 3600
    val offsetMins = (offset.getTotalSeconds % 3600) / 60
    f"${now.getYear}%04d${now.getMonthValue}%02d${now.getDayOfMonth}%02d" +
      f"${now.getHour}%02d${now.getMinute}%02d${now.getSecond}%02d${now.getNano / 10000000}%02d" +
      f"${if offsetHours >= 0 then "+" else "-"}${math.abs(offsetHours)}%02d${math.abs(offsetMins)}%02d"

  /**
   * COBOL FUNCTION INTEGER-OF-DATE.
   */
  def integerOfDate(yyyymmdd: Int): Int =
    val year = yyyymmdd / 10000
    val month = (yyyymmdd / 100) % 100
    val day = yyyymmdd % 100
    val date = java.time.LocalDate.of(year, month, day)
    date.toEpochDay.toInt + 1 // COBOL uses 1 as day 1

  /**
   * COBOL FUNCTION DATE-OF-INTEGER.
   */
  def dateOfInteger(days: Int): Int =
    val date = java.time.LocalDate.ofEpochDay(days - 1L)
    date.getYear * 10000 + date.getMonthValue * 100 + date.getDayOfMonth
