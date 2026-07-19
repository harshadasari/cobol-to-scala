/**
 * tests/round34-fixes.test.js
 *
 * Focused unit tests for round-34 adversarial-refutation findings - see
 * tests/oracle/README.md's round-34 table for the full write-up and the
 * jj01/jj02/jj03 promoted oracle corpus programs for the end-to-end
 * cobc-vs-generated-Scala verification (every fix below was ALSO
 * independently verified with a real scala-cli compile/run against those
 * exact corpus programs, matching cobc byte-for-byte for jj01/jj02, and
 * matching cobc's own "zero output before a hard abort" behavior for jj03).
 *
 *   1. (jj01/jj02) `LINAGE IS <n> LINES WITH FOOTING AT <m>` used the WRONG
 *      AT END-OF-PAGE threshold: round-33's own fix compared the running
 *      line counter against `(pageSize - footingLines)`, which happened to
 *      numerically coincide with the CORRECT formula for round-33's own
 *      regression values (pageSize=5, footingLines=3: both give 2) -
 *      masking the bug. A direct cobc probe with DIFFERENT values
 *      (pageSize=5/footingLines=4, and pageSize=5/footingLines=5) confirms
 *      the real threshold is `(footingLines - 1)`, not
 *      `(pageSize - footingLines)`. Fixed in `linageEopLines`
 *      (generator/expression-gen.js).
 *   2. (jj03) `WITH FOOTING AT <m>` where `m` exceeds the FD's own `LINAGE
 *      IS <n> LINES` page size is a statically-invalid combination real
 *      cobc rejects with a hard runtime abort AT OPEN TIME (`libcob: error:
 *      LINAGE values invalid (status = 57)`), writing ZERO output records.
 *      The engine previously had no such check at all - it ran the (buggy)
 *      formula as if nothing were wrong, silently producing 8 lines of
 *      output where cobc produces none. Fixed by statically detecting
 *      `footingLines > pageSize` at Scala-generation time (both values are
 *      always compile-time integer literals - see
 *      data-division-parser.js's own doc comment) and emitting a runtime
 *      abort as the very first thing OPEN does for that file, before any
 *      file handle is built (generator/file-io-gen.js's
 *      `isLinageInvalid`/`LINAGE_INVALID_FILES`/`setLinageInvalidFiles`).
 *
 * Both fixes' expectations below are re-derived directly from the real
 * cobc-captured tests/corpus/proc/jj0{1,2,3}-*.oracle.txt files (read at
 * test time) rather than hardcoded independently of them, via a small
 * from-scratch JS simulation of the documented counter/threshold/reset
 * rule - if that rule doesn't actually reproduce the real oracle sequence,
 * the simulation-vs-oracle assertions below fail BEFORE the
 * simulation-vs-generated-Scala assertions even get a chance to agree with
 * a wrong formula.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertToScala } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PROC = path.join(__dirname, 'corpus', 'proc');

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

function readCorpus(name) {
  return fs.readFileSync(path.join(CORPUS_PROC, name), 'utf-8');
}

/**
 * Parses a jj01/jj02-shaped oracle.txt ("NOTEOP AT I=01" / "EOP AT I=01"
 * per line, in WRITE order) into a plain ['NOTEOP', 'EOP', ...] array.
 */
function parseEopSequence(oracleText) {
  return oracleText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.startsWith('EOP') ? 'EOP' : l.startsWith('NOTEOP') ? 'NOTEOP' : null))
    .filter((v) => v !== null);
}

/**
 * The documented rule this round establishes: per WRITE, increment the
 * counter, report EOP once it reaches (footingLines - 1) (or pageSize, with
 * no FOOTING clause), and reset to 0 once it separately reaches the full
 * pageSize.
 */
function simulateEopSequence(pageSize, footingLines, writeCount) {
  const threshold = footingLines != null ? footingLines - 1 : pageSize;
  let ctr = 0;
  const seq = [];
  for (let i = 0; i < writeCount; i++) {
    ctr += 1;
    seq.push(ctr >= threshold ? 'EOP' : 'NOTEOP');
    if (ctr >= pageSize) ctr = 0;
  }
  return seq;
}

