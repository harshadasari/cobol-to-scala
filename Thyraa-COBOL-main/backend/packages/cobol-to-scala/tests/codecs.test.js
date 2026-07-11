import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  packedByteLength,
  packedEncode,
  packedDecode,
  binaryByteLength,
  binaryEncode,
  binaryDecode,
  zonedEncode,
  zonedDecode,
  ebcdicByteToChar,
  charToEbcdicByte,
  ebcdicToString,
  stringToEbcdic,
  EBCDIC_CP037_TO_UNICODE,
} from '../generator/codecs.js';

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

// ============================================================================
// Packed Decimal (COMP-3)
// ============================================================================

test('packed decimal: byte length follows ceil((digits + 1) / 2)', () => {
  assert.equal(packedByteLength(1), 1); // 1 digit + sign nibble = 2 nibbles = 1 byte
  assert.equal(packedByteLength(2), 2); // 2 digits + sign = 3 nibbles -> 2 bytes (1 pad nibble)
  assert.equal(packedByteLength(3), 2); // 3 digits + sign = 4 nibbles = 2 bytes
  assert.equal(packedByteLength(4), 3); // 4 digits + sign = 5 nibbles -> 3 bytes (1 pad nibble)
  assert.equal(packedByteLength(5), 3); // 5 digits + sign = 6 nibbles = 3 bytes
  assert.equal(packedByteLength(7), 4);
  assert.equal(packedByteLength(18), 10); // max COBOL precision
});

test('packed decimal: KNOWN VALUE +1234 (digits=5) = 0x01 0x23 0x4C', () => {
  // Derivation: digit string padded to 5 = "01234". Sign nibble for positive = 0xC.
  // Nibble stream: 0 1 2 3 4 C (6 nibbles = 3 bytes).
  // Byte 0 = (0<<4)|1 = 0x01, byte 1 = (2<<4)|3 = 0x23, byte 2 = (4<<4)|C = 0x4C.
  const bytes = packedEncode(1234n, 5);
  assert.equal(hex(bytes), '01234c');
});

test('packed decimal: KNOWN VALUE -1234 (digits=5) = 0x01 0x23 0x4D', () => {
  // Same nibble stream as above but sign nibble is 0xD for negative: 0 1 2 3 4 D.
  const bytes = packedEncode(-1234n, 5);
  assert.equal(hex(bytes), '01234d');
});

test('packed decimal: KNOWN VALUE unsigned 1234 (digits=4) = 0x01 0x23 0x4F', () => {
  // digits=4 is even: nibbles = digits(4) + sign(1) = 5, byteLength = ceil(5/2) = 3 = 6 nibbles,
  // so there is 1 leading pad nibble: 0 1 2 3 4 F (F = unsigned).
  const bytes = packedEncode(1234n, 4, { signed: false });
  assert.equal(hex(bytes), '01234f');
});

test('packed decimal: zero encodes with positive sign nibble 0xC', () => {
  assert.equal(hex(packedEncode(0n, 3)), '000c');
});

test('packed decimal: round trip across odd/even digit counts, sign, and zero', () => {
  const cases = [
    { value: 0n, digits: 1 },
    { value: 9n, digits: 1 },
    { value: -9n, digits: 1 },
    { value: 12n, digits: 2 }, // even digits
    { value: -12n, digits: 2 },
    { value: 123n, digits: 3 }, // odd digits
    { value: -123n, digits: 3 },
    { value: 999999999999999999n, digits: 18 }, // max 18-digit precision
    { value: -999999999999999999n, digits: 18 },
  ];
  for (const { value, digits } of cases) {
    const encoded = packedEncode(value, digits);
    assert.equal(encoded.length, packedByteLength(digits), `byte length for digits=${digits}`);
    const decoded = packedDecode(encoded);
    assert.equal(decoded.unscaled, value, `round trip for ${value} at digits=${digits}`);
  }
});

