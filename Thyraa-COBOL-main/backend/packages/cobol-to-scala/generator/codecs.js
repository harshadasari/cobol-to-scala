/**
 * codecs.js
 * Pure-JS reference implementations of mainframe byte-level data codecs.
 *
 * These are the ground truth for how the generated Scala (`runtime/CobolCodecs.scala`)
 * must behave: every function here has a byte-for-byte equivalent on the Scala side.
 * `tests/codecs.test.js` exercises only this file (Scala is not executed by node:test).
 *
 * Covers:
 *   - Packed decimal (COMP-3 / PACKED-DECIMAL): two digits per byte, sign nibble last.
 *   - Binary (COMP / COMP-4 / COMP-5 / BINARY): two's complement. Byte ORDER
 *     is big-endian for COMP/COMP-4/BINARY but little-endian (host-native)
 *     for COMP-5 - compiler-verified against real GnuCOBOL, see
 *     tests/oracle/codec-refutation.md - so binaryEncode/binaryDecode take
 *     an explicit `{ endianness: 'BIG'|'LITTLE' }` option (default 'BIG').
 *   - Zoned decimal (DISPLAY numeric): one digit per byte, with sign overpunch
 *     (embedded in the zone of a digit) or SIGN separate character. The
 *     non-separate sign scheme differs by codePage: 'EBCDIC' uses letter
 *     substitution, 'ASCII' swaps the sign digit's zone nibble (0x3x
 *     positive / 0x7x negative) - these are genuinely different byte
 *     schemes, not the same table viewed through two charsets.
 *   - EBCDIC code page 037 <-> Unicode, full 256-code-point translation.
 *
 * All numeric encode/decode functions operate on BigInt so that 18-digit COBOL
 * fields (which exceed Number.MAX_SAFE_INTEGER) round-trip exactly.
 */

// ============================================================================
// Shared helpers
// ============================================================================

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) {
    // A non-safe-integer Number has already lost precision by the time it
    // reaches this function (e.g. 999999999999999999 as a literal silently
    // rounds to 1000000000000000000 before toBigInt ever sees it) - there is
    // no way to recover the true value here, so refuse instead of silently
    // encoding the wrong number. Caller must pass a BigInt or a string.
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(
        `toBigInt: ${value} exceeds Number.MAX_SAFE_INTEGER precision; pass a BigInt or string instead`
      );
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && value.trim() !== '') return BigInt(value);
  // All validation failures in this module use RangeError uniformly (mirrors
  // Scala's IllegalArgumentException) so callers can catch one error type.
  throw new RangeError(`expected a BigInt (or integer number/string), got ${typeof value}: ${value}`);
}

function assertDigits(digits) {
  if (!Number.isInteger(digits) || digits < 1 || digits > 18) {
    throw new RangeError(`digits must be an integer between 1 and 18 (COBOL max), got ${digits}`);
  }
}

// ============================================================================
// Packed Decimal (COMP-3 / PACKED-DECIMAL)
//
// Two decimal digits per byte (high nibble, low nibble), sign nibble occupies
// the low nibble of the final byte: 0xC = positive, 0xD = negative, 0xF =
// unsigned. Byte count = ceil((digits + 1) / 2); an even digit count leaves a
// leading pad nibble of 0 in the first byte.
// ============================================================================

/**
 * Number of packed-decimal bytes needed to store `digits` decimal digits
 * plus the trailing sign nibble.
 */
export function packedByteLength(digits) {
  assertDigits(digits);
  return Math.ceil((digits + 1) / 2);
}

/**
 * Encode a signed integer magnitude (BigInt, unscaled - i.e. no decimal
 * point, the scale is tracked by the caller/PIC clause) as COMP-3 bytes.
 *
 * @param {bigint} unscaled - signed integer value (e.g. 123456n for a value
 *   of 1234.56 at scale 2).
 * @param {number} digits - total number of decimal digits the field holds
 *   (integerDigits + decimalDigits), 1-18.
 * @param {{signed?: boolean}} [options] - signed defaults to true; pass
 *   `signed: false` for an unsigned PACKED-DECIMAL field (sign nibble 0xF,
 *   negative values rejected).
 * @returns {Uint8Array}
 */
