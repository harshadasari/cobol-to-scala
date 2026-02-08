package com.thyraa.cobol.runtime

import scala.util.{Try, Success, Failure}

// Packed Decimal (COMP-3) - 2 digits per byte, sign in low nibble of last byte
object PackedDecimal:
  /**
   * Decode packed decimal (COMP-3) bytes to BigDecimal.
   * Each byte contains 2 digits (high nibble, low nibble).
   * Last byte low nibble is sign: C=positive, D=negative, F=unsigned.
   */
  def decode(bytes: Array[Byte], decimals: Int): BigDecimal =
    if bytes.isEmpty then BigDecimal(0)
    else
      val sb = new StringBuilder
      var i = 0
      while i < bytes.length do
        val b = bytes(i) & 0xFF
        val highNibble = (b >> 4) & 0x0F
        val lowNibble = b & 0x0F

        if i < bytes.length - 1 then
          // Not the last byte - both nibbles are digits
          sb.append(highNibble)
          sb.append(lowNibble)
        else
          // Last byte - high nibble is digit, low nibble is sign
          sb.append(highNibble)
        end if
        i += 1
      end while

      // Check sign from last byte's low nibble
      val lastByte = bytes(bytes.length - 1) & 0xFF
      val signNibble = lastByte & 0x0F
      val isNegative = signNibble == 0x0D // D = negative

      val numStr = sb.toString
      val unscaled = BigDecimal(numStr)
      val scaled = unscaled / BigDecimal(10).pow(decimals)

      if isNegative then -scaled else scaled

  /**
   * Encode BigDecimal to packed decimal (COMP-3) bytes.
   */
  def encode(value: BigDecimal, totalDigits: Int, decimals: Int): Array[Byte] =
    val isNegative = value < 0
    val absValue = value.abs

    // Scale up by decimals to get integer representation
    val scaledValue = (absValue * BigDecimal(10).pow(decimals)).toBigInt.abs
    val digits = scaledValue.toString.reverse.padTo(totalDigits, '0').reverse

    // Packed decimal uses (totalDigits + 1) / 2 bytes
    // Each byte holds 2 digits, except last byte holds 1 digit + sign
    val numBytes = (totalDigits + 2) / 2
    val result = new Array[Byte](numBytes)

    var digitIdx = 0
    var byteIdx = 0

    // If total digits is even, first byte has leading zero in high nibble
    if totalDigits % 2 == 0 then
      val lowDigit = digits(digitIdx).asDigit
      result(byteIdx) = lowDigit.toByte
      digitIdx += 1
      byteIdx += 1
    end if

    // Process pairs of digits
    while digitIdx < totalDigits - 1 do
      val highDigit = digits(digitIdx).asDigit
      val lowDigit = digits(digitIdx + 1).asDigit
      result(byteIdx) = ((highDigit << 4) | lowDigit).toByte
      digitIdx += 2
      byteIdx += 1
    end while

    // Last byte: final digit in high nibble, sign in low nibble
    val lastDigit = digits(totalDigits - 1).asDigit
    val signNibble = if isNegative then 0x0D else 0x0C
    result(byteIdx) = ((lastDigit << 4) | signNibble).toByte

    result