test('packed decimal: unscaled + scale pair round-trips through encode/decode', () => {
  // Represents 1234.56 as unscaled=123456, scale=2 (matches BigDecimal(unscaled, scale)).
  const encoded = packedEncode(123456n, 6);
  const decoded = packedDecode(encoded, { scale: 2 });
  assert.equal(decoded.unscaled, 123456n);
  assert.equal(decoded.scale, 2);
});

test('packed decimal: negative-zero bytes decode as ordinary zero (no -0 artifact)', () => {
  // Hand-built bytes for digit "0" with a NEGATIVE sign nibble (0xD) - malformed but
  // physically possible mainframe data; must not throw and must equal +0.
  const negativeZeroBytes = Uint8Array.from([0x0d]);
  const decoded = packedDecode(negativeZeroBytes);
  assert.equal(decoded.unscaled, 0n);
  assert.equal(decoded.negative, true); // sign bit was set...
  assert.ok(decoded.unscaled === 0n && -decoded.unscaled === 0n); // ...but BigInt has no signed zero
});

test('packed decimal: unsigned field rejects negative values', () => {
  assert.throws(() => packedEncode(-1n, 3, { signed: false }), RangeError);
});

test('packed decimal: value with too many digits is rejected', () => {
  assert.throws(() => packedEncode(12345n, 3), RangeError);
});

test('packed decimal: digits outside 1-18 are rejected', () => {
  assert.throws(() => packedByteLength(0), RangeError);
  assert.throws(() => packedByteLength(19), RangeError);
});

test('packed decimal: unsigned sign nibble (0xF) decodes as signed=false', () => {
  // Reuses the KNOWN VALUE bytes 0x01 0x23 0x4F from the "unsigned 1234" case above.
  const decoded = packedDecode(Uint8Array.from([0x01, 0x23, 0x4f]));
  assert.equal(decoded.unscaled, 1234n);
  assert.equal(decoded.signed, false);
});

test('packed decimal: decode rejects a non-BCD nibble in a digit position (dead-code regression)', () => {
  // String(10..15) stringifies to "10".."15" - two ASCII digit characters
  // that used to slip past a naive /^[0-9]+$/ check on the joined digit
  // string, even though the nibble itself (0xA-0xF) is not a valid
  // packed-decimal digit. Each nibble must be range-checked as a number.
  assert.throws(() => packedDecode(Uint8Array.from([0xa0, 0x1c])), RangeError); // leading nibble 0xA
  assert.throws(() => packedDecode(Uint8Array.from([0xf5, 0x0c])), RangeError); // leading nibble 0xF
  assert.throws(() => packedDecode(Uint8Array.from([0xe1, 0x2c])), RangeError); // leading nibble 0xE
});

test('unsafe (non-safe-integer) Number inputs are rejected in favor of BigInt/string', () => {
  // Number.MAX_SAFE_INTEGER + 1 has already lost precision as a JS Number by
  // the time it reaches the codec - there is no way to recover the intended
  // value, so it must be refused rather than silently encoding the wrong
  // (rounded) number.
  assert.throws(() => packedEncode(Number.MAX_SAFE_INTEGER + 1, 18), RangeError);
  assert.throws(() => binaryEncode(2 ** 60, 8), RangeError);
  // Passing the same magnitude as a BigInt or a string is fine.
  assert.doesNotThrow(() => packedEncode(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 18));
  assert.doesNotThrow(() => packedEncode(String(Number.MAX_SAFE_INTEGER) + '1', 18));
  // An ordinary safe integer Number still works exactly as before.
  assert.equal(hex(packedEncode(123, 3)), '123c');
});

// ============================================================================
// Binary (COMP / COMP-4 / BINARY)
// ============================================================================

test('binary: byte width follows the 1-4/5-9/10-18 digit rule', () => {
  assert.equal(binaryByteLength(1), 2);
  assert.equal(binaryByteLength(4), 2);
  assert.equal(binaryByteLength(5), 4);
  assert.equal(binaryByteLength(9), 4);
  assert.equal(binaryByteLength(10), 8);
  assert.equal(binaryByteLength(18), 8);
  assert.throws(() => binaryByteLength(0), RangeError);
  assert.throws(() => binaryByteLength(19), RangeError);
});

