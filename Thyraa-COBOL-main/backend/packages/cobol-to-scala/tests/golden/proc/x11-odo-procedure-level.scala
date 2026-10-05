package com.example.cobol

import scala.util.{Try, Success, Failure}

// --- Embedded runtime: CobolCodecs (see runtime/CobolCodecs.scala) ---
// Inlined because embedRuntime: true (the default), so this file is a
// self-contained `scala-cli run` script. Pass embedRuntime: false to instead
// `import com.thyraa.cobol.runtime.CobolCodecs` from a shared multi-file build.
/**
 * CobolCodecs
 *
 * Scala 3 equivalents of `generator/codecs.js` (the JS file is the ground
 * truth used by the JS-side test suite; every function here must produce
 * byte-identical output to its JS counterpart for the same inputs).
 *
 * Covers:
 *   - Packed decimal (COMP-3 / PACKED-DECIMAL): two digits per byte, sign
 *     nibble last (0xC positive, 0xD negative, 0xF unsigned).
 *   - Binary (COMP / COMP-4 / COMP-5 / BINARY): two's complement, 2/4/8 bytes
 *     chosen by digit count (1-4/5-9/10-18). Byte ORDER is big-endian for
 *     COMP/COMP-4/BINARY but little-endian (host-native) for COMP-5 -
 *     compiler-verified against real GnuCOBOL, see
 *     tests/oracle/codec-refutation.md - so binaryEncode/binaryDecode take an
 *     explicit `endianness: "BIG"|"LITTLE"` parameter (default "BIG").
 *   - Zoned decimal (DISPLAY numeric) with sign overpunch (embedded in the
 *     zone of the leading or trailing digit) or SIGN ... SEPARATE. The
 *     non-SEPARATE sign scheme itself differs by `codePage`: "EBCDIC" uses
 *     letter substitution (compiler-verified for the *scheme*, see the
 *     refutation doc), "ASCII" swaps the sign digit's zone nibble
 *     (0x3x positive / 0x7x negative) - also compiler-verified, and NOT the
 *     same table reused across a charset translation.
 *   - EBCDIC code page 037 <-> Unicode, full 256-code-point translation.
 *
 * Where the JS reference represents a decimal as a (BigInt unscaled, scale)
 * pair (JS has no native arbitrary-precision decimal type), the Scala side
 * uses `BigDecimal` directly - `BigDecimal(unscaledVal: BigInt, scale: Int)`
 * *is* that same (unscaled, scale) representation, just with a native type.
 */
