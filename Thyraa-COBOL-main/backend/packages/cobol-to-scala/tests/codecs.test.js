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

test('zoned decimal: ASCII code page uses the overpunch characters directly as bytes', () => {
  // +5 -> overpunch char 'E' (0x45 in ASCII, no cp037 translation).
  const positive = zonedEncode(5n, 1, { codePage: 'ASCII' });
  assert.equal(hex(positive), '45');
  assert.equal(String.fromCharCode(positive[0]), 'E');
  // -5 -> overpunch char 'N'.
  const negative = zonedEncode(-5n, 1, { codePage: 'ASCII' });
  assert.equal(String.fromCharCode(negative[0]), 'N');
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
