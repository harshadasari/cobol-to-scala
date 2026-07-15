package com.thyraa.cobol.runtime

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