test('binary: KNOWN VALUE -12345 in 4 bytes = 0xFF 0xFF 0xCF 0xC7', () => {
  // Derivation: 12345 decimal = 0x00003039. Two's complement over 32 bits:
  // 0x100000000 - 0x00003039 = 0xFFFFCFC7.
  const bytes = binaryEncode(-12345n, 4);
  assert.equal(hex(bytes), 'ffffcfc7');
});

test('binary: KNOWN VALUE +12345 in 4 bytes = 0x00 0x00 0x30 0x39', () => {
  const bytes = binaryEncode(12345n, 4);
  assert.equal(hex(bytes), '00003039');
});

test('binary: KNOWN VALUE -1 in 2 bytes = 0xFF 0xFF (all-ones two\'s complement)', () => {
  const bytes = binaryEncode(-1n, 2);
  assert.equal(hex(bytes), 'ffff');
});

test('binary: max/min values round-trip exactly at each byte width', () => {
  const cases = [
    { byteLength: 2, max: 32767n, min: -32768n },
    { byteLength: 4, max: 2147483647n, min: -2147483648n },
    { byteLength: 8, max: 9223372036854775807n, min: -9223372036854775808n },
  ];
  for (const { byteLength, max, min } of cases) {
    assert.equal(binaryDecode(binaryEncode(max, byteLength)), max, `max at ${byteLength} bytes`);
    assert.equal(binaryDecode(binaryEncode(min, byteLength)), min, `min at ${byteLength} bytes`);
    assert.equal(binaryDecode(binaryEncode(0n, byteLength)), 0n, `zero at ${byteLength} bytes`);
  }
});

test('binary: KNOWN VALUE max 2-byte signed 32767 = 0x7F 0xFF, min -32768 = 0x80 0x00', () => {
  assert.equal(hex(binaryEncode(32767n, 2)), '7fff');
  assert.equal(hex(binaryEncode(-32768n, 2)), '8000');
});

test('binary: out-of-range values are rejected', () => {
  assert.throws(() => binaryEncode(32768n, 2), RangeError);
  assert.throws(() => binaryEncode(-32769n, 2), RangeError);
});

test('binary: round trip across all digit-count byte widths', () => {
  const cases = [
    { value: 0n, digits: 1 },
    { value: 9n, digits: 1 },
    { value: -9n, digits: 1 },
    { value: 12345n, digits: 5 },
    { value: -12345n, digits: 5 },
    { value: 123456789n, digits: 9 },
    { value: -123456789n, digits: 9 },
    { value: 123456789012345n, digits: 15 },
    { value: -123456789012345n, digits: 15 },
  ];
  for (const { value, digits } of cases) {
    const byteLength = binaryByteLength(digits);
    const encoded = binaryEncode(value, byteLength);
    assert.equal(encoded.length, byteLength);
    assert.equal(binaryDecode(encoded), value, `round trip for ${value} at digits=${digits}`);
  }
});

// ----------------------------------------------------------------------------
// COMP-5 (host-native little-endian on x86_64) - see
// tests/oracle/codec-refutation.md section 3. Plain COMP/COMP-4/BINARY stay
// big-endian (the 'BIG' default) - only COMP-5 fields pass endianness: 'LITTLE'.
// ----------------------------------------------------------------------------