// Binary Numeric (COMP, COMP-5)
object BinaryNumeric:
  /**
   * Decode big-endian bytes to Int (2 or 4 bytes).
   */
  def decodeInt(bytes: Array[Byte], signed: Boolean): Int =
    if bytes.isEmpty then 0
    else
      var result = 0
      var i = 0
      while i < bytes.length do
        result = (result << 8) | (bytes(i) & 0xFF)
        i += 1
      end while

      if signed && bytes.length > 0 && (bytes(0) & 0x80) != 0 then
        // Sign extend for negative numbers
        val signExtend = bytes.length match
          case 1 => if result > 127 then result - 256 else result
          case 2 => if result > 32767 then result - 65536 else result
          case 3 => if result > 8388607 then result - 16777216 else result
          case _ => result
        signExtend
      else
        result

  /**
   * Decode big-endian bytes to Long (up to 8 bytes).
   */
  def decodeLong(bytes: Array[Byte], signed: Boolean): Long =
    if bytes.isEmpty then 0L
    else
      var result = 0L
      var i = 0
      while i < bytes.length do
        result = (result << 8) | (bytes(i) & 0xFF)
        i += 1
      end while

      if signed && bytes.length > 0 && (bytes(0) & 0x80) != 0 then
        // Sign extend for negative numbers
        val shift = (8 - bytes.length) * 8
        (result << shift) >> shift
      else
        result

  /**
   * Encode Int to big-endian bytes.
   */
  def encodeInt(value: Int, length: Int): Array[Byte] =
    val result = new Array[Byte](length)
    var v = value
    var i = length - 1
    while i >= 0 do
      result(i) = (v & 0xFF).toByte
      v = v >> 8
      i -= 1
    end while
    result

  /**
   * Encode Long to big-endian bytes.
   */
  def encodeLong(value: Long, length: Int): Array[Byte] =
    val result = new Array[Byte](length)
    var v = value
    var i = length - 1
    while i >= 0 do
      result(i) = (v & 0xFF).toByte
      v = v >> 8
      i -= 1
    end while
    result

// Display Numeric (zoned decimal, default PIC 9)
object DisplayNumeric:
  // EBCDIC digit zone (F0-F9 for 0-9)
  private val EbcdicZone = 0xF0

  // EBCDIC overpunch signs for last digit
  // Positive: C0-C9 maps to 0-9
  // Negative: D0-D9 maps to 0-9
  private val EbcdicPositiveSign = 0xC0
  private val EbcdicNegativeSign = 0xD0

  /**
   * Decode zoned decimal bytes to BigDecimal.
   * Sign is in the zone of the last digit (overpunch).
   */
  def decode(bytes: Array[Byte], decimals: Int, signed: Boolean): BigDecimal =
    if bytes.isEmpty then BigDecimal(0)
    else
      val sb = new StringBuilder
      var isNegative = false
      var i = 0

      while i < bytes.length do
        val b = bytes(i) & 0xFF
        val zone = b & 0xF0
        val digit = b & 0x0F

        if i == bytes.length - 1 && signed then
          // Last byte - check sign in zone
          isNegative = zone == 0xD0
          sb.append(digit)
        else
          sb.append(digit)
        end if
        i += 1
      end while

      val numStr = sb.toString
      val unscaled = BigDecimal(numStr)
      val scaled = unscaled / BigDecimal(10).pow(decimals)

      if isNegative then -scaled else scaled

  /**
   * Encode BigDecimal to zoned decimal bytes.
   */
  def encode(value: BigDecimal, totalDigits: Int, decimals: Int, signed: Boolean): Array[Byte] =
    val isNegative = value < 0
    val absValue = value.abs

    // Scale up to get integer
    val scaledValue = (absValue * BigDecimal(10).pow(decimals)).toBigInt.abs
    val digits = scaledValue.toString.reverse.padTo(totalDigits, '0').reverse

    val result = new Array[Byte](totalDigits)
    var i = 0

    while i < totalDigits do
      val digit = digits(i).asDigit
      if i == totalDigits - 1 && signed then
        // Last byte - include sign in zone
        val zone = if isNegative then EbcdicNegativeSign else EbcdicPositiveSign
        result(i) = (zone | digit).toByte
      else
        result(i) = (EbcdicZone | digit).toByte
      end if
      i += 1
    end while

    result

// Fixed-length string (PIC X)
opaque type FixedString = String

