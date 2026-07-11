# Codec Refutation Report — `generator/codecs.js`

**Target under test:** `Thyraa-COBOL-main/backend/packages/cobol-to-scala/generator/codecs.js`
**Method:** compile small COBOL programs with the real GnuCOBOL compiler, MOVE literal
values into fields of the type under test, then dump the raw storage bytes
(`FUNCTION ORD` on a `REDEFINES ... PIC X` view, byte-by-byte) and diff against what
`codecs.js` produces for the logically-equivalent encode call.

**Toolchain:**
```
cobc (GnuCOBOL) 4.0-early-dev.0, native character set: ASCII
Linux vm 6.18.5 x86_64
node v22.22.2
python3 (stdlib `codecs` module, cp037 codec) used as an independent second oracle
  for the EBCDIC table, since this sandbox's GnuCOBOL build cannot target a true
  EBCDIC runtime charset.
```

**Byte-length verification technique:** every probe field is placed in a group
immediately followed by a canary byte (`PIC X VALUE 'Z'`), and the group is
`REDEFINES`-viewed as a flat `PIC X(n)` / `OCCURS` byte array one byte longer than the
hypothesized field size. If the compiler's actual physical size differs from what
`codecs.js`'s `packedByteLength`/`binaryByteLength` predicts, the canary byte would be
read at the wrong offset (or absorbed into the field) and would not equal `'Z'`
(ASCII 0x5A). It equalled `'Z'` in every case below — every predicted byte length
matched the compiler's actual allocation.

---

## VERDICT: REFUTED

Two independent, cleanly compiler-verified discrepancies were found:

1. **Zoned decimal, `codePage: 'ASCII'` mode is not what real GnuCOBOL emits as ASCII
   zoned decimal.** `codecs.js` reuses the EBCDIC letter-overpunch table (`{`, `A`-`I`,
   `}`, `J`-`R`) and just encodes those letters through plain ASCII codepoints. Real
   GnuCOBOL, running with its native (and default) ASCII sign representation, instead
   swaps the *zone nibble* of the sign digit: positive digits stay `0x30`-`0x39`,
   negative digits become `0x70`-`0x79`. These are completely different byte values
   for every nonzero signed digit.
2. **`COMP-5` binary fields are little-endian (host-native) on this x86 GnuCOBOL
   build, but `codecs.js`'s `binaryEncode`/`binaryDecode` always produce/expect
   big-endian bytes**, and the module's own doc comment (line 144-148) explicitly
   claims one shared big-endian codec covers "`COMP / COMP-4 / COMP-5 / BINARY`".
   `COMP`/`COMP-4`/plain `BINARY` genuinely are big-endian (confirmed below and match
   `codecs.js` exactly) — it is specifically `COMP-5` that differs, both empirically
   and per GnuCOBOL's own `-fbinary-byteorder=native|big-endian` documentation (native
   binary representation is the defining property of `COMP-5` per the COBOL
   standard/GnuCOBOL extension, independent of the `binary-byteorder:` dialect
   config, which `/etc/gnucobol/default.conf` sets to `big-endian` for the plain
   `COMP`/`BINARY` case only).

Everything else tested — packed decimal (`COMP-3`) in all its variants, big-endian
binary (`COMP`/`COMP-4`), `SIGN ... SEPARATE` zoned decimal, unsigned zoned decimal,
and the EBCDIC cp037 translation table — matched exactly.

**Coverage:** 46 distinct value/type pairs compiler-verified (133 individual byte
positions checked across them, all of which are itemized below), covering both of the
REFUTED findings and confirming everything else the mission asked for (negatives,
zero, ±0, 18-digit max, scale, odd/even-digit pad nibbles, int16/int32 binary
boundaries, SIGN SEPARATE LEADING/TRAILING). Additionally 1 spec/independent-library
comparison (full 256-entry cp037 table vs. Python's stdlib `cp037` codec, 0
mismatches) stands in for true-EBCDIC compiler verification, which this sandbox's
ASCII-native GnuCOBOL build cannot produce.

---

## 1. Packed decimal (COMP-3) — all compiler-verified, all MATCH

