/**
 * tests/round22-fixes.test.js
 *
 * Focused unit tests for the round-22 adversarial-refutation findings (4
 * reported, all fixed at root cause) - see tests/oracle/README.md's round-22
 * table for the full write-up and the k01/k02/k03/k11 promoted oracle corpus
 * programs for the end-to-end cobc-vs-generated-Scala verification. This
 * file targets the individual parser/generator mechanisms each finding
 * traces to, in isolation (no cobc/scala-cli needed).
 *
 *   1. A RECURSIVE program whose sole LINKAGE parameter is a GROUP (not a
 *      plain scalar) fell all the way through round-21 finding 2's own
 *      getter/setter closure-aliasing fix to the ORDINARY (non-recursive-
 *      safe) shared-module-var convention - silently reproducing the exact
 *      same clobbering bug round-21 finding 2 fixed for a scalar parameter,
 *      just for a group's children instead. Fixed by extending the
 *      closure-aliasing convention one level deeper: `flattenGroupLeaves`
 *      (generator/expression-gen.js) flattens a GROUP parameter into its own
 *      ordered list of elementary-child leaf descriptors (recursing into any
 *      nested group), and `generateRecursiveEntryMethod`/`generateCall`
 *      build ONE getter/setter closure pair PER LEAF - not per parameter -
 *      so every child of a GROUP LINKAGE parameter gets its own live,
 *      per-call-activation alias exactly like a scalar parameter already
 *      did, with zero changes needed anywhere else in the generator (a
 *      group's children are already flattened to their own named vars, the
 *      same as a WORKING-STORAGE group's own children).
 *
 *   2. `GO TO t1 OF s1, t2 OF s2, t3 OF s3 DEPENDING ON sel` (multiple
 *      comma-separated qualified targets) truncated to just the FIRST
 *      target: parseGoToStatement's target-collecting loop never listed
 *      TokenType.COMMA in its own continuation condition, so it stopped the
 *      instant it saw the separator after the first target, leaving every
 *      token from that comma onward completely unconsumed. Those leftover
 *      tokens corrupted the rest of the PROCEDURE DIVISION parse: the
 *      DEPENDING ON identifier itself was eventually reached as a bare
 *      token immediately followed by a period, satisfying isParagraphName's
 *      own pattern - silently splitting one paragraph into two, with the
 *      spurious second paragraph named after that identifier (a hard
 *      `Conflicting definitions` compile error when that identifier also
 *      names a LINKAGE/WORKING-STORAGE var). Fixed the same way round-7
 *      finding 1a fixed the identical bug class for CALL ... USING's own
 *      operand list: the loop now also matches/consumes TokenType.COMMA.
 *
 *   3. copybook-resolver.js's REPLACING clause capture
 *      (`(REPLACING\s+[\s\S]*?)?\.`) terminated at the FIRST literal `.` it
 *      found, even when that period was itself inside a quoted replacement
 *      literal (`BY =="IT""S COPY DONE."==` - the COBOL doubled-quote
 *      escape convention for an embedded literal quote) - silently
 *      truncating the REPLACING clause and dropping any pairs after it.
 *      Round-21 finding 1 only made the COPY-statement's own START
 *      detection quote-aware; the clause's own END never was. Fixed by
 *      restructuring COPY_HEADER_PATTERN to match only the statement's
 *      header (name + optional OF/IN library), then finding the clause's
 *      true end via a new quote-aware `findStatementEnd` (reusing
 *      findQuotedRanges/findCommentRanges - the first `.` NOT inside a
 *      quote or comment) instead of trying to encode "quote-aware,
 *      non-greedy, terminated by a real period" as a single regex.
 *
 *   4. `SET condition-name-1, condition-name-2 TO TRUE` (a comma-separated
 *      list of MULTIPLE condition-names in one SET) truncated to just the
 *      FIRST name for the identical reason as finding 2:
 *      parseSetStatement's target-collecting loop never listed
 *      TokenType.COMMA either. generateSet (generator/expression-gen.js)
 *      already iterated `statement.targets` independently for each one -
 *      it only ever needed this parser-side fix to see more than one target
 *      in the first place.
 *
 * See tests/oracle/README.md for the full end-to-end (cobc-vs-generated-
 * Scala) verification the promoted tests/corpus/proc/k01/k02/k03/k11
 * programs provide via the data-driven oracle suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertToScala } from '../index.js';
import { expandCopybooks } from '../parser/copybook-resolver.js';

function scalaOf(source, opts = {}) {
  return convertToScala(source, { generateMain: true, ...opts }).scala;
}

// ---------------------------------------------------------------------------
// Finding 1: a RECURSIVE program's GROUP LINKAGE parameter gets one
// getter/setter closure pair PER LEAF child, not the ordinary shared-var
// convention.
// ---------------------------------------------------------------------------

describe('round-22 finding 1: a RECURSIVE program\'s GROUP LINKAGE parameter is aliased per-CALL-activation, per leaf child', () => {
  const k01Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22RECMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DEPTH-GRP.
           05 WS-DEPTH PIC 9(2) VALUE 1.
           05 WS-TAG   PIC X(3) VALUE "TOP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T22RECSUB" USING WS-DEPTH-GRP.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22RECSUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 0.
       01 WS-NEXT-GRP.
           05 WS-NEXT     PIC 9(2).
           05 WS-NEXT-TAG PIC X(3).
       LINKAGE SECTION.
       01 LS-DEPTH-GRP.
           05 LS-DEPTH PIC 9(2).
           05 LS-TAG   PIC X(3).
       PROCEDURE DIVISION USING LS-DEPTH-GRP.
       MAIN-PARA.
           ADD 1 TO WS-N.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " TAG=" LS-TAG " WS-N=" WS-N.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               MOVE "SUB" TO WS-NEXT-TAG
               CALL "T22RECSUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " TAG=" LS-TAG " WS-N=" WS-N.
           GOBACK.
       END PROGRAM T22RECSUB.
       END PROGRAM T22RECMAIN.
`;

  test('entry() takes one getter/setter closure pair PER LEAF child, not one per whole-group parameter', () => {
    const scala = scalaOf(k01Shape);
    assert.match(
      scala,
      /def entry\(_get0: \(\) => Int = \(\) => 0, _set0: Int => Unit = \(_: Int\) => \(\), _get1: \(\) => String = \(\) => "", _set1: String => Unit = \(_: String\) => \(\)\): Unit =/
    );
    // Each child gets its own local getter/setter def pair, keyed by its own
    // camelCase name - not the group's own (nonexistent) flat var.
    assert.match(scala, /def lsDepth: Int = _get0\(\)/);
    assert.match(scala, /def lsDepth_=\(v: Int\): Unit = _set0\(v\)/);
    assert.match(scala, /def lsTag: String = _get1\(\)/);
    assert.match(scala, /def lsTag_=\(v: String\): Unit = _set1\(v\)/);
  });

  test('the self-recursive CALL site builds a live per-child getter/setter for a plain named GROUP argument, not a whole-group snapshot', () => {
    const scala = scalaOf(k01Shape);
    assert.match(
      scala,
      /T22recsub\.entry\(\(\) => wsNext, \(v: Int\) => wsNext = v, \(\) => wsNextTag, \(v: String\) => wsNextTag = v\)/
    );
  });

  test('the cross-program CALL into the RECURSIVE subprogram also aliases per child, not a whole-group value-in/tuple-out round trip', () => {
    const scala = scalaOf(k01Shape);
    assert.match(
      scala,
      /T22recsub\.entry\(\(\) => wsDepth, \(v: Int\) => wsDepth = v, \(\) => wsTag, \(v: String\) => wsTag = v\)/
    );
  });

  test('regression guard: a RECURSIVE program whose LINKAGE parameter is a plain scalar keeps round-21\'s own one-closure-pair-per-parameter shape', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22RECMAIN2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-D PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "T22RECSUB2" USING WS-D.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22RECSUB2 RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(2).
       LINKAGE SECTION.
       01 LS-DEPTH PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           DISPLAY LS-DEPTH.
           GOBACK.
       END PROGRAM T22RECSUB2.
       END PROGRAM T22RECMAIN2.
`;
    const scala = scalaOf(src);
    assert.match(
      scala,
      /def entry\(_get0: \(\) => Int = \(\) => 0, _set0: Int => Unit = \(_: Int\) => \(\)\): Unit =/
    );
    assert.doesNotMatch(scala, /_get1/);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: GO TO ... DEPENDING ON's own multi-target comma-separated list.
// ---------------------------------------------------------------------------

describe('round-22 finding 2: GO TO ... DEPENDING ON\'s own comma-separated multi-target list is parsed in full, with no paragraph-boundary corruption', () => {
  const k02Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22GODEPQSUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LS-SEL PIC 9.
       PROCEDURE DIVISION USING LS-SEL.
       0000-MAIN SECTION.
       0000-START.
           DISPLAY "SEL=" LS-SEL.
           GO TO 1000-PARA OF 2000-SECOND,
                 1000-PARA OF 3000-THIRD,
                 1000-PARA OF 4000-FOURTH
                 DEPENDING ON LS-SEL.
           DISPLAY "NO-MATCH-FALLTHROUGH".
           GOBACK.
       1000-PARA.
           DISPLAY "WRONG-1000-IN-MAIN-SECTION".
           GOBACK.
       2000-SECOND SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-SECOND".
           GOBACK.
       3000-THIRD SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-THIRD".
           GOBACK.
       4000-FOURTH SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-FOURTH".
           GOBACK.
       END PROGRAM T22GODEPQSUB.
`;

  test('every comma-separated qualified target is resolved, with no synthetic paragraph split off after the GO TO', () => {
    const scala = scalaOf(k02Shape);
    assert.match(scala, /case 1 => return secondPara\(\)/);
    assert.match(scala, /case 2 => return thirdPara\(\)/);
    assert.match(scala, /case 3 => return fourthPara\(\)/);
    // The statements physically after the GO TO must stay inside the SAME
    // paragraph (0000-START/start()) - not split into a spurious second
    // method named after the DEPENDING ON selector.
    assert.match(scala, /println\("NO-MATCH-FALLTHROUGH"\)/);
    // The LINKAGE parameter's own var must never collide with a spurious
    // paragraph method of the same name (the actual pre-fix compile error:
    // `Conflicting definitions: var lsSel ... and def lsSel(): Unit`).
    assert.doesNotMatch(scala, /def lsSel\(\)/);
    assert.match(scala, /var lsSel: Int/);
  });

  test('regression guard: a single, unqualified GO TO ... DEPENDING ON (no commas at all) is unaffected', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22GODEP1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SEL PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           GO TO PARA-A PARA-B DEPENDING ON WS-SEL.
           STOP RUN.
       PARA-A.
           DISPLAY "A".
           STOP RUN.
       PARA-B.
           DISPLAY "B".
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /case 1 => return paraA\(\)/);
    assert.match(scala, /case 2 => return paraB\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: COPY ... REPLACING's own clause-termination search is
// quote-aware, not just the COPY-statement's own START detection.
// ---------------------------------------------------------------------------

describe('round-22 finding 3: a COPY ... REPLACING clause is captured in full even when its own BY-text is a quoted literal containing an embedded period', () => {
  test('k03 shape: an embedded, doubled-quote-escaped period inside a REPLACING BY literal does not truncate the clause', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22QREPL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY OUTERCPY REPLACING ==:PFX:== BY ==REC1==
                     ==:QVAL:== BY =="IT""S COPY DONE."==.
       COPY DONE.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MSG=" REC1-MSG.
           DISPLAY "DECOY-IN-CPY=" REC1-DECOY.
           DISPLAY "DECOY=" DECOY-FIELD.
           STOP RUN.
`;
    const copybooks = {
      OUTERCPY:
        '       01 :PFX:-REC.\n' +
        '          05 :PFX:-MSG PIC X(20) VALUE :QVAL:.\n' +
        '          05 :PFX:-DECOY PIC X(20) VALUE "ANOTHER COPY DONE X".\n',
      DONE: '       01 DECOY-REC.\n          05 DECOY-FIELD PIC X(4) VALUE "OOPS".\n',
    };
    const { source, expanded, missing } = expandCopybooks(src, copybooks);
    assert.deepEqual(missing, []);
    assert.deepEqual(new Set(expanded), new Set(['OUTERCPY', 'DONE']));
    // The SECOND replacing pair (:QVAL: BY the quoted literal) must have
    // actually applied - not silently dropped because the first pair's own
    // embedded period was mistaken for the clause's true end.
    assert.match(source, /REC1-MSG PIC X\(20\) VALUE "IT""S COPY DONE\."/);
    // The decoy field physically AFTER the substituted token in the same
    // copybook body must still be recognized correctly too.
    assert.match(source, /REC1-DECOY PIC X\(20\) VALUE "ANOTHER COPY DONE X"/);
    // The real, unrelated top-level COPY DONE must still expand.
    assert.match(source, /DECOY-FIELD PIC X\(4\) VALUE "OOPS"/);
  });

  test('regression guard: an ordinary multi-pair REPLACING clause with no embedded-quote period still expands every pair', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22RG3.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY REC REPLACING ==:TAG:== BY ==CUST== ==:NUM:== BY ==7==.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY CUST-ID.
           STOP RUN.
`;
    const { source, expanded, missing } = expandCopybooks(src, {
      REC: '       01 :TAG:-REC.\n          05 :TAG:-ID PIC 9(4) VALUE :NUM:.\n',
    });
    assert.deepEqual(missing, []);
    assert.deepEqual(expanded, ['REC']);
    assert.match(source, /CUST-ID PIC 9\(4\) VALUE 7/);
  });
});

// ---------------------------------------------------------------------------
// Finding 4: SET's own comma-separated multi-condition-name list.
// ---------------------------------------------------------------------------

describe('round-22 finding 4: SET condition-name-1, condition-name-2 TO TRUE sets every listed condition-name, not just the first', () => {
  const k11Shape = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22SETMULTI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG-A PIC X VALUE "N".
           88 FLAG-A-ON VALUE "Y".
       01 WS-FLAG-B PIC X VALUE "N".
           88 FLAG-B-ON VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET FLAG-A-ON, FLAG-B-ON TO TRUE.
           STOP RUN.
`;

  test('both condition-names\' own parent fields are assigned their own respective VALUE', () => {
    const scala = scalaOf(k11Shape);
    assert.match(scala, /wsFlagA = "Y"/);
    assert.match(scala, /wsFlagB = "Y"/);
    // No leftover corrupted/unknown-statement marker from the comma being
    // left unconsumed.
    assert.doesNotMatch(scala, /unsupported statement type/);
  });

  test('regression guard: the single-condition-name form (round-1 finding 2) is unaffected', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22SET1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG PIC X VALUE "N".
           88 FLAG-ON VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET FLAG-ON TO TRUE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsFlag = "Y"/);
  });

  test('a three-way comma-separated SET ... TO TRUE list sets all three', () => {
    const src = `       IDENTIFICATION DIVISION.
       PROGRAM-ID. T22SET3.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-FLAG-A PIC X VALUE "N".
           88 FLAG-A-ON VALUE "Y".
       01 WS-FLAG-B PIC X VALUE "N".
           88 FLAG-B-ON VALUE "Y".
       01 WS-FLAG-C PIC X VALUE "N".
           88 FLAG-C-ON VALUE "Y".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET FLAG-A-ON, FLAG-B-ON, FLAG-C-ON TO TRUE.
           STOP RUN.
`;
    const scala = scalaOf(src);
    assert.match(scala, /wsFlagA = "Y"/);
    assert.match(scala, /wsFlagB = "Y"/);
    assert.match(scala, /wsFlagC = "Y"/);
  });
});