export function packedEncode(unscaled, digits, options = {}) {
  const { signed = true } = options;
  const value = toBigInt(unscaled);
  assertDigits(digits);

  const negative = value < 0n;
  if (negative && !signed) {
    throw new RangeError(`packedEncode: unsigned field cannot hold negative value ${value}`);
  }

  const magnitude = negative ? -value : value;
  const digitStr = magnitude.toString();
  if (digitStr.length > digits) {
    throw new RangeError(`packedEncode: value ${value} needs more than ${digits} digits`);
  }
  const padded = digitStr.padStart(digits, '0');

  const signNibble = !signed ? 0xf : negative ? 0xd : 0xc;
  const byteLength = packedByteLength(digits);
  const totalNibbles = byteLength * 2;
  const padNibbles = totalNibbles - digits - 1; // 0 (odd digits) or 1 (even digits)

  const nibbles = new Uint8Array(totalNibbles);
  let idx = 0;
  for (let i = 0; i < padNibbles; i++) nibbles[idx++] = 0;
  for (let i = 0; i < padded.length; i++) nibbles[idx++] = padded.charCodeAt(i) - 48;
  nibbles[idx++] = signNibble;

  const bytes = new Uint8Array(byteLength);
  for (let b = 0; b < byteLength; b++) {
    bytes[b] = (nibbles[b * 2] << 4) | nibbles[b * 2 + 1];
  }
  return bytes;
}

/**
 * Decode COMP-3 bytes to { unscaled, scale, signed, negative }.
 * `scale` is only echoed back from the options for bookkeeping - packed
 * decimal bytes never store the decimal point position, that is a property
 * of the PIC clause and must be supplied by the caller.
 *
 * @param {Uint8Array|Buffer|number[]} bytes
 * @param {{scale?: number}} [options]
 */
export function packedDecode(bytes, options = {}) {
  const { scale = 0 } = options;
  if (!bytes || bytes.length === 0) {
    return { unscaled: 0n, scale, signed: true, negative: false };
  }

  // Collect digit nibbles as numbers (0-15), not characters: a naive
  // String(nibble) + /^[0-9]+$/ check is dead code here, because
  // String(10..15) yields "10".."15" - two ASCII digit characters that still
  // pass a digit-character regex even though the nibble itself (0xA-0xF) is
  // not a valid packed-decimal digit. Each nibble must be range-checked
  // directly as a number instead.
  const digitNibbles = [];
  for (let i = 0; i < bytes.length - 1; i++) {
    const b = bytes[i] & 0xff;
    digitNibbles.push((b >> 4) & 0x0f, b & 0x0f);
  }
  const last = bytes[bytes.length - 1] & 0xff;
  digitNibbles.push((last >> 4) & 0x0f);
  const signNibble = last & 0x0f;

  for (const nibble of digitNibbles) {
    if (nibble > 9) {
      throw new RangeError(`packedDecode: non-digit nibble 0x${nibble.toString(16)} encountered in digit position`);
    }
  }
  const digitStr = digitNibbles.join('');

  // C/E/A/F are treated as positive-or-unsigned; D/B are negative. C, D and F
  // are the only nibbles our own encoder emits; A/B/E are accepted on decode
  // for tolerance of packed decimal produced by other mainframe software.
  const negative = signNibble === 0xd || signNibble === 0xb;
  const signed = signNibble !== 0xf;

  const magnitude = BigInt(digitStr);
  const unscaled = negative ? -magnitude : magnitude;
  return { unscaled, scale, signed, negative };
}

