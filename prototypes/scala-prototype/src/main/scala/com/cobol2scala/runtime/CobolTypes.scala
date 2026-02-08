package com.cobol2scala.runtime

import java.nio.charset.{Charset, StandardCharsets}
import scala.util.Try

/**
 * Runtime types and utilities for COBOL data handling.
 *
 * Provides COBOL-compatible semantics for:
 * - Fixed-length strings (space-padded)
 * - Packed decimal (COMP-3)
 * - Binary numerics (COMP)
 * - Display numerics
 */

// =============================================================================
// Configuration
// =============================================================================

object CobolConfig:
  /** Character encoding for EBCDIC/ASCII conversion */
  var charset: Charset = StandardCharsets.ISO_8859_1

  /** Whether source data is EBCDIC (mainframe) or ASCII */
  var isEbcdic: Boolean = false

// =============================================================================
// Packed Decimal (COMP-3)
// =============================================================================

/**
 * Utilities for COMP-3 (packed decimal) encoding/decoding.
 *
 * COMP-3 stores 2 digits per byte, with the last nibble as the sign.
 * Sign nibbles: C = positive, D = negative, F = unsigned positive
 */
object PackedDecimal:

  /**
   * Decode packed decimal from byte array.
   *
   * @param bytes Source byte array
   * @param offset Starting offset
   * @param length Number of bytes to read
   * @param scale Number of implied decimal places
   * @return Decoded BigDecimal value
   */
  def decode(bytes: Array[Byte], offset: Int, length: Int, scale: Int): BigDecimal =
    if length <= 0 then return BigDecimal(0)

    val sb = StringBuilder()
    var isNegative = false

    for i <- 0 until length do
      val b = bytes(offset + i) & 0xFF

      if i < length - 1 then
        // Two digits per byte
        sb.append((b >> 4) & 0x0F)
        sb.append(b & 0x0F)
      else
        // Last byte: one digit + sign
        sb.append((b >> 4) & 0x0F)
        val sign = b & 0x0F
        isNegative = (sign == 0x0D)  // D = negative

    val digits = sb.toString.dropWhile(_ == '0')
    val numStr = if digits.isEmpty then "0" else digits

    val value = BigDecimal(numStr).setScale(scale) / BigDecimal(10).pow(scale)
    if isNegative then -value else value

  /**
   * Encode BigDecimal to packed decimal format.
   */
  def encode(value: BigDecimal, bytes: Array[Byte], offset: Int, length: Int, scale: Int): Unit =
    val isNegative = value < 0
    val scaled = (value.abs * BigDecimal(10).pow(scale)).toBigInt
    val digits = scaled.toString

    // Pad with leading zeros to fill the packed format
    val totalDigits = length * 2 - 1  // Last nibble is sign
    val padded = digits.reverse.padTo(totalDigits, '0').reverse

    var digitIdx = 0
    for i <- 0 until length do
      if i < length - 1 then
        val high = if digitIdx < padded.length then padded.charAt(digitIdx) - '0' else 0
        val low = if digitIdx + 1 < padded.length then padded.charAt(digitIdx + 1) - '0' else 0
        bytes(offset + i) = ((high << 4) | low).toByte
        digitIdx += 2
      else
        val high = if digitIdx < padded.length then padded.charAt(digitIdx) - '0' else 0
        val sign = if isNegative then 0x0D else 0x0C
        bytes(offset + i) = ((high << 4) | sign).toByte

// =============================================================================
// Binary Numerics (COMP, COMP-4, COMP-5)
// =============================================================================