// ---------------------------------------------------------------------------
// Finding 1 (jj01): LINAGE IS 5 LINES WITH FOOTING AT 4 - threshold is
// (footingLines - 1) = 3, NOT (pageSize - footingLines) = 1.
// ---------------------------------------------------------------------------

describe('round-34 finding 1 (jj01): LINAGE IS 5 LINES WITH FOOTING AT 4 uses (footingLines - 1) = 3 as the AT END-OF-PAGE threshold', () => {
  const oracleText = readCorpus('jj01-linage-footing-formula.oracle.txt');
  const oracleSeq = parseEopSequence(oracleText);

  test('the real cobc oracle capture has 10 WRITE results (sanity)', () => {
    assert.equal(oracleSeq.length, 10);
  });

  test('simulating (footingLines - 1) reproduces the real cobc oracle sequence exactly', () => {
    assert.deepEqual(simulateEopSequence(5, 4, 10), oracleSeq);
  });

  test('simulating the OLD, wrong (pageSize - footingLines) formula does NOT reproduce the real cobc oracle sequence (confirms round-33 was actually wrong here, not just re-labeled)', () => {
    let ctr = 0;
    const wrongThreshold = 5 - 4; // pageSize - footingLines = 1
    const seq = [];
    for (let i = 0; i < 10; i++) {
      ctr += 1;
      seq.push(ctr >= wrongThreshold ? 'EOP' : 'NOTEOP');
      if (ctr >= 5) ctr = 0;
    }
    assert.notDeepEqual(seq, oracleSeq);
  });

  test('the generated Scala compares the counter against 3 (footingLines - 1), not 1 (pageSize - footingLines)', () => {
    const scala = scalaOf(readCorpus('jj01-linage-footing-formula.cbl'));
    assert.match(scala, /if printFileLinageCtr >= 3 then/);
    assert.match(scala, /if printFileLinageCtr >= 5 then\s*\n\s*printFileLinageCtr = 0/);
  });
});

// ---------------------------------------------------------------------------
// Finding 1 (jj02): LINAGE IS 5 LINES WITH FOOTING AT 5 (footing == page
// size) - threshold is (footingLines - 1) = 4, NOT (pageSize - footingLines)
// = 0 (which would make EVERY write report EOP).
// ---------------------------------------------------------------------------

describe('round-34 finding 1 (jj02): LINAGE IS 5 LINES WITH FOOTING AT 5 uses (footingLines - 1) = 4 as the AT END-OF-PAGE threshold', () => {
  const oracleText = readCorpus('jj02-linage-footing-equals-page.oracle.txt');
  const oracleSeq = parseEopSequence(oracleText);

  test('the real cobc oracle capture has 8 WRITE results (sanity)', () => {
    assert.equal(oracleSeq.length, 8);
  });

  test('simulating (footingLines - 1) reproduces the real cobc oracle sequence exactly', () => {
    assert.deepEqual(simulateEopSequence(5, 5, 8), oracleSeq);
  });

  test('the generated Scala compares the counter against 4 (footingLines - 1), not 0 (pageSize - footingLines)', () => {
    const scala = scalaOf(readCorpus('jj02-linage-footing-equals-page.cbl'));
    assert.match(scala, /if printFileLinageCtr >= 4 then/);
    assert.match(scala, /if printFileLinageCtr >= 5 then\s*\n\s*printFileLinageCtr = 0/);
  });
});

// ---------------------------------------------------------------------------
// Regression: round-33's own ii01 case (pageSize=5, footingLines=3) still
// produces the identical threshold (2) this fix's formula and round-33's
// own (now-corrected-to-be-coincidentally-right-here) formula both agree
// on - this round's fix must not disturb it.
// ---------------------------------------------------------------------------

