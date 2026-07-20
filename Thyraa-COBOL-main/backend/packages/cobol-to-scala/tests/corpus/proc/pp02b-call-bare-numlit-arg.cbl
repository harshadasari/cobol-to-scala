      * pp02b (round 40): isolation follow-up for pp02's own finding - a
      * MINIMAL, non-RECURSIVE, non-subscripted repro. Direct AST inspection
      * of pp02's parse (parseCallStatement, parser/procedure-parser.js)
      * found that stmt.using ends up with only ONE entry where the source
      * has TWO USING operands - the second, a bare NUMERIC LITERAL
      * following an identifier operand, is silently dropped. Root cause:
      * the USING-loop's own continuation condition (the `while` guard just
      * inside `if (ctx.matchValue('USING'))`) lists TokenType.IDENTIFIER,
      * STRING_LITERAL, BY/REFERENCE/CONTENT/VALUE, OMITTED, and COMMA - but
      * NOT a bare numeric literal token - so the loop exits the instant it
      * sees one, leaving it (and the statement's own terminating period)
      * completely unconsumed, corrupting whatever parses next (the same
      * failure mode as round-7 finding 1a's comma bug and round-39 finding
      * 5's YYYYMMDD bug: an unconsumed token silently misparses downstream
      * structure, not just a wrong value). This probe is the simplest
      * possible case: one identifier operand, one bare numeric literal
      * operand, into an ordinary (non-RECURSIVE) subprogram, with a THIRD
      * statement afterward in the same paragraph to directly expose any
      * structural corruption.
      *
      * OUTCOME (DISHONEST - confirmed root cause, though NOT a clean
      * byte-diff oracle for it - see below). Real cobc: "IN SUB B="
      * (blank) / "A=010" / "MAIN-CONTINUES" - THIS installed GnuCOBOL
      * build has its own SEPARATE, unrelated quirk (documented in round
      * 39's oo03 finding write-up) that corrupts ANY bare numeric literal
      * passed as a CALL...USING argument to a blank value, so even a
      * hypothetically-fixed engine could never byte-match THIS cobc
      * capture for a literal argument. But the engine's OWN independent
      * bug is real and separately confirmed: it prints "IN SUB B=000"
      * (LK-B silently defaults to its zero-value, since `stmt.using` only
      * has ONE entry for a 2-parameter CALL) rather than "B=005" (what
      * any correctly-parsing COBOL engine would compute from a truly
      * fixed parser) - two different flavors of "wrong", confirming via
      * direct AST inspection (not just output comparison) that this is a
      * genuine, distinct PARSER gap: `parseCallStatement`'s USING-loop
      * continuation condition (parser/procedure-parser.js, the `while`
      * guard right after `if (ctx.matchValue('USING'))`) never lists
      * TokenType.NUMERIC_LITERAL alongside TokenType.IDENTIFIER/
      * STRING_LITERAL/BY/REFERENCE/CONTENT/VALUE/OMITTED/COMMA - so the
      * loop exits (and leaves the literal + terminating period
      * unconsumed) the instant a bare numeric literal operand is next.
      * Suggested fix: add `ctx.check(TokenType.NUMERIC_LITERAL)` to that
      * continuation condition, mirroring how STRING_LITERAL is already
      * handled there.
      *
      * MAIN-CONTINUES still prints correctly in both this probe's cobc
      * AND Scala output, so (unlike round-39 finding 5's YYYYMMDD bug)
      * this specific shape's structural fallout is contained to a stray,
      * harmless no-op/UnknownStatement rather than corrupting paragraph
      * boundaries - but that is very likely shape-dependent (an
      * unconsumed numeric-literal-then-period pair landing right before
      * a bare identifier could plausibly misparse as a new paragraph
      * name, the same way round-39 finding 5's stray token did) and
      * should not be assumed safe in general without the real fix above.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP02BMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC 9(3) VALUE 10.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "PP02BSUB" USING WS-A 5.
           DISPLAY "A=" WS-A.
           DISPLAY "MAIN-CONTINUES".
           STOP RUN.
       END PROGRAM PP02BMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP02BSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-A PIC 9(3).
       01  LK-B PIC 9(3).
       PROCEDURE DIVISION USING LK-A LK-B.
           DISPLAY "IN SUB B=" LK-B.
           ADD LK-B TO LK-A.
           GOBACK.
       END PROGRAM PP02BSUB.