test("binary: COMP-5 KNOWN VALUES from cobc (codec-refutation.md section 3, rows 25-28)", () => {
  // int16 max/min, little-endian.
  assert.equal(hex(binaryEncode(32767n, 2, { endianness: 'LITTLE' })), 'ff7f');
  assert.equal(hex(binaryEncode(-32768n, 2, { endianness: 'LITTLE' })), '0080');
  // int32 max/min, little-endian.
  assert.equal(hex(binaryEncode(2147483647n, 4, { endianness: 'LITTLE' })), 'ffffff7f');
  assert.equal(hex(binaryEncode(-2147483648n, 4, { endianness: 'LITTLE' })), '00000080');

  // Decode is the exact inverse of the cobc-produced bytes.
  assert.equal(binaryDecode(Uint8Array.from([0xff, 0x7f]), { endianness: 'LITTLE' }), 32767n);
  assert.equal(binaryDecode(Uint8Array.from([0x00, 0x80]), { endianness: 'LITTLE' }), -32768n);
  assert.equal(binaryDecode(Uint8Array.from([0xff, 0xff, 0xff, 0x7f]), { endianness: 'LITTLE' }), 2147483647n);
  assert.equal(binaryDecode(Uint8Array.from([0x00, 0x00, 0x00, 0x80]), { endianness: 'LITTLE' }), -2147483648n);
});

test('binary: default (and plain COMP/COMP-4/BINARY) endianness is still big-endian, unaffected by the COMP-5 fix', () => {
  assert.equal(hex(binaryEncode(32767n, 2)), '7fff'); // no options => 'BIG'
  assert.equal(hex(binaryEncode(32767n, 2, { endianness: 'BIG' })), '7fff');
  // The same bytes decode to a different (and, pre-fix, silently wrong)
  // value depending on endianness - this is the "concrete blast radius"
  // documented in codec-refutation.md section 3.
  assert.equal(binaryDecode(Uint8Array.from([0xff, 0x7f])), -129n); // big-endian (default)
  assert.equal(binaryDecode(Uint8Array.from([0xff, 0x7f]), { endianness: 'LITTLE' }), 32767n);
});

test('binary: COMP-5 round trip at every boundary width, little-endian', () => {
  const cases = [
    { byteLength: 2, max: 32767n, min: -32768n },
    { byteLength: 4, max: 2147483647n, min: -2147483648n },
    { byteLength: 8, max: 9223372036854775807n, min: -9223372036854775808n },
  ];
  const opts = { endianness: 'LITTLE' };
  for (const { byteLength, max, min } of cases) {
    assert.equal(binaryDecode(binaryEncode(max, byteLength, opts), opts), max, `max at ${byteLength} bytes`);
    assert.equal(binaryDecode(binaryEncode(min, byteLength, opts), opts), min, `min at ${byteLength} bytes`);
    assert.equal(binaryDecode(binaryEncode(0n, byteLength, opts), opts), 0n, `zero at ${byteLength} bytes`);
  }
});

test('binary: invalid endianness option is rejected on both encode and decode', () => {
  assert.throws(() => binaryEncode(1n, 2, { endianness: 'MIDDLE' }), RangeError);
  assert.throws(() => binaryDecode(Uint8Array.from([1, 2]), { endianness: 'MIDDLE' }), RangeError);
});

test('binary: encode rejects byteLength outside 1-8', () => {
  assert.throws(() => binaryEncode(1n, 0), RangeError);
  assert.throws(() => binaryEncode(1n, 9), RangeError);
});

test('binary: decode rejects buffers wider than 8 bytes instead of silently overflowing', () => {
  // Pre-fix, an oversized buffer would compute a wide two's-complement value
  // in JS (BigInt has no width limit) that the Scala Long counterpart cannot
  // represent - the two implementations would silently diverge. Both must
  // now reject anything over 8 bytes instead.
  const nineBytes = new Uint8Array(9).fill(0xff);
  assert.throws(() => binaryDecode(nineBytes), RangeError);
  assert.throws(() => binaryDecode(nineBytes, { endianness: 'LITTLE' }), RangeError);
});

// ============================================================================
// Zoned Decimal (DISPLAY numeric) with sign overpunch
// ============================================================================