// ============================================================================
// Binary (COMP / COMP-4 / COMP-5 / BINARY)
//
// Two's complement. Byte width is chosen by total digit count: 1-4 digits ->
// 2 bytes, 5-9 digits -> 4 bytes, 10-18 digits -> 8 bytes.
//
// Byte ORDER depends on which USAGE this is, confirmed against real GnuCOBOL
// (see tests/oracle/codec-refutation.md):
//   - COMP / COMP-4 / BINARY -> big-endian (the `binary-byteorder: big-endian`
//     dialect default), i.e. `endianness: 'BIG'` (the default here too).
//   - COMP-5 -> host-native byte order, which is little-endian on the x86_64
//     GnuCOBOL build this was verified against (`-fbinary-byteorder=native`
//     is COMP-5's defining behavior, independent of the dialect config), i.e.
//     `endianness: 'LITTLE'`.
// Callers (generator/case-class-gen.js) must pass 'LITTLE' only for COMP-5
// fields; every other binary USAGE stays 'BIG'.
// ============================================================================

/**
 * Byte width for a binary (COMP) field with the given total digit count.
 */
export function binaryByteLength(digits) {
  assertDigits(digits);
  if (digits <= 4) return 2;
  if (digits <= 9) return 4;
  return 8; // <= 18, enforced by assertDigits
}

function checkEndianness(endianness, fnName) {
  if (endianness !== 'BIG' && endianness !== 'LITTLE') {
    throw new RangeError(`${fnName}: invalid endianness '${endianness}', expected 'BIG' or 'LITTLE'`);
  }
}

/**
 * Encode a signed BigInt as two's complement bytes.
 *
 * @param {bigint} value
 * @param {number} byteLength - 1-8 (2, 4 and 8 are the COBOL-meaningful widths)
 * @param {{endianness?: 'BIG'|'LITTLE'}} [options] - 'BIG' (default) for
 *   COMP/COMP-4/BINARY, 'LITTLE' for COMP-5 (host-native on x86_64).
 * @returns {Uint8Array}
 */