object CobolCodecs:

  private def requireDigits(digits: Int): Unit =
    require(digits >= 1 && digits <= 18, s"digits must be between 1 and 18 (COBOL max), got $digits")

  // ==========================================================================
  // Packed Decimal (COMP-3 / PACKED-DECIMAL)
  // ==========================================================================

  /**
   * Number of packed-decimal bytes needed to store `digits` decimal digits
   * plus the trailing sign nibble: ceil((digits + 1) / 2).
   */
  def packedByteLength(digits: Int): Int =
    requireDigits(digits)
    (digits + 2) / 2

  /**
   * Encode a BigDecimal as COMP-3 bytes.
   *
   * @param value  the decimal value to encode
   * @param digits total number of decimal digits the field holds
   *               (integerDigits + decimalDigits), 1-18
   * @param scale  number of digits after the decimal point (matches the
   *               field's PIC ...V9(scale))
   * @param signed false for an unsigned PACKED-DECIMAL field (sign nibble
   *               0xF, negative values rejected)
   */
  def packedEncode(value: BigDecimal, digits: Int, scale: Int = 0, signed: Boolean = true): Array[Byte] =
    requireDigits(digits)
    val rescaled = value.setScale(scale, BigDecimal.RoundingMode.HALF_UP)
    val negative = rescaled.signum < 0
    if negative && !signed then
      throw new IllegalArgumentException(s"packedEncode: unsigned field cannot hold negative value $value")

    val digitStr = rescaled.abs.bigDecimal.unscaledValue().toString
    if digitStr.length > digits then
      throw new IllegalArgumentException(s"packedEncode: value $value needs more than $digits digits")
    val padded = ("0" * (digits - digitStr.length)) + digitStr

    val signNibble = if !signed then 0xf else if negative then 0xd else 0xc
    val byteLength = packedByteLength(digits)
    val totalNibbles = byteLength * 2
    val padNibbles = totalNibbles - digits - 1 // 0 (odd digits) or 1 (even digits)

    val nibbles = new Array[Int](totalNibbles)
    var idx = 0
    for _ <- 0 until padNibbles do
      nibbles(idx) = 0
      idx += 1
    for ch <- padded do
      nibbles(idx) = ch - '0'
      idx += 1
    nibbles(idx) = signNibble

    val bytes = new Array[Byte](byteLength)
    for b <- 0 until byteLength do
      bytes(b) = ((nibbles(b * 2) << 4) | nibbles(b * 2 + 1)).toByte
    bytes

  /**
   * Decode COMP-3 bytes to a BigDecimal at the given scale.
   * `scale` is not stored in the bytes - it is a property of the PIC clause
   * and must be supplied by the caller, same as the JS reference.
   */
  def packedDecode(bytes: Array[Byte], scale: Int = 0): BigDecimal =
    if bytes.isEmpty then BigDecimal(0).setScale(scale)
    else
      // Collect digit nibbles as Ints (0-15), not characters appended to a
      // String: a naive "digitStr matches all digit characters" check is
      // dead code here, because e.g. nibble 10 stringifies to "10" - two
      // ASCII digit characters that still look like digits even though the
      // nibble itself (0xA-0xF) is not a valid packed-decimal digit. Each
      // nibble must be range-checked directly as a number instead.
      val totalDigitNibbles = 2 * (bytes.length - 1) + 1
      val digitNibbles = new Array[Int](totalDigitNibbles)
      var idx = 0
      var i = 0
      while i < bytes.length - 1 do
        val b = bytes(i) & 0xff
        digitNibbles(idx) = (b >> 4) & 0x0f
        idx += 1
        digitNibbles(idx) = b & 0x0f
        idx += 1
        i += 1
      end while
      val last = bytes(bytes.length - 1) & 0xff
      digitNibbles(idx) = (last >> 4) & 0x0f
      val signNibble = last & 0x0f

      for nibble <- digitNibbles do
        if nibble > 9 then
          throw new IllegalArgumentException(
            f"packedDecode: non-digit nibble 0x$nibble%x encountered in digit position"
          )

      // C/E/A/F are treated as positive-or-unsigned; D/B are negative. C, D
      // and F are the only nibbles our own encoder emits; A/B/E are accepted
      // here for tolerance of packed decimal produced by other mainframe software.
      val negative = signNibble == 0xd || signNibble == 0xb
      val magnitude = BigInt(digitNibbles.mkString)
      val unscaled = if negative then -magnitude else magnitude
      BigDecimal(unscaled, scale)

  // ==========================================================================
  // Binary (COMP / COMP-4 / COMP-5 / BINARY)
  //
  // Byte width is chosen by total digit count: 1-4 digits -> 2 bytes, 5-9
  // digits -> 4 bytes, 10-18 digits -> 8 bytes.
  //
  // Byte ORDER depends on which USAGE this is, confirmed against real
  // GnuCOBOL (see tests/oracle/codec-refutation.md):
  //   - COMP / COMP-4 / BINARY -> big-endian (the `binary-byteorder:
  //     big-endian` dialect default), i.e. endianness = "BIG" (the default).
  //   - COMP-5 -> host-native byte order, little-endian on the x86_64
  //     GnuCOBOL build this was verified against (`-fbinary-byteorder=native`
  //     is COMP-5's defining behavior, independent of the dialect config),
  //     i.e. endianness = "LITTLE".
  // Callers (generator/case-class-gen.js) must pass "LITTLE" only for COMP-5
  // fields; every other binary USAGE stays "BIG".
  // ==========================================================================

  /** Byte width for a binary (COMP) field with the given total digit count. */
  def binaryByteLength(digits: Int): Int =
    requireDigits(digits)
    if digits <= 4 then 2
    else if digits <= 9 then 4
    else 8

  private def requireEndianness(endianness: String, fnName: String): Unit =
    require(
      endianness == "BIG" || endianness == "LITTLE",
      s"$fnName: invalid endianness '$endianness', expected 'BIG' or 'LITTLE'"
    )

  /**
   * Encode a signed Long as two's complement bytes.
   * @param byteLength 1-8 (2, 4 and 8 are the COBOL-meaningful widths)
   * @param endianness "BIG" (default) for COMP/COMP-4/BINARY, "LITTLE" for
   *                   COMP-5 (host-native on x86_64).
   */
  def binaryEncode(value: Long, byteLength: Int, endianness: String = "BIG"): Array[Byte] =
    requireEndianness(endianness, "binaryEncode")
    require(byteLength >= 1 && byteLength <= 8, s"binaryEncode: byteLength must be 1-8, got $byteLength")
    if byteLength < 8 then
      // Only check range when byteLength < 8: at 8 bytes every Long value is
      // representable, and 1L << 64 is not (shift amounts on Long wrap mod 64).
      val bits = byteLength * 8
      val max = (1L << (bits - 1)) - 1
      val min = -(1L << (bits - 1))
      if value > max || value < min then
        throw new IllegalArgumentException(
          s"binaryEncode: $value out of range for a $byteLength-byte signed field [$min, $max]"
        )

    val bytes = new Array[Byte](byteLength)
    var v = value
    var i = byteLength - 1
    while i >= 0 do
      bytes(i) = (v & 0xff).toByte
      v = v >> 8
      i -= 1
    end while
    if endianness == "LITTLE" then bytes.reverse else bytes

  /**
   * Decode two's complement bytes to a signed Long.
   * @param bytes 0-8 bytes; anything wider has no COBOL binary-field meaning
   *              and is rejected rather than silently overflowing into a
   *              garbage Long value.
   */
  def binaryDecode(bytes: Array[Byte], endianness: String = "BIG"): Long =
    requireEndianness(endianness, "binaryDecode")
    val byteLength = bytes.length
    require(byteLength <= 8, s"binaryDecode: buffer too long ($byteLength bytes), max is 8 (COBOL COMP/COMP-5 width)")
    if byteLength == 0 then 0L
    else
      val ordered = if endianness == "LITTLE" then bytes.reverse else bytes
      var result = 0L
      var i = 0
      while i < byteLength do
        result = (result << 8) | (ordered(i) & 0xff).toLong
        i += 1
      end while
      if byteLength < 8 then
        val bits = byteLength * 8
        val signBit = 1L << (bits - 1)
        if (result & signBit) != 0 then result -= (1L << bits)
      result

  // ==========================================================================
  // Floating point (COMP-1 / COMP-2)
  //
  // round-28 finding 3: real IEEE-754 binary float (COMP-1, 4 bytes)/double
  // (COMP-2, 8 bytes) encode/decode - see generator/codecs.js's identical
  // section for the full rationale (no byte-level codec existed for these
  // USAGEs at all before this round; case-class-gen.js's legacyEncodeExpr/
  // legacyDecodeExpr text-truncation shortcut silently corrupted precision on
  // an actual file-record round trip).
  //
  // Byte ORDER is HOST-NATIVE (little-endian on x86_64), exactly like COMP-5
  // (see binaryEncode/binaryDecode above) - NOT the big-endian default
  // COMP/COMP-4/BINARY use. Compiler-verified directly against installed
  // GnuCOBOL: a COMP-1 field holding 3.5 wrote bytes `00 00 60 40` and a
  // COMP-2 field holding 2.25 wrote `00 00 00 00 00 00 02 40` - each the exact
  // byte-reverse of the standard big-endian IEEE-754 bit pattern
  // (0x40600000/0x4002000000000000) - confirmed again with -7.125 (COMP-1)
  // and 100.5 (COMP-2), so this is host-native byte order, not a coincidence
  // of the specific test value.
  // ==========================================================================

  /**
   * Encode a Float as COMP-1 bytes (IEEE-754 single precision, 4 bytes,
   * host-native/little-endian byte order - see this section's own doc comment).
   */
  def floatEncode(value: Float): Array[Byte] =
    val bits = java.lang.Float.floatToIntBits(value)
    Array(
      (bits & 0xff).toByte,
      ((bits >> 8) & 0xff).toByte,
      ((bits >> 16) & 0xff).toByte,
      ((bits >> 24) & 0xff).toByte
    )

  /**
   * Decode COMP-1 bytes (IEEE-754 single precision, 4 bytes, host-native/
   * little-endian byte order) to a Float.
   */
  def floatDecode(bytes: Array[Byte]): Float =
    require(bytes.length == 4, s"floatDecode: expected 4 bytes (COMP-1), got ${bytes.length}")
    val bits =
      (bytes(0) & 0xff) | ((bytes(1) & 0xff) << 8) | ((bytes(2) & 0xff) << 16) | ((bytes(3) & 0xff) << 24)
    java.lang.Float.intBitsToFloat(bits)

  /**
   * Encode a Double as COMP-2 bytes (IEEE-754 double precision, 8 bytes,
   * host-native/little-endian byte order - see this section's own doc comment).
   */
  def doubleEncode(value: Double): Array[Byte] =
    val bits = java.lang.Double.doubleToLongBits(value)
    val bytes = new Array[Byte](8)
    var i = 0
    while i < 8 do
      bytes(i) = ((bits >> (8 * i)) & 0xffL).toByte
      i += 1
    end while
    bytes

  /**
   * Decode COMP-2 bytes (IEEE-754 double precision, 8 bytes, host-native/
   * little-endian byte order) to a Double.
   */
  def doubleDecode(bytes: Array[Byte]): Double =
    require(bytes.length == 8, s"doubleDecode: expected 8 bytes (COMP-2), got ${bytes.length}")
    var bits = 0L
    var i = 0
    while i < 8 do
      bits = bits | ((bytes(i) & 0xffL) << (8 * i))
      i += 1
    end while
    java.lang.Double.longBitsToDouble(bits)

  // ==========================================================================
  // Zoned Decimal (DISPLAY numeric) with sign overpunch
  //
  // One byte per digit. Unsigned fields (and non-sign digit positions of
  // signed fields) carry the digit in the low nibble with the digit zone in
  // the high nibble (0xF for EBCDIC, plain ASCII '0'-'9' for ASCII). Signed
  // fields without SIGN ... SEPARATE overpunch the sign onto the leading or
  // trailing digit's zone; SIGN ... SEPARATE fields add one extra byte
  // holding a literal '+'/'-' character instead.
  //
  // The sign-overpunch SCHEME differs by codePage - these are NOT the same
  // bytes reinterpreted through a different charset, they are two genuinely
  // different conventions (compiler-verified against real GnuCOBOL, see
  // tests/oracle/codec-refutation.md, "Post-fix verification" section):
  //
  //   "EBCDIC" -> letter-substitution overpunch, expressed here as characters
  //   pushed through the cp037 table below: positive digit 0-9 -> { A-I,
  //   negative digit 0-9 -> } J-R. (This is exactly why cp037 byte 0xC0 is
  //   '{': the positive digit zone is 0xC0-0xC9 and 0xC1-0xC9 already
  //   coincide with 'A'-'I' in EBCDIC.)
  //
  //   "ASCII" -> zone-nibble swap, no letters at all. The sign digit's byte
  //   is a PLAIN ASCII digit for positive (0x30 + d, unchanged) and has its
  //   zone nibble swapped from 0x3 to 0x7 for negative (0x70 + d), e.g.
  //   digit 5 negative -> 0x75. (An earlier version of this file reused the
  //   EBCDIC letter table for "ASCII" too - refuted by cobc: every nonzero
  //   signed digit came out wrong.)
  // ==========================================================================

  private val PositiveOverpunch: Array[Char] = Array('{', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I')
  private val NegativeOverpunch: Array[Char] = Array('}', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R')

  private def overpunchChar(digit: Int, negative: Boolean): Char =
    if negative then NegativeOverpunch(digit) else PositiveOverpunch(digit)

  /** Returns (digit, negative) for a sign-overpunch or plain digit character. */
  private def overpunchDecode(ch: Char): (Int, Boolean) =
    val posIdx = PositiveOverpunch.indexOf(ch)
    if posIdx >= 0 then (posIdx, false)
    else
      val negIdx = NegativeOverpunch.indexOf(ch)
      if negIdx >= 0 then (negIdx, true)
      else if ch >= '0' && ch <= '9' then (ch - '0', false)
      else throw new IllegalArgumentException(s"zonedDecode: '$ch' is not a valid sign-overpunch or digit character")

  /** ASCII-native zoned sign encode: positive digit d -> 0x30+d, negative -> 0x70+d. */
  private def asciiSignByte(digit: Int, negative: Boolean): Byte =
    ((if negative then 0x70 else 0x30) + digit).toByte

  /** ASCII-native zoned sign decode, inverse of asciiSignByte; throws on any other byte. */
  private def asciiSignDigit(byte: Int): (Int, Boolean) =
    if byte >= 0x30 && byte <= 0x39 then (byte - 0x30, false)
    else if byte >= 0x70 && byte <= 0x79 then (byte - 0x70, true)
    else
      throw new IllegalArgumentException(
        f"zonedDecode: byte 0x$byte%02x is not a valid ASCII zoned sign digit"
      )

  /**
   * Encode a BigDecimal as zoned-decimal (DISPLAY numeric) bytes.
   *
   * @param signLeading  overpunch/separate sign on the first digit instead
   *                     of the last (mirrors DataItem.sign.leading)
   * @param signSeparate add a literal +/- byte instead of overpunching a
   *                     digit (mirrors DataItem.sign.separate)
   */
  def zonedEncode(
    value: BigDecimal,
    digits: Int,
    scale: Int = 0,
    signed: Boolean = true,
    signLeading: Boolean = false,
    signSeparate: Boolean = false,
    codePage: String = "EBCDIC"
  ): Array[Byte] =
    requireDigits(digits)
    val rescaled = value.setScale(scale, BigDecimal.RoundingMode.HALF_UP)
    val negative = rescaled.signum < 0
    if negative && !signed then
      throw new IllegalArgumentException(s"zonedEncode: unsigned field cannot hold negative value $value")

    val digitStr = rescaled.abs.bigDecimal.unscaledValue().toString
    if digitStr.length > digits then
      throw new IllegalArgumentException(s"zonedEncode: value $value needs more than $digits digits")
    val digitChars = (("0" * (digits - digitStr.length)) + digitStr).toCharArray

    val separate = signed && signSeparate
    if separate then
      val signChar = if negative then '-' else '+'
      val chars = if signLeading then signChar +: digitChars else digitChars :+ signChar
      charsToBytes(chars, codePage)
    else
      // Every digit is a plain digit byte except the sign-bearing position,
      // which is overwritten below with the codePage-specific scheme.
      val bytes = charsToBytes(digitChars, codePage)
      if signed then
        val idx = if signLeading then 0 else digitChars.length - 1
        val digit = digitChars(idx) - '0'
        bytes(idx) =
          if codePage == "ASCII" then asciiSignByte(digit, negative)
          else charToEbcdicByte(overpunchChar(digit, negative))
      bytes

  /**
   * Decode zoned-decimal (DISPLAY numeric) bytes to a BigDecimal at the
   * given scale (scale is echoed back, not derived from the bytes).
   */
  def zonedDecode(
    bytes: Array[Byte],
    scale: Int = 0,
    signed: Boolean = true,
    signLeading: Boolean = false,
    signSeparate: Boolean = false,
    codePage: String = "EBCDIC"
  ): BigDecimal =
    val separate = signed && signSeparate
    val minLength = if separate then 2 else 1
    if bytes.length < minLength then
      throw new IllegalArgumentException(
        s"zonedDecode: buffer too short (${bytes.length} bytes), need at least $minLength" +
          (if separate then " (digit(s) + sign byte)" else " (digit)")
      )

    val chars = bytesToChars(bytes, codePage)

    val (negative, digitChars): (Boolean, Array[Char]) =
      if separate then
        if signLeading then (chars.head == '-', chars.tail)
        else (chars.last == '-', chars.init)
      else if signed then
        val idx = if signLeading then 0 else chars.length - 1
        val copy = chars.clone()
        if codePage == "ASCII" then
          val (digit, neg) = asciiSignDigit(bytes(idx) & 0xff)
          copy(idx) = ('0' + digit).toChar
          (neg, copy)
        else
          val (digit, neg) = overpunchDecode(chars(idx))
          copy(idx) = ('0' + digit).toChar
          (neg, copy)
      else (false, chars)

    val digitStr = new String(digitChars)
    if !digitStr.forall(_.isDigit) then
      throw new IllegalArgumentException(s"zonedDecode: non-digit data in '$digitStr'")
    val magnitude = if digitStr.isEmpty then BigInt(0) else BigInt(digitStr)
    val unscaled = if negative then -magnitude else magnitude
    BigDecimal(unscaled, scale)

  private def charsToBytes(chars: Array[Char], codePage: String): Array[Byte] =
    chars.map(ch => if codePage == "EBCDIC" then charToEbcdicByte(ch) else (ch.toInt & 0xff).toByte)

  private def bytesToChars(bytes: Array[Byte], codePage: String): Array[Char] =
    bytes.map(b => if codePage == "EBCDIC" then ebcdicByteToChar(b) else (b & 0xff).toChar)

  // ==========================================================================
  // EBCDIC code page 037 <-> Unicode
  //
  // Full 256-entry translation table, transcribed from the authoritative
  // IBM/Unicode mapping (unicode.org Public/MAPPINGS/VENDORS/MICSFT/EBCDIC/CP037.TXT)
  // and verified byte-for-byte identical to generator/codecs.js's table.
  // Verified anchors: space = 0x40, digits '0'-'9' = 0xF0-0xF9, 'A'-'I' =
  // 0xC1-0xC9, 'J'-'R' = 0xD1-0xD9, 'S'-'Z' = 0xE2-0xE9, 'a'-'i' = 0x81-0x89,
  // 'j'-'r' = 0x91-0x99, 's'-'z' = 0xA2-0xA9.
  // ==========================================================================

  // format: off
  private val Cp037ToUnicode: Array[Char] = Array(
    0x0000, 0x0001, 0x0002, 0x0003, 0x009c, 0x0009, 0x0086, 0x007f, // 00-07
    0x0097, 0x008d, 0x008e, 0x000b, 0x000c, 0x000d, 0x000e, 0x000f, // 08-0F
    0x0010, 0x0011, 0x0012, 0x0013, 0x009d, 0x0085, 0x0008, 0x0087, // 10-17
    0x0018, 0x0019, 0x0092, 0x008f, 0x001c, 0x001d, 0x001e, 0x001f, // 18-1F
    0x0080, 0x0081, 0x0082, 0x0083, 0x0084, 0x000a, 0x0017, 0x001b, // 20-27
    0x0088, 0x0089, 0x008a, 0x008b, 0x008c, 0x0005, 0x0006, 0x0007, // 28-2F
    0x0090, 0x0091, 0x0016, 0x0093, 0x0094, 0x0095, 0x0096, 0x0004, // 30-37
    0x0098, 0x0099, 0x009a, 0x009b, 0x0014, 0x0015, 0x009e, 0x001a, // 38-3F
    0x0020, 0x00a0, 0x00e2, 0x00e4, 0x00e0, 0x00e1, 0x00e3, 0x00e5, // 40-47 (0x40 = space)
    0x00e7, 0x00f1, 0x00a2, 0x002e, 0x003c, 0x0028, 0x002b, 0x007c, // 48-4F
    0x0026, 0x00e9, 0x00ea, 0x00eb, 0x00e8, 0x00ed, 0x00ee, 0x00ef, // 50-57
    0x00ec, 0x00df, 0x0021, 0x0024, 0x002a, 0x0029, 0x003b, 0x00ac, // 58-5F
    0x002d, 0x002f, 0x00c2, 0x00c4, 0x00c0, 0x00c1, 0x00c3, 0x00c5, // 60-67
    0x00c7, 0x00d1, 0x00a6, 0x002c, 0x0025, 0x005f, 0x003e, 0x003f, // 68-6F
    0x00f8, 0x00c9, 0x00ca, 0x00cb, 0x00c8, 0x00cd, 0x00ce, 0x00cf, // 70-77
    0x00cc, 0x0060, 0x003a, 0x0023, 0x0040, 0x0027, 0x003d, 0x0022, // 78-7F
    0x00d8, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067, // 80-87 ('a'-'g')
    0x0068, 0x0069, 0x00ab, 0x00bb, 0x00f0, 0x00fd, 0x00fe, 0x00b1, // 88-8F
    0x00b0, 0x006a, 0x006b, 0x006c, 0x006d, 0x006e, 0x006f, 0x0070, // 90-97 ('j'-'p')
    0x0071, 0x0072, 0x00aa, 0x00ba, 0x00e6, 0x00b8, 0x00c6, 0x00a4, // 98-9F
    0x00b5, 0x007e, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077, 0x0078, // A0-A7 ('s'-'x')
    0x0079, 0x007a, 0x00a1, 0x00bf, 0x00d0, 0x00dd, 0x00de, 0x00ae, // A8-AF ('y','z')
    0x005e, 0x00a3, 0x00a5, 0x00b7, 0x00a9, 0x00a7, 0x00b6, 0x00bc, // B0-B7
    0x00bd, 0x00be, 0x005b, 0x005d, 0x00af, 0x00a8, 0x00b4, 0x00d7, // B8-BF
    0x007b, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047, // C0-C7 ('{','A'-'G')
    0x0048, 0x0049, 0x00ad, 0x00f4, 0x00f6, 0x00f2, 0x00f3, 0x00f5, // C8-CF ('H','I')
    0x007d, 0x004a, 0x004b, 0x004c, 0x004d, 0x004e, 0x004f, 0x0050, // D0-D7 ('}','J'-'O')
    0x0051, 0x0052, 0x00b9, 0x00fb, 0x00fc, 0x00f9, 0x00fa, 0x00ff, // D8-DF ('P','Q')
    0x005c, 0x00f7, 0x0053, 0x0054, 0x0055, 0x0056, 0x0057, 0x0058, // E0-E7 ('S'-'X')
    0x0059, 0x005a, 0x00b2, 0x00d4, 0x00d6, 0x00d2, 0x00d3, 0x00d5, // E8-EF ('Y','Z')
    0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037, // F0-F7 ('0'-'7')
    0x0038, 0x0039, 0x00b3, 0x00db, 0x00dc, 0x00d9, 0x00da, 0x009f  // F8-FF ('8','9')
  )
  // format: on

  private lazy val UnicodeToCp037: Map[Char, Int] =
    Cp037ToUnicode.zipWithIndex.map((ch, byte) => ch -> byte).toMap

  /** Decode a single cp037 byte to its Unicode character. */
  def ebcdicByteToChar(byte: Byte): Char = Cp037ToUnicode(byte & 0xff)

  /**
   * Encode a single Unicode (BMP) character to its cp037 byte.
   * Throws if the character has no cp037 representation.
   */
  def charToEbcdicByte(ch: Char): Byte =
    UnicodeToCp037.get(ch) match
      case Some(byte) => byte.toByte
      case None =>
        throw new IllegalArgumentException(
          f"charToEbcdicByte: '$ch' (U+${ch.toInt}%04X) has no cp037 mapping"
        )

  /** Decode a full EBCDIC cp037 byte buffer to a Unicode string (no trimming). */
  def ebcdicToString(bytes: Array[Byte]): String =
    new String(bytes.map(ebcdicByteToChar))

  /**
   * Encode a Unicode string to EBCDIC cp037 bytes, optionally padding
   * (with cp037 space, 0x40) or truncating to a fixed length.
   */
  def stringToEbcdic(s: String, length: Option[Int] = None): Array[Byte] =
    val padded = length match
      case Some(len) =>
        if s.length >= len then s.substring(0, len)
        else s + (" " * (len - s.length))
      case None => s
    padded.toCharArray.map(charToEbcdicByte)

// CobolFmt: numeric DISPLAY formatting (sign + zero-padding per PIC)
object CobolFmt:
  // WRITE ... AFTER/BEFORE ADVANCING n LINES (round-6 finding 1) - the
  // separator text emitted between one physical line and the next,
  // compiler-verified against installed GnuCOBOL: ADVANCING 0 LINES is a
  // bare carriage return (same-line overprint), ADVANCING n LINES (n>=1)
  // is exactly n newline characters (n-1 blank lines plus the ordinary
  // line break), never n-1.
  def advanceSep(n: Int): String = if n <= 0 then "\r" else "\n" * n

  // round-7 finding 5: `decimalComma` (SPECIAL-NAMES' DECIMAL-POINT IS
  // COMMA - see generator/expression-gen.js's setDecimalPointIsComma)
  // renders the decimal point as "," instead of "." - compiler-verified
  // against installed GnuCOBOL (tests/oracle - u03/u03b's oracle output,
  // round-7 refutation) that a plain (non-edited) numeric DISPLAY item
  // renders its assumed decimal point using the *current* DECIMAL-POINT
  // character, not always ".". Defaults to false so every call site that
  // predates this finding (100% of them) is byte-for-byte unchanged.
  def num(v: BigDecimal, intDigits: Int, decDigits: Int, signed: Boolean, decimalComma: Boolean = false): String =
    val neg = v.signum < 0
    val absVal = v.abs
    val signStr = if signed then (if neg then "-" else "+") else ""
    // round-38 finding 4 (nn09): a NEGATIVE decDigits is this generator's own
    // encoding for a PICTURE with a TRAILING P scaling run (e.g. `9(3)PPP`) -
    // see data-division-parser.js's PIC-scan `case 'P':` branch - meaning "no
    // fractional part is ever displayed; the value (already rounded to a
    // multiple of 10^-decDigits by CobolFmt.truncNumeric at store time) is
    // rendered directly as a whole number, zero-padded to intDigits' own full
    // width". The ordinary positive-decDigits formula below can't express this
    // (its own `absVal * 10^decDigits` SHRINKS the digit string for a negative
    // exponent instead of just displaying the already-correct magnitude) - a
    // pre-round-38 PIC could never actually produce a negative decDigits at
    // all, so this branch is unreachable for any program predating this fix.
    if decDigits < 0 then
      val digits = absVal.setScale(0, BigDecimal.RoundingMode.HALF_UP).toBigInt.toString
      val padded = if digits.length < intDigits then ("0" * (intDigits - digits.length)) + digits else digits
      signStr + padded
    else
      val totalDigits = intDigits + decDigits
      val unscaled = (absVal * BigDecimal(10).pow(decDigits)).setScale(0, BigDecimal.RoundingMode.HALF_UP).toBigInt.toString
      val digits = if unscaled.length < totalDigits then ("0" * (totalDigits - unscaled.length)) + unscaled else unscaled
      val intPart = if intDigits > 0 then digits.dropRight(decDigits) else ""
      val decPart = if decDigits > 0 then digits.takeRight(decDigits) else ""
      val body = if decDigits > 0 then intPart + (if decimalComma then "," else ".") + decPart else intPart
      signStr + body

  // round-7 findings 2/3: DISPLAY of a COMP-1/COMP-2 (Float/Double) item -
  // these have no PIC clause (no fixed integer/decimal digit counts to
  // zero-pad to the way `num` above does for an ordinary DISPLAY numeric
  // item), so cobc renders them as plain decimal text instead - compiler-
  // verified against installed GnuCOBOL (tests/oracle - u02b's oracle
  // output, round-7 refutation): 3.5 -> "3.5", 2.25 -> "2.25", and a
  // *whole* value like 7.0 -> "7" (no trailing ".0"/decimal point at
  // all) - unlike Scala's own Float/Double.toString, which always keeps
  // a ".0" for a whole value. `.toString` on a Float/Double already gives
  // the shortest round-tripping decimal text (matching cobc's own
  // representation for every value both were checked against), so this
  // only has to additionally strip a trailing ".0".
  //
  // round-29 finding 4 (ee07): a scientific-notation magnitude (e.g. a
  // COMP-1 value of 1.0E30) exposed a SECOND gap this same function must
  // also handle - `s.endsWith(".0")` only ever matched a WHOLE, non-
  // scientific value (its own doc comment above never anticipated an
  // exponent), so a value whose own Scala .toString is "1.0E30" fell
  // through untouched, keeping cobc-incompatible ".0" AND missing the
  // explicit "+" cobc's own exponent format always carries for a non-
  // negative exponent - verified against installed GnuCOBOL (ee07's own
  // oracle): 1.0E30 -> "1E+30", -1.0E30 -> "-1E+30", while a NEGATIVE
  // exponent already carries its own "-" and needs no extra sign (ee01's
  // oracle: 1.6688933612840628E-7f's own Float.toString, "1.6688934E-7",
  // is already correct as-is). `formatFloatText` below normalizes BOTH
  // pieces of a scientific-notation string (mantissa's trailing ".0",
  // exponent's missing "+") while leaving the ordinary non-scientific
  // case (no "E" at all) exactly as before.
  private def formatFloatText(s: String): String =
    val eIdx = s.indexOf('E')
    if eIdx >= 0 then
      val rawMantissa = s.substring(0, eIdx)
      val mantissa = if rawMantissa.endsWith(".0") then rawMantissa.dropRight(2) else rawMantissa
      val rawExp = s.substring(eIdx + 1)
      val exp = if rawExp.startsWith("-") || rawExp.startsWith("+") then rawExp else "+" + rawExp
      mantissa + "E" + exp
    else if s.endsWith(".0") then s.dropRight(2)
    else s

  // round-29 finding 5 investigation (ee06): DIVIDE/COMPUTE of two
  // COMP-2 values whose true IEEE-754 double quotient is not exactly
  // decimal-representable (e.g. 12.5 / 3.25) exposed a THIRD gap in
  // this function - `v.toString` gives the shortest STRING that still
  // round-trips back to the exact same 64-bit double (Java/Scala's own
  // convention, up to 17 significant digits), but cobc's own COMP-2
  // DISPLAY caps at 16 significant digits and TRUNCATES (does not
  // round) any further ones - compiler-verified against installed
  // GnuCOBOL with several non-terminating quotients: 100.0/3.0 ->
  // "33.33333333333333" (not Scala's own 17-digit
  // "33.333333333333336"), 1.0/7.0 -> "0.1428571428571428" (not
  // "0.14285714285714285"), 12.5/3.25 -> "3.846153846153846" (not
  // "3.8461538461538463") - every case truncates the 17th significant
  // digit away entirely rather than rounding the 16th one up, confirmed
  // by 100.0/3.0's own last kept digit staying "3" (Scala's 17th digit
  // there is "6", which would round the 16th digit UP to "4" if this
  // were genuine rounding, not truncation). `BigDecimal(v).round(...,
  // RoundingMode.DOWN)` is an exact match: DOWN always truncates toward
  // zero at the given precision, never rounds. A value that already fits
  // in 16 significant digits (every whole/short value round-7 originally
  // verified this function against, and every special magnitude round-29
  // finding 4 added - 0.0, 1.0E30, -1.0E30) is a complete no-op here -
  // this ONLY changes a Double whose OWN shortest round-trip text needs
  // more than 16 significant digits, i.e. exactly the previously-
  // unexercised case ee06 uncovered. COMP-1 (Float) never needs this at
  // all - a 32-bit float's own maximum meaningful precision (~9
  // significant digits) never approaches this 16-digit cap - so
  // floatDisplaySingle below intentionally does NOT call this.
  //
  // Defensive guard: `BigDecimal(v)` throws for NaN/+-Infinity (neither
  // has any decimal representation at all) - COBOL arithmetic has no
  // portable notion of either (a genuine divide-by-zero is normally
  // caught by ON SIZE ERROR before a NaN/Infinity value could ever reach
  // a DISPLAY at all), but this must not CRASH the whole program over an
  // edge case no corpus program is known to exercise either way - `v` is
  // returned unchanged (its own `.toString`, "NaN"/"Infinity", is at
  // least a visible, non-crashing marker) rather than let the exception
  // escape.
  private def truncateSignificantDigits(v: Double, maxDigits: Int): Double =
    if v.isNaN || v.isInfinite then v
    else BigDecimal(v).round(new java.math.MathContext(maxDigits, java.math.RoundingMode.DOWN)).toDouble

  def floatDisplay(v: Double): String = formatFloatText(truncateSignificantDigits(v, 16).toString)

  // round-29 finding 4 (ee07/ee04): COMP-1's own genuine 32-bit Float -
  // calling floatDisplay(v: Double) with an actual Float value forced an
  // implicit Float->Double WIDENING before this function ever saw it,
  // introducing REAL extra (wrong) precision digits into the string (a
  // widened 32-bit bit pattern is only an approximation of the original
  // decimal value at 64-bit precision) - e.g. 1.0E30f widened to Double
  // stringifies as "1.0000000150474662E30" instead of the true 32-bit
  // shortest-round-trip text "1.0E30" (verified against installed
  // GnuCOBOL, ee07's oracle: cobc's own COMP-1 DISPLAY shows "1E+30", not
  // "1.0000000150474662E+30"). Operating on a genuine `Float` all the way
  // through - `v.toString` on an actual Float (never widened) - produces
  // the shortest round-tripping decimal text for the TRUE 32-bit value,
  // exactly like floatDisplay already does for a genuine Double.
  def floatDisplaySingle(v: Float): String = formatFloatText(v.toString)

  // Fixed-width alphanumeric MOVE alignment: default is truncate-right/
  // pad-right with spaces; JUSTIFIED RIGHT truncates-left/pads-left.
  def fitLeft(s: String, width: Int): String =
    if width <= 0 then s
    else if s.length >= width then s.substring(0, width)
    else s + (" " * (width - s.length))
  def fitRight(s: String, width: Int): String =
    if width <= 0 then s
    else if s.length >= width then s.substring(s.length - width)
    else (" " * (width - s.length)) + s

  // ---- Reference modification (identifier(start:length) / identifier(start:)) ----
  // `text` is the base item's full storage text; `start` is 1-based and `len`
  // is Int.MinValue for the open-ended (start:) form (runs to the end).
  // cobc (no -debug) does NOT range-check at runtime - an out-of-range
  // reference reads/writes adjacent memory (undefined). That is surfaced here
  // as a visible runtime error instead. A zero length is accepted (empty
  // slice), matching cobc.
  def refModLen(text: String, start: Int, len: Int): Int =
    if len == Int.MinValue then text.length - start + 1 else len
  def refModFillLen(len: Int): Int = if len < 0 then 0 else len
  private def refModCheck(text: String, start: Int, len: Int): Unit =
    if start < 1 || len < 0 || start - 1 + len > text.length then
      throw new IndexOutOfBoundsException(s"reference modification ($start:$len) is out of range for a ${text.length}-character item")
  def refModSlice(text: String, start: Int, len: Int): String =
    val l = refModLen(text, start, len)
    refModCheck(text, start, l)
    text.substring(start - 1, start - 1 + l)
  def refModPatch(text: String, start: Int, len: Int, value: String): String =
    val l = refModLen(text, start, len)
    refModCheck(text, start, l)
    text.substring(0, start - 1) + fitLeft2(value, l) + text.substring(start - 1 + l)
  private def fitLeft2(s: String, width: Int): String =
    if s.length >= width then s.substring(0, width) else s + (" " * (width - s.length))
  def refModUnsupported(what: String): Nothing =
    throw new UnsupportedOperationException("reference modification not supported for this item: " + what)
  // Alphanumeric comparison: the shorter operand is space-padded.
  def alnumCompare(a: String, b: String): Int =
    val n = math.max(a.length, b.length)
    fitLeft2(a, n).compareTo(fitLeft2(b, n))
  // Storage text of a SIGNED DISPLAY numeric (default trailing overpunch: a
  // negative value's last digit is stored as 'p'..'y').
  def zonedText(v: BigDecimal, intDigits: Int, decDigits: Int): String =
    val d = digitsOf(v, intDigits, decDigits)
    if v.signum < 0 && d.nonEmpty then d.init + (d.last - '0' + 'p').toChar else d
  // Inverse of digitsOf/zonedText: storage text -> numeric value (a non-digit
  // character contributes 0, like a space in cobc's DISPLAY decode).
  def refModToNumeric(text: String, decDigits: Int, signed: Boolean): BigDecimal =
    var neg = false
    val sb = new StringBuilder
    for (c, i) <- text.zipWithIndex do
      if signed && i == text.length - 1 && c >= 'p' && c <= 'y' then { neg = true; sb.append((c - 'p' + '0').toChar) }
      else sb.append(if c >= '0' && c <= '9' then c else '0')
    val mag = BigDecimal(BigInt(if sb.isEmpty then "0" else sb.toString), decDigits)
    if neg then -mag else mag

  // Unsigned display-digit text of a numeric value, zero-padded to
  // intDigits+decDigits with no decimal point character (COBOL's implied
  // V occupies no storage) and no sign - used when a numeric item is
  // MOVEd to an alphanumeric receiver, which takes the sending item's raw
  // digit characters only.
  def digitsOf(v: BigDecimal, intDigits: Int, decDigits: Int): String =
    val absVal = v.abs
    val totalDigits = intDigits + decDigits
    val unscaled = (absVal * BigDecimal(10).pow(decDigits)).setScale(0, BigDecimal.RoundingMode.HALF_UP).toBigInt.toString
    if unscaled.length < totalDigits then ("0" * (totalDigits - unscaled.length)) + unscaled else unscaled.takeRight(math.max(totalDigits, unscaled.length))

  // FUNCTION NUMVAL argument parsing: COBOL allows spaces anywhere around
  // the (optional, leading or trailing) sign - not just at the very start/
  // end of the string - e.g. '+  12.5' and '12.5-' are both COBOL-legal.
  // BigDecimal's own parser only tolerates leading/trailing whitespace, so
  // every space is stripped first (spaces are never significant inside a
  // NUMVAL argument - they only ever separate a sign from its digits), the
  // sign (wherever it ended up) is normalized to the front, and what
  // remains is parsed as a plain signed decimal.
  // round-8 finding 2: `decimalComma` (SPECIAL-NAMES' DECIMAL-POINT IS
  // COMMA - same convention/flag as `num`/`edited` above) swaps which
  // punctuation character NUMVAL treats as the decimal point: under
  // DECIMAL-POINT IS COMMA, "," is the decimal point (normalized to "."
  // for BigDecimal's own parser, which only understands ".") and "." is
  // the digit-grouping separator (stripped, same as "," is stripped in
  // the default/non-comma mode) - compiler-verified against installed
  // GnuCOBOL (tests/oracle - v05c's oracle output, round-8 refutation:
  // NUMVAL("123,45") under DECIMAL-POINT IS COMMA is 123.45, not a parse
  // failure). Defaults to false, matching every call site that predates
  // this finding.
  def numval(s: String, decimalComma: Boolean = false): BigDecimal =
    val compact = s.filterNot(_.isWhitespace)
    val hasLeadingSign = compact.nonEmpty && (compact.head == '+' || compact.head == '-')
    val hasTrailingSign = compact.nonEmpty && (compact.last == '+' || compact.last == '-')
    val negative = (hasLeadingSign && compact.head == '-') || (hasTrailingSign && compact.last == '-')
    var digits = compact
    if hasLeadingSign then digits = digits.drop(1)
    if hasTrailingSign then digits = digits.dropRight(1)
    val normalized =
      if decimalComma then digits.filterNot(_ == '.').replace(',', '.') else digits.filterNot(_ == ',')
    if normalized.isEmpty then BigDecimal(0) else BigDecimal((if negative then "-" else "") + normalized)

  // Oct-2026 (probe 1): DISPLAY of a numeric-valued FUNCTION result computed
  // at runtime (NUMVAL, NUMVAL-C, MOD) - cobc stores such a result in an
  // anonymous field sized by the VALUE's magnitude, not by any PICTURE
  // (compiler-verified, oracle programs rr01/rr02): trailing fractional
  // zeros are dropped (scale = remaining decimals); if the unscaled
  // magnitude fits 32 bits (31 when negative) and scale < 10 the field is 9
  // digits wide, else if it fits 64 bits and scale < 19 it is 20 digits
  // wide, else exactly as wide as the value. High-order digits beyond the
  // width are lost, a decimal point is shown only for scale > 0, and the
  // sign is shown only when negative (never "+").
  def intrinsicNum(v0: BigDecimal): String =
    val j = if v0.signum == 0 then java.math.BigDecimal.ZERO else v0.bigDecimal.stripTrailingZeros
    val scale = math.max(j.scale, 0)
    val neg = j.signum < 0
    val u = j.abs.setScale(scale).unscaledValue
    val bits = u.bitLength
    val ustr = u.toString
    val width =
      if scale < 10 && bits < (if neg then 32 else 33) then 9
      else if scale < 19 && bits <= 64 then 20
      else math.max(ustr.length, scale)
    val digits = if ustr.length < width then ("0" * (width - ustr.length)) + ustr else ustr.takeRight(width)
    val body = if scale > 0 then digits.dropRight(scale) + "." + digits.takeRight(scale) else digits
    (if neg then "-" else "") + body

  // Numeric MOVE truncation to a target's declared digit widths: extra
  // low-order decimal digits are dropped (never rounded - MOVE truncates,
  // it does not round), and extra high-order integer digits are dropped
  // (COBOL keeps only the low-order integerDigits digits, sign preserved -
  // matches BigDecimal's `%` remainder, which truncates toward zero).
  def truncNumeric(v: BigDecimal, intDigits: Int, decDigits: Int): BigDecimal =
    val scaled = v.setScale(decDigits, BigDecimal.RoundingMode.DOWN)
    val whole = scaled.setScale(0, BigDecimal.RoundingMode.DOWN)
    val frac = scaled - whole
    val mod = BigDecimal(10).pow(math.max(intDigits, 0))
    (whole % mod) + frac

  // Oct-2026 (fuzzer class D): COBOL division inside a COMPUTE expression
  // (libcob cob_decimal_div, cobc 4.0-early default dialect): the quotient
  // is TRUNCATED toward zero at max(scaleA - scaleB, 0) + 38 decimal places
  // (shift = 38 + max(scaleB - scaleA, 0); a zero dividend yields 0), and only
  // the final store truncates/rounds it to the receiver. Scala's own
  // BigDecimal `/` (MathContext.DECIMAL128 = 34 significant digits, HALF_EVEN)
  // ROUNDS instead, so (1/3)*3 came out 1 where cobc gives 0.999...9.
  // Division by zero keeps the plain BigDecimal behaviour.
  // ex() lifts a value to an UNLIMITED-precision MathContext: Scala's +,-,*
  // on a default-context BigDecimal also round to 34 significant digits
  // (cobc keeps every intermediate exact), and the context of the LEFT operand
  // wins, so a COMPUTE expression containing a division is built from ex() lefts.
  def ex(v: BigDecimal): BigDecimal = BigDecimal.decimal(v.bigDecimal, java.math.MathContext.UNLIMITED)

  def div(a: BigDecimal, b: BigDecimal): BigDecimal =
    if b.signum == 0 then a / b
    else if a.signum == 0 then BigDecimal(0)
    else
      val s = a.scale - b.scale
      val shift = 38 + (if s < 0 then -s else 0)
      val q = a.bigDecimal.unscaledValue.multiply(java.math.BigInteger.TEN.pow(shift)).divide(b.bigDecimal.unscaledValue)
      BigDecimal.decimal(new java.math.BigDecimal(q, s + shift), java.math.MathContext.UNLIMITED)

  // Arithmetic-assignment store-time semantics for a ROUNDED target
  // (COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE ... ROUNDED): HALF_UP rounding
  // to the target's declared decimal digits (COBOL's ROUNDED clause),
  // then the same high-order integer-digit truncation truncNumeric applies
  // (a ROUNDED result can still overflow the target's integer capacity,
  // and COBOL truncates the high-order digits exactly the same way with
  // or without ROUNDED).
  def roundNumeric(v: BigDecimal, intDigits: Int, decDigits: Int): BigDecimal =
    val scaled = v.setScale(decDigits, BigDecimal.RoundingMode.HALF_UP)
    val whole = scaled.setScale(0, BigDecimal.RoundingMode.DOWN)
    val frac = scaled - whole
    val mod = BigDecimal(10).pow(math.max(intDigits, 0))
    (whole % mod) + frac

  // ON SIZE ERROR digit-capacity test: true when the *integer* part of v
  // fits within intDigits decimal digits (COBOL's SIZE ERROR condition is
  // about integer-digit overflow only - the fractional part is simply
  // truncated/rounded as normal and never triggers it).
  def fitsDigits(v: BigDecimal, intDigits: Int): Boolean =
    if intDigits <= 0 then v.abs.signum == 0
    else v.abs.toBigInt.toString.length <= intDigits

  // Runtime port of the generator's formatEditedPicture (see
  // generator/expression-gen.js) for a numeric-edited MOVE whose source
  // value is not known until runtime (a variable/expression, not a
  // compile-time literal). rawValue is already-formatted signed decimal
  // text (see numericRawValueExpr at the call site).
  // `decimalComma` (round-7 finding 5, same convention as `num` above):
  // under SPECIAL-NAMES' DECIMAL-POINT IS COMMA, "," (not ".") is the
  // edit pattern's decimal-point insertion character - e.g. `PIC ZZ9,99`
  // means what `PIC ZZ9.99` means by default (3 integer + 2 decimal
  // digit positions, decimal point rendered as ",") - compiler-verified
  // (u03b's oracle output). Defaults to false, matching every call site
  // that predates this finding.
  def edited(editPattern: String, rawValue: String, blankWhenZero: Boolean, decimalComma: Boolean = false): String =
    val decimalMarker = if decimalComma then ',' else '.'
    var corePattern = editPattern
    var trailingSign: String = null
    if corePattern.endsWith("CR") || corePattern.endsWith("DB") then
      trailingSign = corePattern.substring(corePattern.length - 2)
      corePattern = corePattern.substring(0, corePattern.length - 2)

    val raw = rawValue.trim
    val neg = raw.startsWith("-")
    val unsignedRaw = if raw.startsWith("-") || raw.startsWith("+") then raw.substring(1) else raw
    val dotIdx = unsignedRaw.indexOf(".")
    val intRaw = if dotIdx == -1 then unsignedRaw else unsignedRaw.substring(0, dotIdx)
    val decRaw = if dotIdx == -1 then "" else unsignedRaw.substring(dotIdx + 1)

    val chars = corePattern.toCharArray.toVector
    case class DigitPos(idx: Int, fixed: Boolean, isDecimal: Boolean, var digit: Char)

    var seenDecimalPoint = false
    val digitPositions = scala.collection.mutable.ArrayBuffer[DigitPos]()
    var floatingChar: Char = 0
    val floatingIndices = scala.collection.mutable.ArrayBuffer[Int]()
    var fixedSymbolIdx = -1
    var fixedSymbolChar: Char = 0
    val symCount = scala.collection.mutable.Map('$' -> 0, '+' -> 0, '-' -> 0)
    for ch <- chars if symCount.contains(ch) do symCount(ch) += 1

    for idx <- chars.indices do
      val ch = chars(idx)
      if ch == decimalMarker then
        seenDecimalPoint = true
      else if ch == '9' || ch == 'Z' || ch == '*' then
        digitPositions += DigitPos(idx, ch == '9', seenDecimalPoint, '0')
      else if ch == '$' || ch == '+' || ch == '-' then
        if symCount(ch) >= 2 then
          digitPositions += DigitPos(idx, false, seenDecimalPoint, '0')
          floatingChar = ch
          floatingIndices += idx
        else
          fixedSymbolIdx = idx
          fixedSymbolChar = ch

    val intDigitCount = digitPositions.count(d => !d.isDecimal)
    val decDigitCount = digitPositions.count(d => d.isDecimal)
    val intDigits = if intDigitCount == 0 then "" else ("0" * math.max(intDigitCount - intRaw.length, 0) + intRaw).takeRight(intDigitCount)
    val decDigitsStr = if decDigitCount == 0 then "" else (decRaw + ("0" * decDigitCount)).take(decDigitCount)
    val digitsStr = intDigits + decDigitsStr
    for i <- digitPositions.indices do digitPositions(i).digit = digitsStr(i)

    var firstShown = digitPositions.indexWhere(d => d.fixed || d.digit != '0')
    if firstShown == -1 then firstShown = digitPositions.length

    var boundaryIdx = -1
    var symbolChar: Char = 0
    if floatingIndices.length >= 2 then
      symbolChar = floatingChar
      boundaryIdx = if firstShown > 0 then digitPositions(firstShown - 1).idx else floatingIndices(0)

    val floatingSignChar = symbolChar match
      case '+' => if neg then "-" else "+"
      case '-' => if neg then "-" else " "
      case '$' => "$"
      case _ => ""
    val fixedSignChar = fixedSymbolChar match
      case '+' => if neg then "-" else "+"
      case '-' => if neg then "-" else " "
      case '$' => "$"
      case _ => ""

    val shownFromIdx =
      if boundaryIdx != -1 then boundaryIdx
      else if firstShown < digitPositions.length then digitPositions(firstShown).idx
      else chars.length

    val out = new StringBuilder
    for idx <- chars.indices do
      val ch = chars(idx)
      if ch == '.' then
        out += (if idx >= shownFromIdx then '.' else ' ')
      else if ch == '9' || ch == 'Z' || ch == '*' then
        val arrIdx = digitPositions.indexWhere(_.idx == idx)
        out += (if arrIdx >= firstShown then digitPositions(arrIdx).digit else ' ')
      else if ch == '$' || ch == '+' || ch == '-' then
        if idx == fixedSymbolIdx then out ++= fixedSignChar
        else if idx == boundaryIdx then out ++= floatingSignChar
        else
          val arrIdx = digitPositions.indexWhere(_.idx == idx)
          out += (if arrIdx != -1 && arrIdx >= firstShown then digitPositions(arrIdx).digit else ' ')
      else
        out += (if idx >= shownFromIdx then ch else ' ')

    var result = out.toString
    if trailingSign != null then result = result + (if neg then trailingSign else "  ")

    val allZero = digitsStr.forall(_ == '0')
    if blankWhenZero && allZero then " " * editPattern.length else result

// CobolInspect: INSPECT TALLYING/REPLACING helpers
object CobolInspect:
  def tallyAll(s: String, pat: String): Int =
    if pat.isEmpty then 0
    else
      var i = 0
      var c = 0
      while i <= s.length - pat.length do
        if s.regionMatches(i, pat, 0, pat.length) then
          c += 1
          i += pat.length
        else
          i += 1
      c
  def tallyLeading(s: String, pat: String): Int =
    if pat.isEmpty then 0
    else
      var i = 0
      var c = 0
      while s.regionMatches(i, pat, 0, pat.length) do
        c += 1
        i += pat.length
      c
  def replaceAll(s: String, from: String, to: String): String =
    if from.isEmpty then s else s.replace(from, to)
  def replaceFirst(s: String, from: String, to: String): String =
    val i = s.indexOf(from)
    if i < 0 then s else s.substring(0, i) + to + s.substring(i + from.length)
  def replaceLeading(s: String, from: String, to: String): String =
    val sb = new StringBuilder(s)
    var i = 0
    while from.nonEmpty && i <= s.length - from.length && sb.toString.regionMatches(i, from, 0, from.length) do
      for j <- 0 until math.min(from.length, to.length) do sb.setCharAt(i + j, to(j))
      i += from.length
    sb.toString
  def replaceTrailing(s: String, from: String, to: String): String =
    val sb = new StringBuilder(s)
    var i = s.length - from.length
    while from.nonEmpty && i >= 0 && sb.toString.regionMatches(i, from, 0, from.length) do
      for j <- 0 until math.min(from.length, to.length) do sb.setCharAt(i + j, to(j))
      i -= from.length
    sb.toString
  def replaceCharacters(s: String, to: String): String =
    if to.isEmpty then s else to.head.toString * s.length
  // INSPECT ... BEFORE/AFTER INITIAL <boundary> (round-4 finding 3): split
  // `s` into (the piece an operation should actually scan/modify, the
  // untouched complement to reattach) around the *first* occurrence of
  // `boundary`. beforeInitial's region is everything up to (not including)
  // that occurrence; afterInitial's region is everything after it (the
  // boundary text itself belongs to the *unchanged* complement in both
  // cases). No occurrence at all: BEFORE treats the whole string as the
  // region (nothing to exclude), AFTER treats the region as empty (nothing
  // "after" an occurrence that never happened).
  def beforeInitial(s: String, boundary: String): (String, String) =
    if boundary.isEmpty then (s, "")
    else
      val i = s.indexOf(boundary)
      if i < 0 then (s, "") else (s.substring(0, i), s.substring(i))
  def afterInitial(s: String, boundary: String): (String, String) =
    if boundary.isEmpty then (s, "")
    else
      val i = s.indexOf(boundary)
      if i < 0 then (s, "") else (s.substring(0, i + boundary.length), s.substring(i + boundary.length))

  // round-14 finding 2: a SINGLE INSPECT statement carrying MULTIPLE
  // REPLACING clauses (e.g. `REPLACING ALL "A" BY "B" ALL "B" BY "A"`) must
  // have every clause match against the PRE-STATEMENT snapshot of the
  // subject, in ONE left-to-right scan - not a cascade where each clause's
  // own textual output feeds the next clause's input (`AAAABBBB` with the
  // two clauses above must become `BBBBAAAA`, not `AAAAAAAA` - a naive
  // sequential .replace/.replace would first turn every `A` into `B`
  // (`BBBBBBBB`), then every `B` - including the ones the first pass just
  // wrote - into `A` (`AAAAAAAA`)). Mirrors real COBOL's own rule: scanning
  // left to right one position at a time, the FIRST clause (in the order
  // written) whose comparand matches at that position wins; matched
  // characters are then skipped over (not re-examined by a later clause).
  case class ReplClause(kind: String, from: String, to: String, regionType: String, regionBoundary: String)

  private def replRegion(s: String, c: ReplClause): (Int, Int) =
    val n = s.length
    c.regionType match
      case "BEFORE" =>
        if c.regionBoundary.isEmpty then (0, n)
        else
          val i = s.indexOf(c.regionBoundary)
          if i < 0 then (0, n) else (0, i)
      case "AFTER" =>
        if c.regionBoundary.isEmpty then (0, n)
        else
          val i = s.indexOf(c.regionBoundary)
          if i < 0 then (n, n) else (i + c.regionBoundary.length, n)
      case _ => (0, n)

  // TRAILING's own contiguous run is anchored at the END of its region -
  // precomputed here (non-destructively, against the original text) exactly
  // like the single-clause replaceTrailing helper's own backward scan.
  private def replTrailingZoneStart(s: String, c: ReplClause, start: Int, end: Int): Int =
    if c.from.isEmpty then end
    else
      var i = end - c.from.length
      while i >= start && s.regionMatches(i, c.from, 0, c.from.length) do i -= c.from.length
      i + c.from.length

  // Position-preserving overwrite (LEADING/TRAILING/CHARACTERS convention -
  // matches replaceLeading/replaceTrailing's own setCharAt-based partial
  // overwrite): only the first min(from.length, to.length) characters of
  // the matched span actually change; any remaining positions keep their
  // original text.
  private def replPadded(s: String, start: Int, spanLen: Int, to: String): String =
    val sb = new StringBuilder
    var j = 0
    while j < spanLen do
      sb.append(if j < to.length then to(j) else s.charAt(start + j))
      j += 1
    sb.toString

  def replaceMultiClause(s: String, clauses: Seq[ReplClause]): String =
    val n = s.length
    val regions = clauses.map(c => replRegion(s, c))
    val trailingStarts = clauses.zip(regions).map { case (c, (start, end)) =>
      if c.kind == "TRAILING" then replTrailingZoneStart(s, c, start, end) else -1
    }
    val leadingActive = Array.fill(clauses.length)(true)
    val firstDone = Array.fill(clauses.length)(false)
    val out = new StringBuilder
    var i = 0
    while i < n do
      var consumed = false
      var ci = 0
      while !consumed && ci < clauses.length do
        val c = clauses(ci)
        val (rStart, rEnd) = regions(ci)
        if i >= rStart && i < rEnd then
          c.kind match
            case "CHARACTERS" =>
              out.append(if c.to.nonEmpty then c.to.head else s.charAt(i))
              i += 1
              consumed = true
            case "ALL" =>
              if c.from.nonEmpty && i + c.from.length <= rEnd && s.regionMatches(i, c.from, 0, c.from.length) then
                out.append(c.to)
                i += c.from.length
                consumed = true
            case "FIRST" =>
              if !firstDone(ci) && c.from.nonEmpty && i + c.from.length <= rEnd && s.regionMatches(i, c.from, 0, c.from.length) then
                out.append(c.to)
                i += c.from.length
                firstDone(ci) = true
                consumed = true
            case "LEADING" =>
              if leadingActive(ci) then
                if c.from.nonEmpty && i + c.from.length <= rEnd && s.regionMatches(i, c.from, 0, c.from.length) then
                  out.append(replPadded(s, i, c.from.length, c.to))
                  i += c.from.length
                  consumed = true
                else
                  leadingActive(ci) = false
            case "TRAILING" =>
              if c.from.nonEmpty && i >= trailingStarts(ci) && ((i - trailingStarts(ci)) % c.from.length == 0) && i + c.from.length <= rEnd then
                out.append(replPadded(s, i, c.from.length, c.to))
                i += c.from.length
                consumed = true
            case _ => ()
        ci += 1
      if !consumed then
        out.append(s.charAt(i))
        i += 1
    out.toString

// CobolUnstring: UNSTRING scanning helper
object CobolUnstring:
  // Fourth element (round-6 finding 6): true when the source held MORE
  // delimited fields than there were INTO targets to receive them (some
  // of the source was left unexamined because every receiver was already
  // full) - compiler-verified against installed GnuCOBOL (t12): exactly
  // "hit the maxFields cap while text after the last-consumed delimiter
  // still remains", not merely "maxFields fields were produced" (an exact
  // fit - the last field consuming the source right up to its end - is
  // NOT overflow).
  def unstring(source: String, startPos: Int, delims: Seq[(String, Boolean)], maxFields: Int): (Vector[String], Vector[String], Int, Boolean) =
    var pos = math.max(0, math.min(startPos, source.length))
    var fields = Vector.empty[String]
    var matched = Vector.empty[String]
    var continue_ = true
    while fields.length < maxFields && continue_ do
      var bestIdx = -1
      var bestText = ""
      var bestAll = false
      for (text, all) <- delims if text.nonEmpty do
        val i = source.indexOf(text, pos)
        if i >= 0 && (bestIdx == -1 || i < bestIdx) then
          bestIdx = i
          bestText = text
          bestAll = all
      if bestIdx == -1 then
        fields = fields :+ source.substring(pos)
        matched = matched :+ ""
        pos = source.length
        continue_ = false
      else
        fields = fields :+ source.substring(pos, bestIdx)
        var endPos = bestIdx + bestText.length
        if bestAll then
          while endPos <= source.length - bestText.length && source.regionMatches(endPos, bestText, 0, bestText.length) do
            endPos += bestText.length
        matched = matched :+ bestText
        pos = endPos
    val overflow = fields.length == maxFields && pos < source.length
    (fields, matched, pos, overflow)

// Data structures
case class WsTable(
  wsItem: Vector[Int]
)

object WsTable:
  val recordLength: Int = 15

  def parse(bytes: Array[Byte]): WsTable =
    var offset = 0
    // TODO(ODO): 'wsItem' is OCCURS ... DEPENDING ON WS-COUNT - parsing the fixed max count (5) for round-trip stability; dynamic length not implemented
    val wsItem = (0 until 5).map { _ =>
      val elem = CobolCodecs.zonedDecode(bytes.slice(offset, offset + 3), scale = 0, signed = false, signLeading = false, signSeparate = false, codePage = "ASCII").toIntExact
      offset += 3
      elem
    }.toVector
    WsTable(wsItem)

  def format(record: WsTable): Array[Byte] =
    val buffer = new Array[Byte](recordLength)
    var offset = 0
    record.wsItem.foreach { elem =>
      val elemBytes = CobolCodecs.zonedEncode(BigDecimal(elem), 3, scale = 0, signed = false, signLeading = false, signSeparate = false, codePage = "ASCII")
      System.arraycopy(elemBytes, 0, buffer, offset, 3)
      offset += 3
    }
    buffer
end WsTable

object X11odo:

  // Working storage
  var wsCount: Int = 3
  var wsItem: Vector[Int] = Vector.fill(5)(0)
  var wsI: Int = 0

  // Procedures
  def mainPara(): Unit =
    wsItem = wsItem.updated(0, 111)
    wsItem = wsItem.updated(1, 222)
    wsItem = wsItem.updated(2, 333)
    scala.util.boundary {
      wsI = 1
      while !(wsI > wsCount) do
        println("ITEM(" + CobolFmt.num(BigDecimal(wsI), 2, 0, false, false) + ")=" + CobolFmt.num(BigDecimal(wsItem((wsI - 1).toInt.max(0))), 3, 0, false, false))
        if wsI == 2 then
          wsCount = 5
          wsItem = wsItem.updated(3, 444)
          wsItem = wsItem.updated(4, 555)
        wsI = (CobolFmt.truncNumeric(BigDecimal(wsI) + BigDecimal("1"), 2, 0).abs).toInt
    }
    println("FINAL COUNT=" + CobolFmt.num(BigDecimal(wsCount), 2, 0, false, false))
    wsCount = 2
    println("ITEM(4) AFTER SHRINK=" + CobolFmt.num(BigDecimal(wsItem(3)), 3, 0, false, false))
    sys.exit(0)

  @main def run(): Unit =
    def _step0(): Unit =
      mainPara()
    _step0()
end X11odo