test('zoned decimal: KNOWN VALUE +123 (EBCDIC, trailing overpunch) = 0xF1 0xF2 0xC3', () => {
  // Derivation: digits '1','2' use plain digit zone 0xF0-0xF9 -> F1, F2.
  // Trailing digit '3' is positive-overpunched: POSITIVE_OVERPUNCH[3] = 'C' -> cp037 byte 0xC3.
  const bytes = zonedEncode(123n, 3);
  assert.equal(hex(bytes), 'f1f2c3');
});

test('zoned decimal: KNOWN VALUE -123 (EBCDIC, trailing overpunch) = 0xF1 0xF2 0xD3', () => {
  // Trailing digit '3' negative-overpunched: NEGATIVE_OVERPUNCH[3] = 'L' -> cp037 byte 0xD3.
  const bytes = zonedEncode(-123n, 3);
  assert.equal(hex(bytes), 'f1f2d3');
});

test('zoned decimal: KNOWN VALUE unsigned 123 = 0xF1 0xF2 0xF3 (plain digit zone, no overpunch)', () => {
  const bytes = zonedEncode(123n, 3, { signed: false });
  assert.equal(hex(bytes), 'f1f2f3');
});

test('zoned decimal: KNOWN VALUE +0 trailing overpunch = 0xF0 with sign in the digit itself', () => {
  // Single-digit zero, positive: POSITIVE_OVERPUNCH[0] = '{' -> cp037 byte 0xC0.
  const bytes = zonedEncode(0n, 1);
  assert.equal(hex(bytes), 'c0');
});

test('zoned decimal: SIGN LEADING overpunch puts the sign on the first digit', () => {
  // +123 leading: digit '1' positive-overpunched -> 'A' -> 0xC1; remaining digits plain: F2 F3.
  const positive = zonedEncode(123n, 3, { signLeading: true });
  assert.equal(hex(positive), 'c1f2f3');
  // -123 leading: digit '1' negative-overpunched -> 'J' -> 0xD1; remaining digits plain: F2 F3.
  const negative = zonedEncode(-123n, 3, { signLeading: true });
  assert.equal(hex(negative), 'd1f2f3');
});

test('zoned decimal: SIGN TRAILING SEPARATE adds a literal +/- byte after the digits', () => {
  // '+' is cp037 byte 0x4E, '-' is cp037 byte 0x60 (both confirmed against the cp037 table).
  const positive = zonedEncode(123n, 3, { signSeparate: true });
  assert.equal(hex(positive), 'f1f2f34e');
  const negative = zonedEncode(-123n, 3, { signSeparate: true });
  assert.equal(hex(negative), 'f1f2f360');
});

test('zoned decimal: SIGN LEADING SEPARATE adds a literal +/- byte before the digits', () => {
  const positive = zonedEncode(123n, 3, { signLeading: true, signSeparate: true });
  assert.equal(hex(positive), '4ef1f2f3');
  const negative = zonedEncode(-123n, 3, { signLeading: true, signSeparate: true });
  assert.equal(hex(negative), '60f1f2f3');
});

test('zoned decimal: ASCII code page uses the zone-nibble-swap sign scheme, NOT the EBCDIC letter table', () => {
  // CORRECTED per tests/oracle/codec-refutation.md section 6 (compiler-verified
  // against real GnuCOBOL, cobc 4.0-early-dev.0, native ASCII charset): the
  // previous expectation here ('45'/'E' for +5, 'N' for -5) reused the EBCDIC
  // overpunch letter table for the ASCII code page, which cobc's actual
  // native-ASCII sign convention does NOT do. The real scheme only swaps the
  // sign digit's zone nibble: positive digit d -> 0x30+d (a plain, unchanged
  // ASCII digit), negative digit d -> 0x70+d.
  // +5 -> 0x35 (plain ASCII digit '5', unchanged from an unsigned encoding).
  const positive = zonedEncode(5n, 1, { codePage: 'ASCII' });
  assert.equal(hex(positive), '35');
  // -5 -> 0x75 (zone nibble swapped from 0x3 to 0x7; cobc-verified).
  const negative = zonedEncode(-5n, 1, { codePage: 'ASCII' });
  assert.equal(hex(negative), '75');
});