object BinaryNumeric:

  def decodeShort(bytes: Array[Byte], offset: Int): Short =
    ((bytes(offset) & 0xFF) << 8 |
     (bytes(offset + 1) & 0xFF)).toShort

  def decodeInt(bytes: Array[Byte], offset: Int): Int =
    (bytes(offset) & 0xFF) << 24 |
    (bytes(offset + 1) & 0xFF) << 16 |
    (bytes(offset + 2) & 0xFF) << 8 |
    (bytes(offset + 3) & 0xFF)

  def decodeLong(bytes: Array[Byte], offset: Int): Long =
    (bytes(offset).toLong & 0xFF) << 56 |
    (bytes(offset + 1).toLong & 0xFF) << 48 |
    (bytes(offset + 2).toLong & 0xFF) << 40 |
    (bytes(offset + 3).toLong & 0xFF) << 32 |
    (bytes(offset + 4).toLong & 0xFF) << 24 |
    (bytes(offset + 5).toLong & 0xFF) << 16 |
    (bytes(offset + 6).toLong & 0xFF) << 8 |
    (bytes(offset + 7).toLong & 0xFF)

  def decodeFloat(bytes: Array[Byte], offset: Int): Float =
    java.lang.Float.intBitsToFloat(decodeInt(bytes, offset))

  def decodeDouble(bytes: Array[Byte], offset: Int): Double =
    java.lang.Double.longBitsToDouble(decodeLong(bytes, offset))

  def decodeBigDecimal(bytes: Array[Byte], offset: Int, length: Int, scale: Int): BigDecimal =
    val rawValue = length match
      case 2 => BigDecimal(decodeShort(bytes, offset))
      case 4 => BigDecimal(decodeInt(bytes, offset))
      case 8 => BigDecimal(decodeLong(bytes, offset))
      case _ => BigDecimal(0)
    rawValue / BigDecimal(10).pow(scale)

  def encode(value: Long, bytes: Array[Byte], offset: Int, length: Int): Unit =
    length match
      case 2 =>
        bytes(offset) = (value >> 8).toByte
        bytes(offset + 1) = value.toByte
      case 4 =>
        bytes(offset) = (value >> 24).toByte
        bytes(offset + 1) = (value >> 16).toByte
        bytes(offset + 2) = (value >> 8).toByte
        bytes(offset + 3) = value.toByte
      case 8 =>
        bytes(offset) = (value >> 56).toByte
        bytes(offset + 1) = (value >> 48).toByte
        bytes(offset + 2) = (value >> 40).toByte
        bytes(offset + 3) = (value >> 32).toByte
        bytes(offset + 4) = (value >> 24).toByte
        bytes(offset + 5) = (value >> 16).toByte
        bytes(offset + 6) = (value >> 8).toByte
        bytes(offset + 7) = value.toByte
      case _ => ()

  def encode(value: Int, bytes: Array[Byte], offset: Int, length: Int): Unit =
    encode(value.toLong, bytes, offset, length)

  def encode(value: Short, bytes: Array[Byte], offset: Int, length: Int): Unit =
    encode(value.toLong, bytes, offset, length)

  def encodeFloat(value: Float, bytes: Array[Byte], offset: Int): Unit =
    encode(java.lang.Float.floatToIntBits(value), bytes, offset, 4)

  def encodeDouble(value: Double, bytes: Array[Byte], offset: Int): Unit =
    encode(java.lang.Double.doubleToLongBits(value), bytes, offset, 8)

// =============================================================================
// Display Numerics (Zoned Decimal)
// =============================================================================