describe('round-34 finding 1 regression: round-33\'s own ii01 case (footingLines=3, pageSize=5) keeps its identical threshold (2) - the coincidence that masked this bug in round 33 cuts both ways', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T34IIREGRESS.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T34IIREGRESS.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES
           WITH FOOTING AT 3.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP"
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP"
           END-WRITE.
           STOP RUN.
`;
  test('threshold is still 2 (footingLines - 1 = 3 - 1 = 2, same value pageSize - footingLines = 5 - 3 = 2 gave before this fix)', () => {
    const scala = scalaOf(src);
    assert.match(scala, /if printFileLinageCtr >= 2 then/);
  });
});

describe('round-34 finding 1 regression: a bare LINAGE (no FOOTING clause) keeps round-32\'s exact behavior - threshold degenerates to pageSize', () => {
  const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T34BARELIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T34BARELIN.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 2 LINES.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP"
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP"
           END-WRITE.
           STOP RUN.
`;
  test('both the EOP condition and the reset compare against the same bare pageSize (2), unaffected by this round\'s FOOTING-only fix', () => {
    const scala = scalaOf(src);
    assert.match(scala, /if printFileLinageCtr >= 2 then/);
    assert.match(scala, /if printFileLinageCtr >= 2 then\s*\n\s*printFileLinageCtr = 0/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (jj03): LINAGE IS 5 LINES WITH FOOTING AT 7 - FOOTING exceeds
// LINES, a statically-invalid combination real cobc aborts on at OPEN time
// with zero output.
// ---------------------------------------------------------------------------

describe('round-34 finding 2 (jj03): WITH FOOTING AT <m> exceeding LINAGE IS <n> LINES aborts at OPEN, before any output', () => {
  const oracleText = readCorpus('jj03-linage-exceeds.oracle.txt');

  test('the real cobc oracle capture documents a hard abort with zero stdout output (sanity - confirms what this probe is actually testing)', () => {
    assert.match(oracleText, /LINAGE values invalid \(status = 57\)/);
  });

  test('the generated Scala emits a runtime abort (stderr message + sys.exit) for the OPEN of this file', () => {
    const scala = scalaOf(readCorpus('jj03-linage-exceeds.cbl.txt'));
    assert.match(scala, /LINAGE values invalid \(status = 57\)/);
    assert.match(scala, /sys\.exit\(1\)/);
  });

  test('the abort is the ENTIRE body of OPEN for this file - no writer/file handle is ever constructed at all, so no WRITE can ever run first', () => {
    const scala = scalaOf(readCorpus('jj03-linage-exceeds.cbl.txt'));
    assert.match(scala, /LINAGE values invalid/);
    // Unlike jj01/jj02 (a real OPEN OUTPUT), this file's OPEN never builds an
    // actual java.io.PrintWriter at all - the abort short-circuits before
    // that codegen branch is even reached (generateOpen's `continue` right
    // after emitting the abort lines).
    assert.doesNotMatch(scala, /printFileWriter = new java\.io\.PrintWriter/);
  });
});

describe('round-34 finding 2 regression: a FOOTING value within the page size (jj01/jj02\'s own shape) does NOT trigger the new abort', () => {
  test('jj01 (footingLines=4 <= pageSize=5) has no abort code at all', () => {
    const scala = scalaOf(readCorpus('jj01-linage-footing-formula.cbl'));
    assert.doesNotMatch(scala, /LINAGE values invalid/);
  });

  test('jj02 (footingLines=5 == pageSize=5) has no abort code at all - equal is valid, only STRICTLY GREATER is invalid', () => {
    const scala = scalaOf(readCorpus('jj02-linage-footing-equals-page.cbl'));
    assert.doesNotMatch(scala, /LINAGE values invalid/);
  });

  test('a bare LINAGE (no FOOTING at all) has no abort code at all', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T34BARELIN2.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "T34BARELIN2.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           WRITE PRINT-REC.
           CLOSE PRINT-FILE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.doesNotMatch(scala, /LINAGE values invalid/);
  });
});