export function binaryEncode(value, byteLength, options = {}) {
  const { endianness = 'BIG' } = options;
  checkEndianness(endianness, 'binaryEncode');
  const v = toBigInt(value);
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > 8) {
    throw new RangeError(`binaryEncode: invalid byteLength ${byteLength} (must be an integer 1-8)`);
  }
  const bits = BigInt(byteLength) * 8n;
  const max = (1n << (bits - 1n)) - 1n;
  const min = -(1n << (bits - 1n));
  if (v > max || v < min) {
    throw new RangeError(`binaryEncode: ${v} out of range for a ${byteLength}-byte signed field [${min}, ${max}]`);
  }

  const unsigned = v < 0n ? (1n << bits) + v : v;
  const bytes = new Uint8Array(byteLength);
  let rest = unsigned;
  for (let i = byteLength - 1; i >= 0; i--) {
    bytes[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  if (endianness === 'LITTLE') bytes.reverse();
  return bytes;
}

/**
 * Decode two's complement bytes to a signed BigInt.
 * @param {Uint8Array|Buffer|number[]} bytes - 0-8 bytes (anything wider than
 *   8 bytes has no COBOL binary-field meaning and is rejected rather than
 *   silently producing a wide/garbage value).
 * @param {{endianness?: 'BIG'|'LITTLE'}} [options]
 * @returns {bigint}
 */
export function binaryDecode(bytes, options = {}) {
  const { endianness = 'BIG' } = options;
  checkEndianness(endianness, 'binaryDecode');
  const byteLength = bytes.length;
  if (byteLength > 8) {
    throw new RangeError(`binaryDecode: buffer too long (${byteLength} bytes), max is 8 (COBOL COMP/COMP-5 width)`);
  }
  if (byteLength === 0) return 0n;

  const ordered = endianness === 'LITTLE' ? Array.from(bytes).reverse() : bytes;

  let value = 0n;
  for (let i = 0; i < byteLength; i++) {
    value = (value << 8n) | BigInt(ordered[i] & 0xff);
  }
  const bits = BigInt(byteLength) * 8n;
  const signBit = 1n << (bits - 1n);
  if (value & signBit) {
    value -= 1n << bits;
  }
  return value;
}

// ============================================================================
// Floating point (COMP-1 / COMP-2)
//
// round-28 finding 3: real IEEE-754 binary float (COMP-1, 4 bytes)/double
// (COMP-2, 8 bytes) encode/decode - added because NO byte-level codec existed
// for these USAGEs at all before this round (case-class-gen.js's
// classifyCodec labeled them 'legacy' and fell back to a text-truncation
// shortcut - `value.toString.reverse.padTo(len,'0').reverse.take(len)` - which
// silently corrupted precision the instant a COMP-1/COMP-2 field went through
// an actual file-record WRITE/REWRITE/READ round trip: e.g. -7.125 became the
// 4 ASCII bytes "-7.1", which then re-parsed as -7.099999904632568).
//
// Byte ORDER, like COMP-5 (see binaryEncode/binaryDecode's own doc comment
// above), is HOST-NATIVE - little-endian on the x86_64 GnuCOBOL build this was
// compiler-verified against - NOT the big-endian default COMP/COMP-4/BINARY
// use. Verified directly against installed GnuCOBOL (not just "compiles and
// runs"): a tiny COBOL program (FD record with a COMP-1 and a COMP-2 field,
// written via WRITE to a RELATIVE file, then hex-dumped) wrote 3.5 as
// COMP-1 bytes `00 00 60 40` and 2.25 as COMP-2 bytes `00 00 00 00 00 00 02
// 40` - each the EXACT reverse of the standard (big-endian) IEEE-754 bit
// pattern Java's Float.floatToIntBits(3.5f) (0x40600000) and
// Double.doubleToLongBits(2.25) (0x4002000000000000) produce. -7.125 (COMP-1
// `00 00 e4 c0`, reverse of 0xC0E40000) and 100.5 (COMP-2 `00 00 00 00 00 20
// 59 40`, reverse of 0x4059200000000000) confirm the same reversed-big-endian
// (i.e. little-endian) pattern holds for negative values and doubles alike.
// ============================================================================

/**
 * Encode a JS `number` as COMP-1 (IEEE-754 single precision, 4 bytes,
 * host-native/little-endian byte order - see this section's own doc comment).
 */
export function floatEncode(value) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, /* littleEndian */ true);
  return new Uint8Array(buf);
}

/**
 * Decode COMP-1 (IEEE-754 single precision, 4 bytes, host-native/
 * little-endian byte order) bytes to a JS `number`.
 */
export function floatDecode(bytes) {
  if (bytes.length !== 4) {
    throw new RangeError(`floatDecode: expected 4 bytes (COMP-1), got ${bytes.length}`);
  }
  const view = new DataView(new Uint8Array(bytes).buffer);
  return view.getFloat32(0, /* littleEndian */ true);
}

/**
 * Encode a JS `number` as COMP-2 (IEEE-754 double precision, 8 bytes,
 * host-native/little-endian byte order - see this section's own doc comment).
 */
export function doubleEncode(value) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, /* littleEndian */ true);
  return new Uint8Array(buf);
}

/**
 * Decode COMP-2 (IEEE-754 double precision, 8 bytes, host-native/
 * little-endian byte order) bytes to a JS `number`.
 */
export function doubleDecode(bytes) {
  if (bytes.length !== 8) {
    throw new RangeError(`doubleDecode: expected 8 bytes (COMP-2), got ${bytes.length}`);
  }
  const view = new DataView(new Uint8Array(bytes).buffer);
  return view.getFloat64(0, /* littleEndian */ true);
}

