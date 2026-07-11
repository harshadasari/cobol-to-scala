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
 *   - Binary (COMP / COMP-4 / COMP-5 / BINARY): big-endian two's complement,
 *     2/4/8 bytes chosen by digit count (1-4/5-9/10-18).
 *   - Zoned decimal (DISPLAY numeric) with sign overpunch (embedded in the
 *     zone of the leading or trailing digit) or SIGN ... SEPARATE.
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
      val sb = new StringBuilder
      var i = 0
      while i < bytes.length - 1 do
        val b = bytes(i) & 0xff
        sb.append((b >> 4) & 0x0f)
        sb.append(b & 0x0f)
        i += 1
      end while
      val last = bytes(bytes.length - 1) & 0xff
      sb.append((last >> 4) & 0x0f)
      val signNibble = last & 0x0f

      // C/E/A/F are treated as positive-or-unsigned; D/B are negative. C, D
      // and F are the only nibbles our own encoder emits; A/B/E are accepted
      // here for tolerance of packed decimal produced by other mainframe software.
      val negative = signNibble == 0xd || signNibble == 0xb
      val magnitude = BigInt(sb.toString)
      val unscaled = if negative then -magnitude else magnitude
      BigDecimal(unscaled, scale)

  // ==========================================================================
  // Binary (COMP / COMP-4 / COMP-5 / BINARY)
  // ==========================================================================

  /** Byte width for a binary (COMP) field with the given total digit count. */
  def binaryByteLength(digits: Int): Int =
    requireDigits(digits)
    if digits <= 4 then 2
    else if digits <= 9 then 4
    else 8

  /**
   * Encode a signed Long as big-endian two's complement bytes.
   * @param byteLength 1-8 (2, 4 and 8 are the COBOL-meaningful widths)
   */
  def binaryEncode(value: Long, byteLength: Int): Array[Byte] =
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
    bytes

  /** Decode big-endian two's complement bytes (up to 8) to a signed Long. */
  def binaryDecode(bytes: Array[Byte]): Long =
    val byteLength = bytes.length
    if byteLength == 0 then 0L
    else
      var result = 0L
      var i = 0
      while i < byteLength do
        result = (result << 8) | (bytes(i) & 0xff).toLong
        i += 1
      end while
      if byteLength < 8 then
        val bits = byteLength * 8
        val signBit = 1L << (bits - 1)
        if (result & signBit) != 0 then result -= (1L << bits)
      result

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
  // The overpunch table is expressed as characters (not raw EBCDIC nibbles)
  // because the same table is used for both EBCDIC (via the cp037 table
  // below) and ASCII-native zoned decimal: positive digit 0-9 -> { A-I,
  // negative digit 0-9 -> } J-R. (This is exactly why cp037 byte 0xC0 is
  // '{': the positive digit zone is 0xC0-0xC9 and 0xC1-0xC9 already coincide
  // with 'A'-'I' in EBCDIC.)
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
    val chars: Array[Char] =
      if separate then
        val signChar = if negative then '-' else '+'
        if signLeading then signChar +: digitChars else digitChars :+ signChar
      else if signed then
        val idx = if signLeading then 0 else digitChars.length - 1
        digitChars(idx) = overpunchChar(digitChars(idx) - '0', negative)
        digitChars
      else digitChars

    charsToBytes(chars, codePage)

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
    val chars = bytesToChars(bytes, codePage)
    val separate = signed && signSeparate

    val (negative, digitChars): (Boolean, Array[Char]) =
      if separate then
        if signLeading then (chars.head == '-', chars.tail)
        else (chars.last == '-', chars.init)
      else if signed then
        val idx = if signLeading then 0 else chars.length - 1
        val (digit, neg) = overpunchDecode(chars(idx))
        val copy = chars.clone()
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
