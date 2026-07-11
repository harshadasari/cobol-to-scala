/**
 * tests/roundtrip.test.js
 *
 * Byte-level record I/O round-trip property test (Phase 1).
 *
 * For a set of hand-authored COBOL record layouts covering every codec
 * dispatched by generator/case-class-gen.js (packed decimal, binary, zoned
 * decimal signed/unsigned/separate-sign, PIC X/A strings in both charsets,
 * mixed groups, OCCURS tables, and REDEFINES), this suite:
 *
 *   (a) generates the Scala case class + companion object via convertToScala()
 *   (b) synthesizes N random, *valid* record byte arrays entirely in JS using
 *       generator/codecs.js (the reference codec implementation - the same
 *       one runtime/CobolCodecs.scala is required to match byte-for-byte)
 *   (c) writes a self-contained scala-cli script that embeds the generated
 *       Scala, hardcodes those byte arrays as literals, and for each one
 *       asserts `format(parse(bytes)) == bytes`
 *   (d) runs it with scala-cli (via tests/oracle/harness.js's runScala, which
 *       already scratches under os.tmpdir(), enforces a 120s timeout, and
 *       strips the sandbox's JAVA_TOOL_OPTIONS stderr noise) and asserts the
 *       summary line it prints shows zero failures.
 *
 * This is a *self-consistency* test, not a compiler-oracle test: the JS
 * synthesizer and the embedded Scala runtime only need to agree with each
 * other (which they do by construction/design - see runtime/CobolCodecs.scala's
 * header comment), not with real GnuCOBOL. Compiler-oracle verification is a
 * separate, already-tracked concern owned by tests/oracle/.
 *
 * Skips (not fails) entirely when scala-cli isn't on PATH, same convention as
 * tests/oracle/oracle.test.js.
 */

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { toPascalCase } from '../generator/case-class-gen.js';
import {
  packedEncode,
  binaryEncode,
  binaryByteLength,
  zonedEncode,
  stringToEbcdic,
} from '../generator/codecs.js';
import { checkScalaCliAvailable, runScala, warmupScala } from './oracle/harness.js';

const RECORDS_PER_LAYOUT = 20;
const SCALA_RUN_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 130_000;

// ============================================================================
// Random leaf-value byte synthesis (mirrors case-class-gen.js's classifyCodec
// dispatch: 'packed' | 'binary' | 'zoned' | 'string').
// ============================================================================