// ============================================================================
// Zoned Decimal (DISPLAY numeric) with sign overpunch
//
// One byte per digit. Unsigned fields (and non-sign digit positions of
// signed fields) carry the digit in the low nibble with the "digit zone" in
// the high nibble/character. Signed fields without SIGN ... SEPARATE overpunch
// the sign onto the leading or trailing digit's zone; SIGN ... SEPARATE
// fields add one extra byte holding a literal '+'/'-' character instead.
//
// The sign-overpunch SCHEME differs by codePage - these are NOT the same
// bytes reinterpreted through a different charset, they are two genuinely
// different conventions (compiler-verified against real GnuCOBOL, see
// tests/oracle/codec-refutation.md, "Post-fix verification" section):
//
//   'EBCDIC' -> letter-substitution overpunch. The sign digit is replaced by
//   a letter, expressed here as characters and pushed through the cp037
//   table below: positive digit 0-9 -> { A B C D E F G H I, negative digit
//   0-9 -> } J K L M N O P Q R. (This is exactly why cp037 byte 0xC0 is '{':
//   the positive digit zone is 0xC0-0xC9 and 0xC1-0xC9 already coincide with
//   'A'-'I' in EBCDIC.)
//
//   'ASCII' -> zone-nibble swap, no letters at all. The sign digit's byte is
//   a PLAIN ASCII digit for positive (0x30 + d, unchanged) and has its zone
//   nibble swapped from 0x3 to 0x7 for negative (0x70 + d). E.g. digit 5
//   negative -> 0x75. (An earlier version of this module reused the EBCDIC
//   letter table for 'ASCII' too - refuted by cobc: every nonzero signed
//   digit came out wrong.)
// ============================================================================