object DisplayNumeric:

  def decodeChar(bytes: Array[Byte], offset: Int): Char =
    bytes(offset).toChar

  def decodeString(bytes: Array[Byte], offset: Int, length: Int): String =
    new String(bytes, offset, length, CobolConfig.charset).stripTrailing

  def decodeInt(bytes: Array[Byte], offset: Int, length: Int, signed: Boolean): Int =
    val str = decodeString(bytes, offset, length)
    parseSignedNumeric(str, signed).toInt

  def decodeLong(bytes: Array[Byte], offset: Int, length: Int, signed: Boolean): Long =
    val str = decodeString(bytes, offset, length)
    parseSignedNumeric(str, signed).toLong

  def decodeBigDecimal(
    bytes: Array[Byte],
    offset: Int,
    length: Int,
    scale: Int,
    signed: Boolean
  ): BigDecimal =
    val str = decodeString(bytes, offset, length)
    val raw = parseSignedNumeric(str, signed)
    raw / BigDecimal(10).pow(scale)

  /**
   * Parse a signed numeric string.
   * Handles trailing sign (overpunch) and explicit +/- signs.
   */
  private def parseSignedNumeric(str: String, signed: Boolean): BigDecimal =
    val trimmed = str.trim
    if trimmed.isEmpty then return BigDecimal(0)

    // Check for trailing overpunch (EBCDIC signed)
    if CobolConfig.isEbcdic && signed && trimmed.nonEmpty then
      val lastChar = trimmed.last
      val (digit, isNegative) = decodeOverpunch(lastChar)
      val numPart = trimmed.dropRight(1) + digit
      val value = Try(BigDecimal(numPart)).getOrElse(BigDecimal(0))
      if isNegative then -value else value
    else
      // Standard parsing
      Try(BigDecimal(trimmed)).getOrElse(BigDecimal(0))

  /**
   * Decode EBCDIC overpunch character to digit and sign.
   */
  private def decodeOverpunch(ch: Char): (Char, Boolean) =
    ch match
      // Positive: { A B C D E F G H I
      case '{' => ('0', false)
      case 'A' => ('1', false)
      case 'B' => ('2', false)
      case 'C' => ('3', false)
      case 'D' => ('4', false)
      case 'E' => ('5', false)
      case 'F' => ('6', false)
      case 'G' => ('7', false)
      case 'H' => ('8', false)
      case 'I' => ('9', false)
      // Negative: } J K L M N O P Q R
      case '}' => ('0', true)
      case 'J' => ('1', true)
      case 'K' => ('2', true)
      case 'L' => ('3', true)
      case 'M' => ('4', true)
      case 'N' => ('5', true)
      case 'O' => ('6', true)
      case 'P' => ('7', true)
      case 'Q' => ('8', true)
      case 'R' => ('9', true)
      // Default: treat as digit
      case c if c.isDigit => (c, false)
      case _ => ('0', false)

  def encodeString(value: String, bytes: Array[Byte], offset: Int, length: Int): Unit =
    val padded = value.padTo(length, ' ').take(length)
    val encoded = padded.getBytes(CobolConfig.charset)
    System.arraycopy(encoded, 0, bytes, offset, length)

  def encodeNumeric(
    value: BigDecimal,
    bytes: Array[Byte],
    offset: Int,
    length: Int,
    scale: Int,
    signed: Boolean
  ): Unit =
    val scaled = (value.abs * BigDecimal(10).pow(scale)).toBigInt
    val digits = scaled.toString.reverse.padTo(length, '0').reverse.take(length)

    // For signed display, would need to add overpunch
    // For now, just encode as digits
    encodeString(digits, bytes, offset, length)

// =============================================================================
// COBOL Math Utilities
// =============================================================================

object CobolMath:

  /**
   * Truncate to specified decimal places (COBOL default behavior).
   */
  def truncate(value: BigDecimal, scale: Int): BigDecimal =
    value.setScale(scale, scala.math.BigDecimal.RoundingMode.DOWN)

  /**
   * Round to specified decimal places (when ROUNDED specified).
   */
  def round(value: BigDecimal, scale: Int): BigDecimal =
    value.setScale(scale, scala.math.BigDecimal.RoundingMode.HALF_UP)

  /**
   * Check for size error (overflow).
   */
  def checkSizeError(value: BigDecimal, integerDigits: Int, decimalDigits: Int): Boolean =
    val maxValue = BigDecimal(10).pow(integerDigits) - BigDecimal(10).pow(-decimalDigits)
    value.abs > maxValue