test('zoned decimal: ASCII KNOWN VALUES from cobc (tests/oracle/codec-refutation.md section 6, rows 31-38)', () => {
  const cases = [
    { digit: 0, negative: false, byte: 0x30 }, // cobc row 31 ('+0' and '-0' both collapse to 0x30)
    { digit: 1, negative: false, byte: 0x31 }, // row 33
    { digit: 1, negative: true, byte: 0x71 }, // row 34
    { digit: 5, negative: false, byte: 0x35 }, // row 35
    { digit: 5, negative: true, byte: 0x75 }, // row 36
    { digit: 9, negative: false, byte: 0x39 }, // row 37
    { digit: 9, negative: true, byte: 0x79 }, // row 38
  ];
  for (const { digit, negative, byte } of cases) {
    const value = negative ? -BigInt(digit) : BigInt(digit);
    const encoded = zonedEncode(value, 1, { codePage: 'ASCII' });
    assert.equal(hex(encoded), byte.toString(16).padStart(2, '0'), `encode digit=${digit} negative=${negative}`);
    const decoded = zonedDecode(encoded, { codePage: 'ASCII' });
    assert.equal(decoded.unscaled, negative && digit !== 0 ? -BigInt(digit) : BigInt(digit), `decode digit=${digit}`);
  }
});

test('zoned decimal: ASCII multi-digit -123 flips only the sign digit\'s zone (cobc rows 40/41)', () => {
  // SIGN TRAILING (default): only the last digit's zone flips, 0x33 -> 0x73;
  // non-sign digits '1' '2' stay plain 0x31 0x32.
  const trailing = zonedEncode(-123n, 3, { codePage: 'ASCII' });
  assert.equal(hex(trailing), '313273');
  // SIGN LEADING: only the first digit's zone flips, 0x31 -> 0x71.
  const leading = zonedEncode(-123n, 3, { codePage: 'ASCII', signLeading: true });
  assert.equal(hex(leading), '713233');
});

test('zoned decimal: ASCII sign byte outside 0x3x/0x7x digit range is rejected on decode', () => {
  // 0x41 ('A') is a valid EBCDIC-scheme overpunch letter but not a valid
  // ASCII zone-nibble-swap sign byte - must not be silently misread.
  assert.throws(() => zonedDecode(Uint8Array.from([0x41]), { codePage: 'ASCII' }), RangeError);
});

test('zoned decimal: round trip across sign placement x separate x code page x zero/negative', () => {
  const signVariants = [
    { signLeading: false, signSeparate: false },
    { signLeading: true, signSeparate: false },
    { signLeading: false, signSeparate: true },
    { signLeading: true, signSeparate: true },
  ];
  const codePages = ['EBCDIC', 'ASCII'];
  const values = [0n, 7n, -7n, 4200n, -4200n];

  for (const codePage of codePages) {
    for (const signOpts of signVariants) {
      for (const value of values) {
        const options = { ...signOpts, codePage };
        const encoded = zonedEncode(value, 4, options);
        const decoded = zonedDecode(encoded, options);
        assert.equal(
          decoded.unscaled,
          value,
          `roundtrip ${value} codePage=${codePage} leading=${signOpts.signLeading} separate=${signOpts.signSeparate}`
        );
      }
    }
  }
});

test('zoned decimal: unsigned round trip (no sign in the data at all)', () => {
  const encoded = zonedEncode(4200n, 4, { signed: false });
  const decoded = zonedDecode(encoded, { signed: false });
  assert.equal(decoded.unscaled, 4200n);
  assert.equal(decoded.negative, false);
});