const POSITIVE_OVERPUNCH = ['{', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const NEGATIVE_OVERPUNCH = ['}', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];

function overpunchChar(digit, negative) {
  return negative ? NEGATIVE_OVERPUNCH[digit] : POSITIVE_OVERPUNCH[digit];
}

function overpunchDecode(ch) {
  const posIdx = POSITIVE_OVERPUNCH.indexOf(ch);
  if (posIdx >= 0) return { digit: posIdx, negative: false };
  const negIdx = NEGATIVE_OVERPUNCH.indexOf(ch);
  if (negIdx >= 0) return { digit: negIdx, negative: true };
  if (ch >= '0' && ch <= '9') return { digit: ch.charCodeAt(0) - 48, negative: false };
  throw new RangeError(`zonedDecode: '${ch}' is not a valid sign-overpunch or digit character`);
}

/** ASCII-native zoned sign encode: positive digit d -> 0x30+d, negative -> 0x70+d. */
function asciiSignByte(digit, negative) {
  return (negative ? 0x70 : 0x30) + digit;
}

/** ASCII-native zoned sign decode, inverse of asciiSignByte; throws on any other byte. */
function asciiSignDigit(byte) {
  if (byte >= 0x30 && byte <= 0x39) return { digit: byte - 0x30, negative: false };
  if (byte >= 0x70 && byte <= 0x79) return { digit: byte - 0x70, negative: true };
  throw new RangeError(
    `zonedDecode: byte 0x${byte.toString(16).padStart(2, '0')} is not a valid ASCII zoned sign digit`
  );
}

/**
 * Encode a signed integer magnitude (BigInt, unscaled) as zoned-decimal
 * (DISPLAY numeric) bytes.
 *
 * @param {bigint} unscaled
 * @param {number} digits - total decimal digits, 1-18
 * @param {object} [options]
 * @param {boolean} [options.signed=true]
 * @param {boolean} [options.signLeading=false] - overpunch/separate sign on
 *   the first digit instead of the last (mirrors DataItem.sign.leading).
 * @param {boolean} [options.signSeparate=false] - add a literal +/- byte
 *   instead of overpunching a digit (mirrors DataItem.sign.separate).
 * @param {'EBCDIC'|'ASCII'} [options.codePage='EBCDIC']
 * @returns {Uint8Array}
 */
export function zonedEncode(unscaled, digits, options = {}) {
  const { signed = true, signLeading = false, signSeparate = false, codePage = 'EBCDIC' } = options;
  const value = toBigInt(unscaled);
  assertDigits(digits);

  const negative = value < 0n;
  if (negative && !signed) {
    throw new RangeError(`zonedEncode: unsigned field cannot hold negative value ${value}`);
  }
  const magnitude = negative ? -value : value;
  const digitStr = magnitude.toString();
  if (digitStr.length > digits) {
    throw new RangeError(`zonedEncode: value ${value} needs more than ${digits} digits`);
  }
  const digitChars = digitStr.padStart(digits, '0').split('');

  const separate = signed && signSeparate;
  if (separate) {
    const signChar = negative ? '-' : '+';
    const chars = signLeading ? [signChar, ...digitChars] : [...digitChars, signChar];
    return charsToBytes(chars, codePage);
  }

  // Non-separate: every digit is a plain digit byte except the sign-bearing
  // position, which is overwritten below with the codePage-specific scheme.
  const bytes = charsToBytes(digitChars, codePage);
  if (signed) {
    const idx = signLeading ? 0 : digitChars.length - 1;
    const digit = Number(digitChars[idx]);
    bytes[idx] = codePage === 'ASCII' ? asciiSignByte(digit, negative) : charToEbcdicByte(overpunchChar(digit, negative));
  }
  return bytes;
}

/**
 * Decode zoned-decimal (DISPLAY numeric) bytes to
 * { unscaled, scale, signed, negative }.
 *
 * @param {Uint8Array|Buffer|number[]} bytes
 * @param {object} [options]
 * @param {number} [options.scale=0] - echoed back, not derived from bytes
 * @param {boolean} [options.signed=true]
 * @param {boolean} [options.signLeading=false]
 * @param {boolean} [options.signSeparate=false]
 * @param {'EBCDIC'|'ASCII'} [options.codePage='EBCDIC']
 */
export function zonedDecode(bytes, options = {}) {
  const {
    scale = 0,
    signed = true,
    signLeading = false,
    signSeparate = false,
    codePage = 'EBCDIC',
  } = options;

  const separate = signed && signSeparate;
  const bufLen = bytes ? bytes.length : 0;
  const minLength = separate ? 2 : 1;
  if (bufLen < minLength) {
    throw new RangeError(
      `zonedDecode: buffer too short (${bufLen} byte${bufLen === 1 ? '' : 's'}), need at least ${minLength} ` +
        `byte${minLength === 1 ? '' : 's'}${separate ? ' (digit(s) + sign byte)' : ' (digit)'}`
    );
  }

  const chars = bytesToChars(bytes, codePage);

  let negative = false;
  let digitChars;
  if (separate) {
    if (signLeading) {
      negative = chars[0] === '-';
      digitChars = chars.slice(1);
    } else {
      negative = chars[chars.length - 1] === '-';
      digitChars = chars.slice(0, -1);
    }
  } else if (signed) {
    digitChars = chars.slice();
    const idx = signLeading ? 0 : digitChars.length - 1;
    if (codePage === 'ASCII') {
      const decoded = asciiSignDigit(bytes[idx] & 0xff);
      digitChars[idx] = String(decoded.digit);
      negative = decoded.negative;
    } else {
      const decoded = overpunchDecode(digitChars[idx]);
      digitChars[idx] = String(decoded.digit);
      negative = decoded.negative;
    }
  } else {
    digitChars = chars.slice();
  }

  const digitStr = digitChars.join('');
  if (!/^[0-9]*$/.test(digitStr)) {
    throw new RangeError(`zonedDecode: non-digit data in ${JSON.stringify(digitStr)}`);
  }
  const magnitude = digitStr === '' ? 0n : BigInt(digitStr);
  const unscaled = negative ? -magnitude : magnitude;
  return { unscaled, scale, signed, negative };
}

function charsToBytes(chars, codePage) {
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) {
    bytes[i] = codePage === 'EBCDIC' ? charToEbcdicByte(chars[i]) : chars[i].charCodeAt(0) & 0xff;
  }
  return bytes;
}