object FixedString:
  /**
   * Create a fixed-length string, padding or truncating as needed.
   */
  def apply(value: String, length: Int): FixedString =
    if value.length >= length then value.take(length)
    else value.padTo(length, ' ')

  /**
   * Parse EBCDIC bytes to FixedString.
   */
  def parse(bytes: Array[Byte]): FixedString =
    Try(new String(bytes, "IBM-1047")) match
      case Success(s) => s.trim
      case Failure(_) => new String(bytes, "ISO-8859-1").trim

  /**
   * Format FixedString to EBCDIC bytes.
   */
  def format(value: FixedString, length: Int): Array[Byte] =
    val padded = apply(value, length)
    Try(padded.getBytes("IBM-1047")) match
      case Success(bytes) => bytes
      case Failure(_) => padded.getBytes("ISO-8859-1")

  /**
   * Create an empty FixedString of given length (all spaces).
   */
  def empty(length: Int): FixedString = " " * length

extension (fs: FixedString)
  def value: String = fs
  def trimmed: String = fs.trim
  def length: Int = fs.length

// COBOL arithmetic with proper rounding
object CobolMath:
  /**
   * Add two BigDecimals with COBOL HALF-EVEN rounding.
   */
  def add(a: BigDecimal, b: BigDecimal, scale: Int): BigDecimal =
    (a + b).setScale(scale, BigDecimal.RoundingMode.HALF_EVEN)

  /**
   * Subtract two BigDecimals with COBOL HALF-EVEN rounding.
   */
  def subtract(a: BigDecimal, b: BigDecimal, scale: Int): BigDecimal =
    (a - b).setScale(scale, BigDecimal.RoundingMode.HALF_EVEN)

  /**
   * Multiply two BigDecimals with COBOL HALF-EVEN rounding.
   */
  def multiply(a: BigDecimal, b: BigDecimal, scale: Int): BigDecimal =
    (a * b).setScale(scale, BigDecimal.RoundingMode.HALF_EVEN)

  /**
   * Divide two BigDecimals with COBOL HALF-EVEN rounding.
   */
  def divide(a: BigDecimal, b: BigDecimal, scale: Int): BigDecimal =
    if b == 0 then throw new ArithmeticException("Division by zero")
    else (a / b).setScale(scale, BigDecimal.RoundingMode.HALF_EVEN)

  /**
   * Compute remainder (COBOL REMAINDER).
   */
  def remainder(a: BigDecimal, b: BigDecimal, scale: Int): BigDecimal =
    if b == 0 then throw new ArithmeticException("Division by zero")
    else (a % b).setScale(scale, BigDecimal.RoundingMode.HALF_EVEN)

  /**
   * Raise to power (COBOL COMPUTE with **).
   */
  def power(base: BigDecimal, exp: Int, scale: Int): BigDecimal =
    base.pow(exp).setScale(scale, BigDecimal.RoundingMode.HALF_EVEN)

  /**
   * Round truncating (COBOL ROUNDED clause with TRUNCATION).
   */
  def truncate(value: BigDecimal, scale: Int): BigDecimal =
    value.setScale(scale, BigDecimal.RoundingMode.DOWN)

// COBOL condition handling
object CobolConditions:
  /**
   * Numeric comparison with proper decimal handling.
   */
  def numericCompare(a: BigDecimal, b: BigDecimal): Int =
    a.compare(b)

  /**
   * Alphanumeric comparison (left-padded, case-sensitive).
   */
  def alphanumericCompare(a: String, b: String): Int =
    val maxLen = math.max(a.length, b.length)
    val paddedA = a.padTo(maxLen, ' ')
    val paddedB = b.padTo(maxLen, ' ')
    paddedA.compareTo(paddedB)

  /**
   * Check if value is numeric.
   */
  def isNumeric(s: String): Boolean =
    s.trim.nonEmpty && s.trim.forall(c => c.isDigit || c == '.' || c == '-' || c == '+')

  /**
   * Check if value is alphabetic.
   */
  def isAlphabetic(s: String): Boolean =
    s.forall(c => c.isLetter || c == ' ')