test('zoned decimal: negative-zero overpunch decodes as ordinary zero', () => {
  // Hand-built: trailing byte is '}' (0xD0), the negative-zero overpunch.
  const negativeZeroBytes = Uint8Array.from([0xf0, 0xf0, 0xd0]); // "00" + negative-zero overpunch
  const decoded = zonedDecode(negativeZeroBytes);
  assert.equal(decoded.unscaled, 0n);
  assert.equal(decoded.negative, true);
  assert.ok(decoded.unscaled === 0n);
});

test('zoned decimal: unsigned field rejects negative values', () => {
  assert.throws(() => zonedEncode(-1n, 3, { signed: false }), RangeError);
});

test('zoned decimal: invalid overpunch character is rejected on decode', () => {
  // 0xFF is not a valid digit zone or overpunch byte in the trailing position.
  assert.throws(() => zonedDecode(Uint8Array.from([0xf1, 0xff])), RangeError);
});

test('zoned decimal: decode rejects an empty buffer instead of silently returning 0', () => {
  assert.throws(() => zonedDecode(Uint8Array.from([])), RangeError);
  assert.throws(() => zonedDecode(Uint8Array.from([]), { signed: false }), RangeError);
});

test('zoned decimal: decode rejects a too-short SIGN SEPARATE buffer (needs digit(s) + sign byte)', () => {
  // Pre-fix, an empty (or digit-only, missing sign byte) buffer under
  // signSeparate:true silently decoded to unscaled=0n instead of raising an
  // error - there is no way to tell "no data" from "a genuine zero" that way.
  assert.throws(() => zonedDecode(Uint8Array.from([]), { signSeparate: true }), RangeError);
  assert.throws(() => zonedDecode(Uint8Array.from([0x31]), { signSeparate: true }), RangeError);
});

// ============================================================================
// EBCDIC code page 037 <-> Unicode
// ============================================================================

test('cp037: space is 0x40', () => {
  assert.equal(ebcdicByteToChar(0x40), ' ');
  assert.equal(charToEbcdicByte(' '), 0x40);
});

test('cp037: digits 0-9 are 0xF0-0xF9', () => {
  for (let d = 0; d <= 9; d++) {
    assert.equal(ebcdicByteToChar(0xf0 + d), String(d), `byte 0x${(0xf0 + d).toString(16)}`);
    assert.equal(charToEbcdicByte(String(d)), 0xf0 + d);
  }
});

test('cp037: uppercase letters occupy three EBCDIC bands (A-I, J-R, S-Z)', () => {
  const aToI = 'ABCDEFGHI';
  for (let i = 0; i < aToI.length; i++) {
    assert.equal(ebcdicByteToChar(0xc1 + i), aToI[i]);
  }
  const jToR = 'JKLMNOPQR';
  for (let i = 0; i < jToR.length; i++) {
    assert.equal(ebcdicByteToChar(0xd1 + i), jToR[i]);
  }
  const sToZ = 'STUVWXYZ';
  for (let i = 0; i < sToZ.length; i++) {
    assert.equal(ebcdicByteToChar(0xe2 + i), sToZ[i]);
  }
});

test('cp037: lowercase letters occupy three EBCDIC bands (a-i, j-r, s-z)', () => {
  const aToI = 'abcdefghi';
  for (let i = 0; i < aToI.length; i++) {
    assert.equal(ebcdicByteToChar(0x81 + i), aToI[i]);
  }
  const jToR = 'jklmnopqr';
  for (let i = 0; i < jToR.length; i++) {
    assert.equal(ebcdicByteToChar(0x91 + i), jToR[i]);
  }
  const sToZ = 'stuvwxyz';
  for (let i = 0; i < sToZ.length; i++) {
    assert.equal(ebcdicByteToChar(0xa2 + i), sToZ[i]);
  }
});