function bytesToChars(bytes, codePage) {
  const chars = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    chars[i] = codePage === 'EBCDIC' ? ebcdicByteToChar(b) : String.fromCharCode(b);
  }
  return chars;
}

// ============================================================================
// EBCDIC code page 037 <-> Unicode
//
// Full 256-entry translation table, transcribed from the authoritative
// IBM/Unicode mapping (unicode.org Public/MAPPINGS/VENDORS/MICSFT/EBCDIC/CP037.TXT).
// Verified anchors: space = 0x40, digits '0'-'9' = 0xF0-0xF9, 'A'-'I' =
// 0xC1-0xC9, 'J'-'R' = 0xD1-0xD9, 'S'-'Z' = 0xE2-0xE9, 'a'-'i' = 0x81-0x89,
// 'j'-'r' = 0x91-0x99, 's'-'z' = 0xA2-0xA9.
// ============================================================================

// prettier-ignore
export const EBCDIC_CP037_TO_UNICODE = Object.freeze([
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
  0x0038, 0x0039, 0x00b3, 0x00db, 0x00dc, 0x00d9, 0x00da, 0x009f, // F8-FF ('8','9')
]);

const UNICODE_TO_EBCDIC_CP037 = (() => {
  const map = new Map();
  for (let byte = 0; byte < 256; byte++) {
    map.set(EBCDIC_CP037_TO_UNICODE[byte], byte);
  }
  return map;
})();

/**
 * Decode a single cp037 byte to its Unicode character.
 */
export function ebcdicByteToChar(byte) {
  const b = byte & 0xff;
  return String.fromCodePoint(EBCDIC_CP037_TO_UNICODE[b]);
}

/**
 * Encode a single Unicode character (BMP code point) to its cp037 byte.
 * Throws if the character has no cp037 representation.
 */
export function charToEbcdicByte(char) {
  const codePoint = char.codePointAt(0);
  const byte = UNICODE_TO_EBCDIC_CP037.get(codePoint);
  if (byte === undefined) {
    throw new RangeError(`charToEbcdicByte: '${char}' (U+${codePoint.toString(16)}) has no cp037 mapping`);
  }
  return byte;
}

/**
 * Decode a full EBCDIC cp037 byte buffer to a Unicode string (no trimming).
 * @param {Uint8Array|Buffer|number[]} bytes
 * @returns {string}
 */
export function ebcdicToString(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ebcdicByteToChar(bytes[i]);
  }
  return out;
}

/**
 * Encode a Unicode string to EBCDIC cp037 bytes, optionally padding
 * (with cp037 space, 0x40) or truncating to a fixed length.
 * @param {string} str
 * @param {{length?: number}} [options]
 * @returns {Uint8Array}
 */
export function stringToEbcdic(str, options = {}) {
  const { length } = options;
  const chars = Array.from(str);
  let padded = chars;
  if (typeof length === 'number') {
    padded = chars.length >= length ? chars.slice(0, length) : [...chars, ...Array(length - chars.length).fill(' ')];
  }
  const bytes = new Uint8Array(padded.length);
  for (let i = 0; i < padded.length; i++) bytes[i] = charToEbcdicByte(padded[i]);
  return bytes;
}

export default {
  packedByteLength,
  packedEncode,
  packedDecode,
  binaryByteLength,
  binaryEncode,
  binaryDecode,
  floatEncode,
  floatDecode,
  doubleEncode,
  doubleDecode,
  zonedEncode,
  zonedDecode,
  ebcdicByteToChar,
  charToEbcdicByte,
  ebcdicToString,
  stringToEbcdic,
  EBCDIC_CP037_TO_UNICODE,
};
