/**
 * tests/round28-fixes.test.js
 *
 * Focused unit tests for the round-28 adversarial-refutation findings - see
 * tests/oracle/README.md's round-28 table for the full write-up and the
 * dd02/dd09/dd10/dd11 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification. Every production fix below was ALSO
 * independently verified with a real scala-cli compile/run against the
 * actual dd02/dd09/dd10/dd11 corpus programs, matching cobc byte-for-byte in
 * every case (see the round-28 README table for the exact captured output).
 *
 *   1. (dd02) A DECLARATIVES `USE AFTER STANDARD ERROR PROCEDURE` handler was
 *      ALWAYS generated as a flat top-level method reading the module-level
 *      LINKAGE var directly - correct for an ordinary program, but wrong for
 *      a RECURSIVE one, whose every ORDINARY paragraph is instead nested
 *      inside entry() so it closes over the CURRENT call's own getter/setter
 *      LINKAGE-aliasing closures. The un-nested handler method always saw
 *      the stale, never-actually-assigned module var instead of the current
 *      activation's real LINKAGE value.
 *   2. (dd09) `declarativeHandlerFor` (the shared DECLARATIVES dispatch
 *      helper OPEN/plain-READ/REWRITE/DELETE's own SEQUENTIAL-access failure
 *      paths already use) was never wired into ANY of the keyed
 *      (RANDOM/DYNAMIC-access) READ/WRITE/REWRITE/DELETE/START failure
 *      branches at all - a registered handler never fired for a keyed I/O
 *      failure, no matter the FILE STATUS.
 *   3. (dd10) COMP-1/COMP-2 (Float/Double) file-record byte encoding used a
 *      text-truncation shortcut (`value.toString.reverse.padTo(...)...`)
 *      instead of a real IEEE-754 binary codec - `-7.125` silently became the
 *      ASCII text "-7.1", which then decoded back as -7.099999904632568. A
 *      genuine data-corruption bug, fixed by adding real floatEncode/
 *      floatDecode/doubleEncode/doubleDecode codecs (generator/codecs.js +
 *      runtime/CobolCodecs.scala), host-native (little-endian) byte order -
 *      compiler-verified directly against installed GnuCOBOL.
 *   4. (dd11) The OCCURS DEPENDING ON table WRITE codegen
 *      (`odoDisplayValueExpr`) built `CobolFmt.digitsOf(BigDecimal(...))` for
 *      EVERY table element regardless of its own declared PIC clause - a
 *      hard NumberFormatException the instant an alphanumeric (PIC X(n))
 *      table element was written.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import * as codecs from '../generator/codecs.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1 (dd02): RECURSIVE program's DECLARATIVES handler is nested
// inside entry(), closing over the CURRENT call's own LINKAGE getter/setter.
// ---------------------------------------------------------------------------

describe('round-28 finding 1 (dd02): RECURSIVE program nests its DECLARATIVES handler inside entry()', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T28SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MISSING-FILE ASSIGN TO "T28-NO-SUCH-FILE"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  MISSING-FILE.
       01  MISSING-REC   PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       DECLARATIVES.
       MISSING-FILE-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON MISSING-FILE.
       MISSING-FILE-HANDLER.
           DISPLAY "HANDLER-FIRED AT DEPTH=" LS-DEPTH.
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-PARA-START.
           IF LS-DEPTH = 2
               OPEN INPUT MISSING-FILE
           END-IF.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "T28SUB" USING WS-NEXT-DEPTH
           END-IF.
           GOBACK.
       END PROGRAM T28SUB.
`;
  const scala = scalaOf(src, { emitEntryPoint: true });

  test('entry() declares a nested handler def with the same name the flat top-level method uses', () => {
    // The flat top-level (dead-for-recursive, but still emitted) method.
    assert.match(scala, /def missingFileErr\(\): Unit =/);
    const entryIdx = scala.indexOf('def entry(');
    assert.ok(entryIdx >= 0, 'entry() must exist');
    const entryBody = scala.slice(entryIdx);
    // Nested inside entry(), a SECOND "def missingFileErr(): Unit =" exists.
    const occurrences = entryBody.match(/def missingFileErr\(\): Unit =/g) || [];
    assert.equal(occurrences.length, 1, 'the nested handler def must appear once inside entry()');
  });

  test('the nested handler closes over the LOCAL lsDepth getter (declared before it in entry()), not a module var', () => {
    const entryIdx = scala.indexOf('def entry(');
    const entryBody = scala.slice(entryIdx);
    assert.match(entryBody, /def lsDepth: Int = _get0\(\)/);
    const handlerIdx = entryBody.indexOf('def missingFileErr');
    const getterIdx = entryBody.indexOf('def lsDepth: Int');
    assert.ok(getterIdx < handlerIdx, 'the lsDepth getter must be declared before the nested handler so it is in lexical scope');
  });

  test('regression guard: a NON-recursive program with the same DECLARATIVES shape keeps the flat top-level handler untouched (no nesting)', () => {
    const nonRecursiveSrc = src.replace('T28SUB RECURSIVE', 'T28SUB').replace(/T28SUB/g, 'T28SUB');
    const nrScala = scalaOf(nonRecursiveSrc.replace('PROGRAM-ID. T28SUB.\n', 'PROGRAM-ID. T28SUB.\n'), { emitEntryPoint: false });
    assert.match(nrScala, /def missingFileErr\(\): Unit =/);
    assert.doesNotMatch(nrScala, /def entry\(/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (dd09): declarativeHandlerFor wired into every keyed (RANDOM/
// DYNAMIC-access) READ/WRITE/REWRITE/DELETE/START failure branch.
// ---------------------------------------------------------------------------

const RELATIVE_FILE_HEADER = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T28KEYED.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T28REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(4) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       REL-FILE-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON REL-FILE.
       REL-FILE-HANDLER.
           DISPLAY "HANDLER ST=" WS-STATUS.
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-PARA-START.
`;

describe('round-28 finding 2 (dd09): declarativeHandlerFor fires on every keyed I/O failure', () => {
  test('keyed WRITE: both the duplicate-key (22) and boundary-violation (24) failure branches invoke the handler', () => {
    const src = `${RELATIVE_FILE_HEADER}
           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY. MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    // Both failure branches call the same nested handler method name.
    const handlerCalls = scala.match(/relFileErr\(\)/g) || [];
    assert.ok(handlerCalls.length >= 2, `expected at least 2 handler invocations (dup-key + boundary), got ${handlerCalls.length}`);
    assert.match(scala, /wsStatus = "22"/);
    assert.match(scala, /wsStatus = "24"/);
  });

  test('keyed READ: the not-found (23) failure branch invokes the handler', () => {
    const src = `${RELATIVE_FILE_HEADER}
           OPEN INPUT REL-FILE.
           MOVE 9 TO WS-RKEY.
           READ REL-FILE.
           CLOSE REL-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsStatus = "23"/);
    assert.match(scala, /relFileErr\(\)/);
  });

  test('keyed REWRITE: the boundary-violation (24) failure branch invokes the handler', () => {
    const src = `${RELATIVE_FILE_HEADER}
           OPEN I-O REL-FILE.
           MOVE 0 TO WS-RKEY. MOVE 0 TO REC-ID. MOVE "AAAAA" TO REC-VAL.
           REWRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsStatus = "24"/);
    assert.match(scala, /relFileErr\(\)/);
  });

  test('keyed DELETE: the boundary-violation (24) failure branch invokes the handler', () => {
    const src = `${RELATIVE_FILE_HEADER}
           OPEN I-O REL-FILE.
           MOVE 0 TO WS-RKEY.
           DELETE REL-FILE RECORD.
           CLOSE REL-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsStatus = "24"/);
    assert.match(scala, /relFileErr\(\)/);
  });

  test('START: the invalid-key (23) failure branch invokes the handler', () => {
    const src = `${RELATIVE_FILE_HEADER}
           OPEN INPUT REL-FILE.
           MOVE 9 TO WS-RKEY.
           START REL-FILE KEY IS EQUAL TO WS-RKEY.
           CLOSE REL-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsStatus = "23"/);
    assert.match(scala, /relFileErr\(\)/);
  });

  test('regression guard: with NO DECLARATIVES at all, none of the keyed paths reference a handler method', () => {
    const src = `${RELATIVE_FILE_HEADER.replace(/DECLARATIVES\.[\s\S]*END DECLARATIVES\.\n/, '')}
           OPEN I-O REL-FILE.
           MOVE 0 TO WS-RKEY. MOVE 0 TO REC-ID. MOVE "AAAAA" TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /relFileErr\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (dd10): COMP-1/COMP-2 file-record byte encoding uses real
// IEEE-754 codecs, not text truncation.
// ---------------------------------------------------------------------------

describe('round-28 finding 3 (dd10): COMP-1/COMP-2 file records use real IEEE-754 codecs', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T28FLOAT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T28FLOATREL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID     PIC 9(3).
           05  REC-F1     COMP-1.
           05  REC-F2     COMP-2.
       WORKING-STORAGE SECTION.
       01  WS-RKEY        PIC 9(3) VALUE 0.
       01  WS-STATUS      PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE -7.125 TO REC-F1.
           MOVE 100.5 TO REC-F2.
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('the generated case class format()/parse() call CobolCodecs.floatEncode/floatDecode for the COMP-1 child', () => {
    assert.match(scala, /CobolCodecs\.floatEncode\(record\.recF1\)/);
    assert.match(scala, /CobolCodecs\.floatDecode\(/);
  });

  test('the generated case class format()/parse() call CobolCodecs.doubleEncode/doubleDecode for the COMP-2 child', () => {
    assert.match(scala, /CobolCodecs\.doubleEncode\(record\.recF2\)/);
    assert.match(scala, /CobolCodecs\.doubleDecode\(/);
  });

  test('the text-truncation shortcut is gone: no ".toString.reverse.padTo" for these fields', () => {
    assert.doesNotMatch(scala, /recF1.*\.toString\.reverse\.padTo/);
    assert.doesNotMatch(scala, /recF2.*\.toString\.reverse\.padTo/);
  });

  test('the embedded CobolCodecs runtime defines floatEncode/floatDecode/doubleEncode/doubleDecode', () => {
    assert.match(scala, /def floatEncode\(value: Float\): Array\[Byte\]/);
    assert.match(scala, /def floatDecode\(bytes: Array\[Byte\]\): Float/);
    assert.match(scala, /def doubleEncode\(value: Double\): Array\[Byte\]/);
    assert.match(scala, /def doubleDecode\(bytes: Array\[Byte\]\): Double/);
  });
});

describe('round-28 finding 3: generator/codecs.js JS-reference float/double codecs round-trip real IEEE-754 bit patterns', () => {
  test('floatEncode/floatDecode round-trips -7.125 exactly, with the exact bytes compiler-verified against installed GnuCOBOL', () => {
    const bytes = codecs.floatEncode(-7.125);
    // Compiler-verified (see tests/oracle/README.md round-28 entry): cobc
    // wrote -7.125 as COMP-1 bytes 00 00 e4 c0 (host-native/little-endian).
    assert.deepEqual(Array.from(bytes), [0x00, 0x00, 0xe4, 0xc0]);
    assert.equal(codecs.floatDecode(bytes), -7.125);
  });

  test('doubleEncode/doubleDecode round-trips 100.5 exactly, with the exact bytes compiler-verified against installed GnuCOBOL', () => {
    const bytes = codecs.doubleEncode(100.5);
    // Compiler-verified: cobc wrote 100.5 as COMP-2 bytes 00 00 00 00 00 20 59 40.
    assert.deepEqual(Array.from(bytes), [0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x59, 0x40]);
    assert.equal(codecs.doubleDecode(bytes), 100.5);
  });

  test('a value that would lose precision under text truncation (e.g. 0.1) round-trips exactly through the real codec', () => {
    const bytes = codecs.doubleEncode(0.1);
    assert.equal(codecs.doubleDecode(bytes), 0.1);
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (dd11): OCCURS DEPENDING ON alphanumeric table element WRITE no
// longer crashes - dispatches on the element's actual declared type.
// ---------------------------------------------------------------------------

describe('round-28 finding 4 (dd11): ODO table WRITE dispatches on the element\'s actual PIC type', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T28ODO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "T28ODOREL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-COUNT   PIC 9(1).
           05  REC-ITEM    PIC X(3) OCCURS 1 TO 5 TIMES
                               DEPENDING ON REC-COUNT.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 2 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           WRITE REL-REC.
           CLOSE REL-FILE.
           STOP RUN.
`;
  const scala = scalaOf(src);

  test('an alphanumeric (PIC X) table element uses CobolFmt.fitLeft, not CobolFmt.digitsOf/BigDecimal', () => {
    assert.match(scala, /CobolFmt\.fitLeft\(recItem\(i\), 3\)/);
    assert.doesNotMatch(scala, /BigDecimal\(recItem\(i\)\)/);
    assert.doesNotMatch(scala, /CobolFmt\.digitsOf\(recItem/);
  });

  test('the counter field itself (an ordinary numeric, non-table child) is unaffected - still uses CobolFmt.digitsOf', () => {
    assert.match(scala, /CobolFmt\.digitsOf\(BigDecimal\(recCount\), 1, 0\)/);
  });

  test('regression guard: a NUMERIC ODO table element still uses CobolFmt.digitsOf/BigDecimal, not fitLeft', () => {
    const numSrc = src.replace(/PIC X\(3\)/, 'PIC 9(3)').replace(/"AAA"/, '11').replace(/"BBB"/, '22');
    const numScala = scalaOf(numSrc);
    assert.match(numScala, /CobolFmt\.digitsOf\(BigDecimal\(recItem\(i\)\), 3, 0\)/);
  });
});