test('cp037: common punctuation matches the published cp037 table', () => {
  const known = [
    ['.', 0x4b],
    ['<', 0x4c],
    ['(', 0x4d],
    ['+', 0x4e],
    ['|', 0x4f],
    ['&', 0x50],
    ['!', 0x5a],
    ['$', 0x5b],
    ['*', 0x5c],
    [')', 0x5d],
    [';', 0x5e],
    ['-', 0x60],
    ['/', 0x61],
    [',', 0x6b],
    ['%', 0x6c],
    ['_', 0x6d],
    ['>', 0x6e],
    ['?', 0x6f],
    ['`', 0x79],
    [':', 0x7a],
    ['#', 0x7b],
    ['@', 0x7c],
    ["'", 0x7d],
    ['=', 0x7e],
    ['"', 0x7f],
  ];
  for (const [char, byte] of known) {
    assert.equal(charToEbcdicByte(char), byte, `'${char}' -> 0x${byte.toString(16)}`);
    assert.equal(ebcdicByteToChar(byte), char, `0x${byte.toString(16)} -> '${char}'`);
  }
});

test('cp037: string helpers round trip printable text', () => {
  const text = "HELLO, WORLD! 123.45-$";
  const bytes = stringToEbcdic(text);
  assert.equal(ebcdicToString(bytes), text);
});

test('cp037: stringToEbcdic pads with EBCDIC space and truncates to a fixed length', () => {
  const padded = stringToEbcdic('AB', { length: 5 });
  assert.equal(hex(padded), 'c1c2404040'); // 'A' 'B' space space space
  const truncated = stringToEbcdic('ABCDEF', { length: 3 });
  assert.equal(ebcdicToString(truncated), 'ABC');
});

test('cp037: full 256-byte round trip (every byte value survives byte -> string -> byte)', () => {
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i++) all[i] = i;
  const asString = ebcdicToString(all);
  assert.equal(asString.length, 256);
  const back = stringToEbcdic(asString);
  assert.deepEqual(Array.from(back), Array.from(all));
});

test('cp037: table is a bijection (256 distinct Unicode code points, safe to invert)', () => {
  const uniquePoints = new Set(EBCDIC_CP037_TO_UNICODE);
  assert.equal(uniquePoints.size, 256);
  assert.equal(EBCDIC_CP037_TO_UNICODE.length, 256);
});

test('cp037: unmapped Unicode code point throws on encode', () => {
  assert.throws(() => charToEbcdicByte('€'), RangeError); // Euro sign has no cp037 mapping
});

// ============================================================================
// Cross-cutting: exception-type consistency
//
// Every validation failure in this module must throw RangeError (mirroring
// Scala's IllegalArgumentException) so callers can catch a single error
// type, rather than some paths throwing RangeError and others TypeError/
// falling through to an unrelated built-in exception (e.g. an unguarded
// ArrayIndexOutOfBoundsException-equivalent on the Scala side).
// ============================================================================

test('all validation failures across every codec throw RangeError uniformly', () => {
  const hostileCalls = [
    () => packedByteLength(0),
    () => packedEncode(-1n, 3, { signed: false }),
    () => packedEncode(12345n, 3),
    () => packedEncode(Number.MAX_SAFE_INTEGER + 1, 18),
    () => packedDecode(Uint8Array.from([0xa0, 0x1c])),
    () => binaryByteLength(0),
    () => binaryEncode(1n, 0),
    () => binaryEncode(1n, 9),
    () => binaryEncode(32768n, 2),
    () => binaryEncode(1n, 2, { endianness: 'MIDDLE' }),
    () => binaryDecode(new Uint8Array(9)),
    () => binaryDecode(Uint8Array.from([1, 2]), { endianness: 'MIDDLE' }),
    () => zonedEncode(-1n, 3, { signed: false }),
    () => zonedEncode(12345n, 3),
    () => zonedDecode(Uint8Array.from([])),
    () => zonedDecode(Uint8Array.from([0x41]), { codePage: 'ASCII' }),
    () => zonedDecode(Uint8Array.from([0xf1, 0xff])),
    () => charToEbcdicByte('€'),
  ];
  for (const call of hostileCalls) {
    assert.throws(call, RangeError, `expected RangeError from ${call}`);
  }
});