Byte length AND every byte's content matched `codecs.js`'s `packedEncode` in all 13
cases tried (charset-independent, so ASCII-native GnuCOBOL is a fully valid oracle
here — packed decimal has no character encoding at all, it's raw nibbles).

Source: `packed1.cob` (canary-terminated groups, `FUNCTION ORD` byte dump).

| # | PIC clause | Value | cobc bytes (hex) | codecs.js call | codecs.js bytes (hex) | Verdict |
|---|---|---|---|---|---|---|
| 1 | `S9(5) COMP-3` | 1234 | `01 23 4c` | `packedEncode(1234n, 5)` | `01 23 4c` | MATCH |
| 2 | `S9(5) COMP-3` | -1234 | `01 23 4d` | `packedEncode(-1234n, 5)` | `01 23 4d` | MATCH |
| 3 | `S9(4) COMP-3` (even digits) | 1234 | `01 23 4c` | `packedEncode(1234n, 4)` | `01 23 4c` | MATCH |
| 4 | `S9(4) COMP-3` (even digits) | -1234 | `01 23 4d` | `packedEncode(-1234n, 4)` | `01 23 4d` | MATCH |
| 5 | `9(4) COMP-3` (unsigned) | 1234 | `01 23 4f` | `packedEncode(1234n, 4, {signed:false})` | `01 23 4f` | MATCH |
| 6 | `S9(18) COMP-3` (max digits) | 999999999999999999 | `09 99 99 99 99 99 99 99 99 9c` | `packedEncode(999999999999999999n, 18)` | `09 99 99 99 99 99 99 99 99 9c` | MATCH |
| 7 | `S9(18) COMP-3` (max digits) | -999999999999999999 | `09 99 99 99 99 99 99 99 99 9d` | `packedEncode(-999999999999999999n, 18)` | `09 99 99 99 99 99 99 99 99 9d` | MATCH |
| 8 | `S9(7)V99 COMP-3` (scale=2) | 12345.67 | `00 12 34 56 7c` | `packedEncode(1234567n, 9)` | `00 12 34 56 7c` | MATCH |
| 9 | `S9(7)V99 COMP-3` (scale=2) | -12345.67 | `00 12 34 56 7d` | `packedEncode(-1234567n, 9)` | `00 12 34 56 7d` | MATCH |
| 10 | `S9(1) COMP-3` | 0 | `0c` | `packedEncode(0n, 1)` | `0c` | MATCH |
| 11 | `S9(1) COMP-3` | -0 (via `COMPUTE ... = 0 * -1`) | `0c` (positive sign, no negative-zero artifact) | `packedEncode(0n, 1)` | `0c` | MATCH (both normalize -0 → +0) |
| 12 | `S9(3) COMP-3` (odd digits) | 999 | `99 9c` | `packedEncode(999n, 3)` | `99 9c` | MATCH |
| 13 | `S9(2) COMP-3` (even digits) | -99 | `09 9d` | `packedEncode(-99n, 2)` | `09 9d` | MATCH |

All byte lengths (1, 2, 3, 5, and 10 bytes for digits=1,2/3,4/5,9,18 respectively)
matched `packedByteLength()`'s `ceil((digits+1)/2)` formula exactly, confirmed via the
canary-byte technique in every row.

---

## 2. Binary (COMP / COMP-4, big-endian) — compiler-verified, all MATCH

Source: `binary1.cob`, `binarybounds.cob`.

| # | PIC clause | Value | cobc bytes (hex, big-endian) | codecs.js call | codecs.js bytes (hex) | Verdict |
|---|---|---|---|---|---|---|
| 14 | `S9(4) COMP` | 1234 | `04 d2` | `binaryEncode(1234n, 2)` | `04 d2` | MATCH |
| 15 | `S9(4) COMP` | -1234 | `fb 2e` | `binaryEncode(-1234n, 2)` | `fb 2e` | MATCH |
| 16 | `S9(9) COMP` | 123456789 | `07 5b cd 15` | `binaryEncode(123456789n, 4)` | `07 5b cd 15` | MATCH |
| 17 | `S9(9) COMP` | -123456789 | `f8 a4 32 eb` | `binaryEncode(-123456789n, 4)` | `f8 a4 32 eb` | MATCH |
| 18 | `S9(18) COMP` (max digits) | 999999999999999999 | `0d e0 b6 b3 a7 63 ff ff` | `binaryEncode(999999999999999999n, 8)` | `0d e0 b6 b3 a7 63 ff ff` | MATCH |
| 19 | `S9(18) COMP` (max digits) | -999999999999999999 | `f2 1f 49 4c 58 9c 00 01` | `binaryEncode(-999999999999999999n, 8)` | `f2 1f 49 4c 58 9c 00 01` | MATCH |
| 20 | `9(4) COMP` (unsigned) | 1234 | `04 d2` | `binaryEncode(1234n, 2)` | `04 d2` | MATCH (in-range unsigned == signed-positive bit pattern) |

Byte-length threshold boundaries (`binaryByteLength`'s digit brackets 1-4→2,
5-9→4, 10-18→8):

| # | digits | cobc physical size (canary offset) | `binaryByteLength(digits)` | Verdict |
|---|---|---|---|---|
| 21 | 4 (upper edge of 1-4) | 2 bytes | 2 | MATCH |
| 22 | 5 (lower edge of 5-9) | 4 bytes | 4 | MATCH |
| 23 | 9 (upper edge of 5-9) | 4 bytes | 4 | MATCH |
| 24 | 10 (lower edge of 10-18) | 8 bytes | 8 | MATCH |

`/etc/gnucobol/default.conf` confirms this is the compiler's actual configured
default: `binary-size: 1-2-4-8`, `binary-byteorder: big-endian` — exactly matching
`codecs.js`'s assumption, for plain `COMP`/`COMP-4`/`BINARY`.

---

## 3. Binary `COMP-5` — REFUTED (byte order)

`codecs.js`'s doc comment (line 144-148 of `codecs.js`) states one shared codec
covers `COMP / COMP-4 / COMP-5 / BINARY`, all "Big-endian two's complement." Real
GnuCOBOL disagrees for `COMP-5` specifically: it is stored in the host's *native*
byte order (`-fbinary-byteorder=native` is `COMP-5`'s defining behavior per GnuCOBOL,
independent of the `binary-byteorder:` dialect config, which only governs plain
`COMP`/`BINARY`). This sandbox's host is x86_64, i.e. little-endian, so `COMP-5`
bytes come out byte-reversed relative to `codecs.js`.

Source: `binary1.cob` (cases 4/4b/5/5b), all using `PIC ... COMP-5`, values chosen
at the exact int16/int32 boundaries.

| # | PIC clause | Value | cobc bytes (hex) | codecs.js `binaryEncode` (big-endian) | Verdict |
|---|---|---|---|---|---|
| 25 | `S9(4) COMP-5` | 32767 (int16 max) | `ff 7f` (little-endian) | `7f ff` | **MISMATCH — byte order reversed** |
| 26 | `S9(4) COMP-5` | -32768 (int16 min) | `00 80` (little-endian) | `80 00` | **MISMATCH — byte order reversed** |
| 27 | `S9(9) COMP-5` | 2147483647 (int32 max) | `ff ff ff 7f` (little-endian) | `7f ff ff ff` | **MISMATCH — byte order reversed** |
| 28 | `S9(9) COMP-5` | -2147483648 (int32 min) | `00 00 00 80` (little-endian) | `80 00 00 00` | **MISMATCH — byte order reversed** |

Note case 25/26 also independently confirm that `COMP-5` (unlike plain `COMP`, which
GnuCOBOL truncates to fit the declared PICTURE digit count — `binary-truncate: yes`
in `default.conf`) accepts the full native binary range regardless of the PICTURE's
digit count (`PIC S9(4)` only declares 4 decimal digits, yet held 32767/-32768
without truncation or a runtime error) — this part is orthogonal to `codecs.js` (byte
*width* selection, not byte *order*) and is not something `codecs.js` gets wrong,
since `binaryByteLength`'s digit-bracket sizing matched in every case (#21-24 above).

**Concrete blast radius** — decoding the real cobc-produced `COMP-5` bytes with
`codecs.js`'s `binaryDecode` (which assumes big-endian) silently produces a wildly
wrong value instead of erroring:

```
binaryDecode([0xFF, 0x7F])             = -129n   // actual COMP-5 value was 32767
binaryDecode([0x00, 0x80])             = 128n    // actual COMP-5 value was -32768
binaryDecode([0xFF, 0xFF, 0xFF, 0x7F]) = -129n   // actual COMP-5 value was 2147483647
```

This is a silent-data-corruption-class bug, not just a cosmetic byte-order quibble:
any COBOL source using `COMP-5` (a common choice for "native" performance-oriented
binary counters/indices) would round-trip through the generated Scala with
completely wrong numeric values, with no exception raised.

---

## 4. Zoned decimal (DISPLAY numeric), sign-separate — compiler-verified, MATCH

Source: `zonesign.cob`, full sweep of digits 0-9, both signs, `SIGN IS TRAILING
SEPARATE` and `SIGN IS LEADING SEPARATE`. (20 value/sign pairs per mode = 40 rows;
condensed here, all 40 matched.)

| PIC clause | Values swept | cobc pattern | codecs.js `zonedEncode(..., {signSeparate:true})` | Verdict |
|---|---|---|---|---|
| `S9(1) SIGN IS TRAILING SEPARATE` | 0..9, -0..-9 | `<digit><+ or ->`, e.g. `31 2b`='1+' , `31 2d`='1-' ; -0 → `30 2b` ('0+', no negative zero) | `chars = [...digitChars, signChar]` → identical | MATCH (all 20) |
| `S9(1) SIGN IS LEADING SEPARATE` | 0..9, -0..-9 | `<+ or -><digit>`, e.g. `2b 31`='+1', `2d 31`='-1'; -0 → `2b 30` ('+0') | `chars = [signChar, ...digitChars]` → identical | MATCH (all 20) |

Sample raw digits confirmed by `FUNCTION ORD`: digit `d` positive → ASCII `0x30+d`
unchanged, `+`/`-` are plain ASCII `0x2b`/`0x2d`. `codecs.js`'s `separate` branch
never touches the overpunch table at all (bypasses `overpunchChar` entirely), so it
is unaffected by finding #1 below and matched byte-for-byte in every case.

---

## 5. Zoned decimal, unsigned (no sign at all) — compiler-verified, MATCH

Source: `zoneunsigned.cob`.

| # | PIC clause | Value | cobc byte | codecs.js `zonedEncode(v, 1, {signed:false, codePage:'ASCII'})` | Verdict |
|---|---|---|---|---|---|
| 29 | `9(1)` | 5 | `35` | `35` | MATCH |
| 30 | `9(1)` | 0 | `30` | `30` | MATCH |

---

## 6. Zoned decimal, signed overpunch (non-SEPARATE) — REFUTED for `codePage: 'ASCII'`

This is the central finding. `codecs.js`'s `zonedEncode`/`zonedDecode` use one fixed
letter table (`POSITIVE_OVERPUNCH = ['{','A'..'I']`, `NEGATIVE_OVERPUNCH =
['}','J'..'R']`) for the sign-carrying digit regardless of `codePage`, differing
only in how those *characters* are subsequently turned into bytes (`charToEbcdicByte`
for `'EBCDIC'`, plain `.charCodeAt(0)` for `'ASCII'`).

Real GnuCOBOL's actual, default, native-ASCII sign representation
(`-fsign=ASCII`, confirmed to be bit-identical to the no-flag default on this
ASCII-native build) does **not** use letters at all. It swaps only the zone nibble
of the sign-bearing digit: positive digit `d` → byte `0x30 + d` (unchanged, i.e. a
plain ASCII digit), negative digit `d` (d≠0) → byte `0x70 + d`. Zero (either
arithmetic sign) always renders as plain `0x30` — GnuCOBOL has no negative-zero
zoned bit pattern for MOVE-derived values.

Source: `zonesign.cob` full sweep (digits 0-9 × sign, `SIGN IS TRAILING` default and
`SIGN IS LEADING` — 40 rows, condensed) plus `zonemulti.cob` (3-digit fields,
confirming only the sign-position digit's zone changes, other digits stay `0x3x`).

| # | Digit | Sign | cobc byte (`SIGN TRAILING`, default) | `codecs.js` `zonedEncode(d, 1, {codePage:'ASCII'})` | Verdict |
|---|---|---|---|---|---|
| 31 | 0 | + | `30` | `7b` (`'{'`) | **MISMATCH** |
| 32 | 0 | − (arithmetic) | `30` (collapses to +) | `7b` (`'{'`, codecs.js also collapses -0→+0, but to the wrong byte) | **MISMATCH** |
| 33 | 1 | + | `31` | `41` (`'A'`) | **MISMATCH** |
| 34 | 1 | − | `71` (`'q'`) | `4a` (`'J'`) | **MISMATCH** |
| 35 | 5 | + | `35` | `45` (`'E'`) | **MISMATCH** |
| 36 | 5 | − | `75` (`'u'`) | `4e` (`'N'`) | **MISMATCH** |
| 37 | 9 | + | `39` | `49` (`'I'`) | **MISMATCH** |
| 38 | 9 | − | `79` (`'y'`) | `52` (`'R'`) | **MISMATCH** |
| 39 | `SIGN IS LEADING`, digit 1, − | leading | `71` on **first** digit | `4a` (`'J'`) on first digit | **MISMATCH** (position of the swap is right, value is wrong) |
| 40 | 3-digit field `-123`, `SIGN TRAILING` | mixed | `31 32 73` (only last digit's zone flips: `0x33`→`0x73`) | `31 32 4c` (`'1' '2' 'L'`) | **MISMATCH** on the sign digit only; the two non-sign digits already matched (`31`,`32`) |
| 41 | 3-digit field `-123`, `SIGN LEADING` | mixed | `71 32 33` (only first digit's zone flips) | (analogous) `4a 32 33` | **MISMATCH** on the sign digit only |

Every single nonzero-digit / signed-overpunch case mismatches under `codePage:
'ASCII'`; only the byte for digit `0` matching trivially between the two
*wrong* interpretations happens not to occur (both are wrong: cobc emits `0x30`,
codecs.js emits `0x7b`).

**Root-cause note, for context (not a defense of the bug):** the letter table
`{,A-I,},J-R` is the conventional human-readable *transliteration* of EBCDIC
overpunch zones — cobc's `-fsign=EBCDIC` flag (compiler-verified below) reproduces
exactly this letter table even though this build's native charset is ASCII, because
`-fsign` selects the *sign convention*, and the convention GnuCOBOL calls "EBCDIC"
literally is this letter scheme. So `codecs.js`'s single letter table is a correct
model of the **EBCDIC** sign convention, but it has been (incorrectly) reused
verbatim for the **ASCII** sign convention too, which is a materially different
byte scheme (zone-nibble swap, not letter substitution). This is exactly the finding
category the mission's caveat #4 warned to watch for, confirmed concretely rather
than assumed.

---

## 7. Zoned decimal sign convention, `-fsign=EBCDIC` — supports the `'EBCDIC'` path's *logic* (compiler-verified for the sign SCHEME only, not full charset)

This build's native charset is fixed at ASCII (`cobc --info` reports `native
character set : ASCII`, and there is no EBCDIC-target build available in this
sandbox), so true single-byte `0xC0`-`0xC9`/`0xD0`-`0xD9` output cannot be produced
here. However, `cobc -fsign=EBCDIC` selects GnuCOBOL's *EBCDIC-convention* sign
scheme independent of charset, and its output — read as ASCII text — reproduced the
letter table exactly:

Source: `zoneebcdicsign.cob`, `cobc -fsign=EBCDIC`, digits 0-9 × sign.

| # | Digit | Sign | cobc byte (as ASCII char) | codecs.js `overpunchChar(d, negative)` | Verdict |
|---|---|---|---|---|---|
| 42 | 0 | + or − | `7b` (`'{'`) | `'{'` → `7b` | MATCH (scheme) |
| 43 | 1 | + | `41` (`'A'`) | `'A'` → `41` | MATCH (scheme) |
| 44 | 1 | − | `4a` (`'J'`) | `'J'` → `4a` | MATCH (scheme) |
| 45 | 9 | + | `49` (`'I'`) | `'I'` → `49` | MATCH (scheme) |
| 46 | 9 | − | `52` (`'R'`) | `'R'` → `52` | MATCH (scheme) |

This is only a partial verification: it confirms the digit→letter mapping logic
that `zonedEncode`/`zonedDecode` share between `codePage` variants is correct for
the EBCDIC convention, and that `charToEbcdicByte('{')` etc. would need to map to
`0xC0` on a true EBCDIC target for the full pipeline (`codePage: 'EBCDIC'`) to be
correct end-to-end — which is exactly what the cp037 table lookup below confirms
independently (in the character-set dimension, disjoint from the sign-scheme
dimension just confirmed here).

---

## 8. EBCDIC cp037 translation table — spec/independent-library-verified (not cobc-verified)

`codecs.js`'s exported `EBCDIC_CP037_TO_UNICODE` (256 entries) was diffed
programmatically against Python 3's built-in `cp037` codec (`bytes(range(256)).decode('cp037')`)
— an independent, standard-library implementation of the same IBM code page, not
derived from or related to this repository's table.

```
mismatches: 0   (all 256 byte values agree)
```

This is not a GnuCOBOL/compiler verification (no EBCDIC-native GnuCOBOL runtime was
available to this sandbox — see caveat below), but it is a genuine independent
second implementation, and it fully corroborates the table backing
`ebcdicByteToChar`, `charToEbcdicByte`, `ebcdicToString`, and `stringToEbcdic`.
Combined with the sign-scheme confirmation in §7, the `'EBCDIC'` codePage path has
no evidence against it; only the `'ASCII'` codePage path (§6) is refuted.

---

## Caveat on charset scope (per mission instructions)

This GnuCOBOL 4.0-early-dev build's native runtime character set is ASCII
(`cobc --info` → `native character set : ASCII`); there is no `-febcdic`-style flag
or EBCDIC-target build available to compile/run a program that stores true
`0xC0`-`0xC9`/`0xD0`-`0xD9` zoned-overpunch or full-charset EBCDIC bytes on disk.
Packed decimal (§1) and big-endian binary (§2) are charset-independent (raw nibbles
and two's complement bytes respectively), so ASCII-native GnuCOBOL is a fully valid
oracle for those — no caveat applies there, and both fully matched. Where charset
mattered:
- Zoned-decimal **sign convention** could still be compiler-verified for EBCDIC via
  `-fsign=EBCDIC` (§7), independent of the charset used to store non-digit bytes.
- Zoned-decimal **ASCII** sign convention was directly, fully compiler-verified
  (§6) — and refuted.
- Full EBCDIC **character-set** translation (letters, punctuation, national
  characters outside `0-9`/sign-zone) rests on the independent Python cp037 codec
  (§8), not on cobc, and is reported as spec/independent-library-verified rather than
  compiler-verified.

---

## Summary counts

- **Compiler-verified (cobc) value/type-pair comparisons:** 46 distinct pairs across
  §1-§7 (133 individual byte positions checked in total across all sweeps), covering
  odd/even packed digit counts, unsigned/signed, 18-digit max, scale, ±0, int16/int32
  binary boundaries, big-endian binary boundary/width thresholds, `SIGN LEADING`,
  `SIGN SEPARATE LEADING`/`TRAILING`, unsigned zoned, signed overpunch (both sign
  positions), and the `-fsign=EBCDIC` sign-scheme.
- **Spec/independent-library-verified only:** 1 (full 256-entry cp037 table vs.
  Python's stdlib `cp037` codec).
- **Genuine, confirmed discrepancies:** 2 —
  1. `zonedEncode`/`zonedDecode` with `codePage: 'ASCII'` (signed, non-`SEPARATE`
     overpunch only) uses the wrong sign scheme entirely (EBCDIC letter table
     instead of ASCII zone-nibble swap `0x3x`/`0x7x`).
  2. `binaryEncode`/`binaryDecode` treat `COMP-5` as big-endian; real GnuCOBOL
     `COMP-5` is host-native (little-endian on x86_64), causing silent
     misinterpretation of every multi-byte `COMP-5` value (concrete
     `binaryDecode` misfires shown in §3).

**VERDICT: REFUTED.**

---

## Post-fix verification (2026-07-11)

Both REFUTED findings were fixed in `generator/codecs.js` and `runtime/CobolCodecs.scala`
(kept byte-identical across languages) and re-verified against the same real `cobc`
(GnuCOBOL 4.0-early-dev.0, native ASCII) used above. New probe sources:
`zonefix.cob` (finding 1) and `comp5fix.cob` (finding 2), same canary-byte technique as
the original probes - every canary byte (`FUNCTION ORD` on the trailing `PIC X`
REDEFINES-view byte) read back as `'Z'` (ORD 91) in every case, confirming byte widths
were unaffected by the fix.

### Finding 1 fix - ASCII zoned sign scheme (10 single-digit pairs + 2 multi-digit checks)

The fix: `zonedEncode`/`zonedDecode`'s `codePage: 'ASCII'` path now computes the
sign-bearing byte directly as `0x30 + d` (positive) / `0x70 + d` (negative) instead of
routing through the EBCDIC letter-overpunch table. `codePage: 'EBCDIC'` is untouched.

`cobc` output (`FUNCTION ORD` is 1-based; byte shown is `ORD - 1`) vs.
`zonedEncode(value, digits, { codePage: 'ASCII', ... })`:

| Case | Digit | Sign | cobc byte | `zonedEncode` (post-fix) | Verdict |
|---|---|---|---|---|---|
| D0P | 0 | + | `30` | `30` | MATCH |
| D1P | 1 | + | `31` | `31` | MATCH |
| D1N | 1 | − | `71` | `71` | MATCH |
| D2N | 2 | − | `72` | `72` | MATCH |
| D3N | 3 | − | `73` | `73` | MATCH |
| D5P | 5 | + | `35` | `35` | MATCH |
| D5N | 5 | − | `75` | `75` | MATCH |
| D7N | 7 | − | `77` | `77` | MATCH |
| D9P | 9 | + | `39` | `39` | MATCH |
| D9N | 9 | − | `79` | `79` | MATCH |
| M123-TRAIL (3-digit `-123`, SIGN TRAILING) | mixed | − | `31 32 73` | `313273` | MATCH |
| M123-LEAD (3-digit `-123`, SIGN LEADING) | mixed | − | `71 32 33` | `713233` | MATCH |

12/12 MATCH (10 required). All values previously mismatched under the refuted
letter-table implementation (see §6 above); every one now agrees with `cobc` exactly.
Canary bytes (`CANARY1`/`CANARY3`/`CANARYL`, all `ORD 91` = `'Z'`) confirm the fix did
not change field byte width.

### Finding 2 fix - COMP-5 little-endian (10 value/width pairs)

The fix: `binaryEncode`/`binaryDecode` now take an `endianness: 'BIG'|'LITTLE'` option
(JS) / parameter (Scala), defaulting to `'BIG'`. `generator/case-class-gen.js` passes
`'LITTLE'` only for COMP-5/COMPUTATIONAL-5 fields (`isComp5Usage`); every other binary
USAGE keeps the previously-verified `'BIG'` behavior unchanged.

`cobc` output (`FUNCTION ORD - 1` per byte, in storage order) vs.
`binaryEncode(value, byteLength, { endianness: 'LITTLE' })`:

| Case | PIC | Value | cobc bytes (hex) | `binaryEncode` (post-fix) | Verdict |
|---|---|---|---|---|---|
| C2-0 | `S9(4) COMP-5` | 0 | `00 00` | `0000` | MATCH |
| C2-1 | `S9(4) COMP-5` | 1 | `01 00` | `0100` | MATCH |
| C2-N1 | `S9(4) COMP-5` | -1 | `ff ff` | `ffff` | MATCH |
| C2-MAX | `S9(4) COMP-5` | 32767 | `ff 7f` | `ff7f` | MATCH |
| C2-MIN | `S9(4) COMP-5` | -32768 | `00 80` | `0080` | MATCH |
| C4-100 | `S9(9) COMP-5` | 100 | `64 00 00 00` | `64000000` | MATCH |
| C4-N100 | `S9(9) COMP-5` | -100 | `9c ff ff ff` | `9cffffff` | MATCH |
| C4-MAX | `S9(9) COMP-5` | 2147483647 | `ff ff ff 7f` | `ffffff7f` | MATCH |
| C4-MIN | `S9(9) COMP-5` | -2147483648 | `00 00 00 80` | `00000080` | MATCH |
| C8-12345 | `S9(18) COMP-5` | 12345 | `39 30 00 00 00 00 00 00` | `3930000000000000` | MATCH |

10/10 MATCH (10 required). Canary bytes (`C2-CANARY`/`C4-CANARY`/`C8-CANARY`, all
`ORD 91` = `'Z'`) confirm the byte-width sizing (2/4/8 bytes) is unaffected - only byte
*order* changed, as expected.

### JS<->Scala parity re-verification

A 295-case random parity fuzz (90 packed-decimal, 96 binary incl. explicit COMP-5
boundary values, 109 zoned-decimal incl. explicit ASCII known-value and multi-digit
cases) plus 6 hostile-input agreement cases (binary buffer >8 bytes, zoned empty/
too-short buffers, packed invalid-nibble buffers) was run against
`runtime/CobolCodecs.scala` via `scala-cli` (ad hoc script, not part of the committed
test suite - see `tests/roundtrip.test.js` for the persisted round-trip coverage of the
same fix through the full generator pipeline, including a dedicated COMP-5 leaf in the
`binary-comp-variants` layout). Result: **0 mismatches out of 301 compared results.**

**VERDICT: both REFUTED findings are now fixed and compiler-re-verified; JS/Scala
parity holds.**