function randomDigitString(digits) {
  let s = '';
  for (let i = 0; i < digits; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomMagnitude(digits) {
  const s = randomDigitString(digits);
  return s === '' ? 0n : BigInt(s);
}

function randomSignedValue(digits, signed) {
  const magnitude = randomMagnitude(digits);
  if (signed && magnitude !== 0n && Math.random() < 0.5) return -magnitude;
  return magnitude;
}

// Printable range safe for both codePages: every 0x20-0x7E byte round-trips
// exactly under ISO-8859-1 (the 'ascii' charset mode) and has a valid cp037
// mapping (the 'ebcdic' charset mode), so synthesis never hits an encoder
// error regardless of which layout/charset is being exercised.
function randomPrintableString(length) {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(0x20 + Math.floor(Math.random() * (0x7e - 0x20 + 1)));
  }
  return s;
}

function synthLeafBytes(spec) {
  switch (spec.kind) {
    case 'packed': {
      const value = randomSignedValue(spec.digits, spec.signed !== false);
      return Buffer.from(packedEncode(value, spec.digits, { signed: spec.signed !== false }));
    }
    case 'binary': {
      const value = randomSignedValue(spec.digits, true);
      // COMP-5 leaves must set `endianness: 'LITTLE'` to match
      // case-class-gen.js's generated decode call (see classifyCodec's
      // isComp5Usage): COMP-5 is host-native (little-endian on x86_64),
      // unlike plain COMP/COMP-4/BINARY, which stay big-endian. Getting this
      // wrong here would desync the synthesizer from what the generated
      // Scala actually decodes with.
      return Buffer.from(
        binaryEncode(value, binaryByteLength(spec.digits), { endianness: spec.endianness || 'BIG' })
      );
    }
    case 'zoned': {
      const value = randomSignedValue(spec.digits, spec.signed !== false);
      return Buffer.from(
        zonedEncode(value, spec.digits, {
          signed: spec.signed !== false,
          signLeading: !!spec.signLeading,
          signSeparate: !!spec.signSeparate,
          codePage: spec.codePage || 'ASCII',
        })
      );
    }
    case 'string': {
      const str = randomPrintableString(spec.length);
      if ((spec.codePage || 'ASCII') === 'EBCDIC') {
        return Buffer.from(stringToEbcdic(str, { length: spec.length }));
      }
      return Buffer.from(str, 'latin1');
    }
    default:
      throw new Error(`synthLeafBytes: unknown leaf kind '${spec.kind}'`);
  }
}

// `leaves` is the flat, in-byte-order list of elementary field specs for one
// record (OCCURS already expanded to N repeated entries by the layout
// definition below; REDEFINES children simply omitted, since their storage
// is already covered by the field they redefine - exactly mirroring what
// layout.js's itemByteLength/case-class-gen.js's offset tracking do).
function synthRecordBytes(leaves) {
  return Buffer.concat(leaves.map(synthLeafBytes));
}

function scalaByteArrayLiteral(bytes) {
  return `Array[Byte](${Array.from(bytes).map(b => `${b}.toByte`).join(', ')})`;
}

// ============================================================================
// Layouts
// ============================================================================

function program(programId, recordSource) {
  return `       IDENTIFICATION DIVISION.
       PROGRAM-ID. ${programId}.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
${recordSource}       PROCEDURE DIVISION.
       MAIN-PARA.
           STOP RUN.
`;
}

const LAYOUTS = [
  {
    name: 'packed-comp3-signed-unsigned',
    charset: 'ascii',
    cobol: program(
      'PACKEDT',
      `       01  REC-PACKED.
           05  AMT-SIGNED      PIC S9(7)V99 COMP-3.
           05  QTY-UNSIGNED    PIC 9(5) COMP-3.
`
    ),
    leaves: [
      { kind: 'packed', digits: 9, signed: true },
      { kind: 'packed', digits: 5, signed: false },
    ],
  },
  {
    name: 'binary-comp-variants',
    charset: 'ascii',
    cobol: program(
      'BINARYT',
      `       01  REC-BINARY.
           05  BIN-SMALL       PIC S9(4) COMP.
           05  BIN-MED         PIC S9(9) COMP-4.
           05  BIN-LARGE       PIC S9(18) COMP-5.
           05  BIN-PLAIN       PIC S9(3) BINARY.
`
    ),
    leaves: [
      { kind: 'binary', digits: 4 }, // BIN-SMALL: COMP -> big-endian
      { kind: 'binary', digits: 9 }, // BIN-MED: COMP-4 -> big-endian
      { kind: 'binary', digits: 18, endianness: 'LITTLE' }, // BIN-LARGE: COMP-5 -> little-endian
      { kind: 'binary', digits: 3 }, // BIN-PLAIN: BINARY -> big-endian
    ],
  },
  {
    name: 'zoned-signed-all-sign-forms',
    charset: 'ascii',
    cobol: program(
      'ZONEDSGN',
      `       01  REC-ZONED-SIGNED.
           05  Z-TRAILING          PIC S9(5).
           05  Z-LEADING           PIC S9(5) SIGN LEADING.
           05  Z-SEP-TRAILING      PIC S9(4) SIGN TRAILING SEPARATE.
           05  Z-SEP-LEADING       PIC S9(4) SIGN LEADING SEPARATE.
`
    ),
    leaves: [
      { kind: 'zoned', digits: 5, signed: true, signLeading: false, signSeparate: false },
      { kind: 'zoned', digits: 5, signed: true, signLeading: true, signSeparate: false },
      { kind: 'zoned', digits: 4, signed: true, signLeading: false, signSeparate: true },
      { kind: 'zoned', digits: 4, signed: true, signLeading: true, signSeparate: true },
    ],
  },
  {
    name: 'zoned-unsigned',
    charset: 'ascii',
    cobol: program(
      'ZONEDUNS',
      `       01  REC-ZONED-UNSIGNED.
           05  Z-PLAIN         PIC 9(6).
`
    ),
    leaves: [{ kind: 'zoned', digits: 6, signed: false }],
  },
  {
    name: 'strings-ascii',
    charset: 'ascii',
    cobol: program(
      'STRASCII',
      `       01  REC-STRINGS.
           05  STR-X           PIC X(12).
           05  STR-A           PIC A(8).
`
    ),
    leaves: [
      { kind: 'string', length: 12, codePage: 'ASCII' },
      { kind: 'string', length: 8, codePage: 'ASCII' },
    ],
  },
  {
    name: 'strings-ebcdic',
    charset: 'ebcdic',
    cobol: program(
      'STREBCDC',
      `       01  REC-STRINGS-EBCDIC.
           05  STR-X           PIC X(10).
           05  STR-A           PIC A(6).
`
    ),
    leaves: [
      { kind: 'string', length: 10, codePage: 'EBCDIC' },
      { kind: 'string', length: 6, codePage: 'EBCDIC' },
    ],
  },
  {
    name: 'mixed-groups',
    charset: 'ascii',
    cobol: program(
      'MIXEDGRP',
      `       01  REC-MIXED.
           05  TOP-BIN         PIC S9(4) COMP.
           05  GRP-INNER.
               10  INNER-AMT   PIC S9(5)V99 COMP-3.
               10  INNER-CODE  PIC X(4).
               10  INNER-QTY   PIC 9(3).
`
    ),
    leaves: [
      { kind: 'binary', digits: 4 },
      { kind: 'packed', digits: 7, signed: true },
      { kind: 'string', length: 4, codePage: 'ASCII' },
      { kind: 'zoned', digits: 3, signed: false },
    ],
  },
  {
    name: 'occurs-table-primitive',
    charset: 'ascii',
    cobol: program(
      'TBLPRIM',
      `       01  REC-TABLE-PRIM.
           05  TBL-ENTRY OCCURS 5 TIMES PIC S9(4)V99.
`
    ),
    leaves: Array.from({ length: 5 }, () => ({ kind: 'zoned', digits: 6, signed: true })),
  },
  {
    name: 'occurs-table-group',
    charset: 'ascii',
    cobol: program(
      'TBLGRP',
      `       01  REC-TABLE-GROUP.
           05  TBL-ROW OCCURS 4 TIMES.
               10  ROW-AMT     PIC S9(5) COMP-3.
               10  ROW-NAME    PIC X(6).
`
    ),
    leaves: Array.from({ length: 4 }, () => [
      { kind: 'packed', digits: 5, signed: true },
      { kind: 'string', length: 6, codePage: 'ASCII' },
    ]).flat(),
  },
  {
    name: 'redefines',
    charset: 'ascii',
    cobol: program(
      'REDEFT',
      `       01  REC-REDEFINES.
           05  RAW-DATE        PIC 9(8).
           05  DATE-PARTS REDEFINES RAW-DATE.
               10  D-YYYY      PIC 9(4).
               10  D-MM        PIC 9(2).
               10  D-DD        PIC 9(2).
`
    ),
    // DATE-PARTS is a REDEFINES: it contributes no bytes of its own, the
    // record's only real storage is RAW-DATE.
    leaves: [{ kind: 'zoned', digits: 8, signed: false }],
    // Sanity-checked in the Scala driver: accessing `.datePArts` must not throw.
    redefineAccessor: 'dateParts',
  },
];

// ============================================================================
// Scala driver assembly
// ============================================================================

function buildScalaScript(layout, generatedScala, className, byteArrays) {
  const literals = byteArrays.map(scalaByteArrayLiteral).join(',\n      ');
  const redefineCheck = layout.redefineAccessor
    ? `
        // REDEFINES sanity check: the lazy alternate view must decode without
        // throwing (its correctness as a *value* isn't asserted here - only
        // that recomputing the redefined region via format(this) and
        // re-parsing it succeeds).
        val _ = parsed.${layout.redefineAccessor}`
    : '';

  return `//> using scala 3.7.3

${generatedScala}

@main def roundtripTest(): Unit =
  val records: Vector[Array[Byte]] = Vector(
      ${literals}
  )
  var pass = 0
  var fail = 0
  for ((bytes, idx) <- records.zipWithIndex) do
    try
      val parsed = ${className}.parse(bytes)
      val out = ${className}.format(parsed)${redefineCheck}
      if out.sameElements(bytes) then
        pass += 1
      else
        fail += 1
        println(s"MISMATCH idx=\${idx} expected=\${bytes.map(b => f"\$b%02x").mkString} actual=\${out.map(b => f"\$b%02x").mkString}")
    catch
      case e: Throwable =>
        fail += 1
        println(s"EXCEPTION idx=\${idx}: \${e.getClass.getName}: \${e.getMessage}")
  println(s"ROUNDTRIP_RESULT pass=\${pass} fail=\${fail} total=\${records.length}")
`;
}

// ============================================================================
// Suite
// ============================================================================

const scalaCliAvailable = await checkScalaCliAvailable();

describe('toolchain availability', () => {
  test('scala-cli is on PATH', (t) => {
    if (!scalaCliAvailable) {
      t.skip('scala-cli not found on PATH; all round-trip tests below will skip (see docs/toolchain-status.md)');
      return;
    }
    assert.ok(scalaCliAvailable);
  });
});

describe('byte-level record I/O round-trip (format(parse(bytes)) == bytes)', () => {
  before(async () => {
    if (scalaCliAvailable) await warmupScala();
  });

  for (const layout of LAYOUTS) {
    test(
      `${layout.name}: ${RECORDS_PER_LAYOUT} random records round-trip byte-for-byte`,
      { timeout: TEST_TIMEOUT_MS },
      async (t) => {
        if (!scalaCliAvailable) {
          t.skip('scala-cli unavailable');
          return;
        }

        const converted = convertToScala(layout.cobol, { charset: layout.charset, generateMain: false });
        const recordName = layout.cobol.match(/01\s+([A-Z0-9-]+)\./)[1];
        const className = toPascalCase(recordName);

        const byteArrays = Array.from({ length: RECORDS_PER_LAYOUT }, () => synthRecordBytes(layout.leaves));
        const script = buildScalaScript(layout, converted.scala, className, byteArrays);

        const result = await runScala(script, {
          timeout: SCALA_RUN_TIMEOUT_MS,
          fileName: `${layout.name.replace(/[^a-zA-Z0-9]/g, '_')}.scala`,
        });

        assert.equal(
          result.phase,
          'run',
          `generated Scala for layout '${layout.name}' failed to compile:\n${result.stderr}\n\n--- generated source ---\n${converted.scala}`
        );
        assert.equal(
          result.exitCode,
          0,
          `Scala round-trip driver for '${layout.name}' exited ${result.exitCode}:\n${result.stdout}\n${result.stderr}`
        );

        const match = result.stdout.match(/ROUNDTRIP_RESULT pass=(\d+) fail=(\d+) total=(\d+)/);
        assert.ok(match, `no ROUNDTRIP_RESULT summary line in stdout for '${layout.name}':\n${result.stdout}`);

        const [, pass, fail, total] = match.map(Number);
        t.diagnostic(`${layout.name}: pass=${pass} fail=${fail} total=${total}`);

        assert.equal(total, RECORDS_PER_LAYOUT, `expected ${RECORDS_PER_LAYOUT} records exercised for '${layout.name}'`);
        assert.equal(fail, 0, `${fail}/${total} records failed to round-trip for '${layout.name}':\n${result.stdout}`);
        assert.equal(pass, RECORDS_PER_LAYOUT);
      }
    );
  }
});
