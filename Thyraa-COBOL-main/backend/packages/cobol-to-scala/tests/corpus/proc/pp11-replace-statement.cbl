      * pp11 (round 40): fresh-territory probe - the REPLACE statement
      * (source-text pseudo-text substitution, a compile-time directive
      * distinct from COPY ... REPLACING, which this engine's copybook-
      * resolver already supports). Neither the lexer nor parser appears to
      * have any REPLACE-specific handling at all (no REPLACE token, no
      * "REPLACING" reference outside copybook-resolver.js). This checks
      * whether an unsupported REPLACE directive fails cleanly (a visible
      * conversion error/honest decline) or silently misparses, producing
      * wrong Scala that still "compiles and runs".
      *
      * OUTCOME (DISHONEST - silent wrong output, no marker at all): cobc
      * performs the substitution correctly: `NUM=00099` then `NUM=00100`
      * (PIC 9(5), VALUE 99, +1). The engine's generated Scala compiles
      * and runs cleanly but silently produces `NUM=0` then `NUM=1` - it
      * never performs the REPLACE substitution at all, and there is NO
      * TODO/decline marker anywhere warning that REPLACE was ignored.
      * Direct token inspection shows why: the lexer treats `REPLACE` as
      * a plain IDENTIFIER (no dedicated token type at all, unlike
      * TokenType.CONVERTING etc.), and the pseudo-text delimiters `==`
      * plus the `:WIDTH:`/`:INIT:` markers are tokenized as bare
      * identifiers ("WIDTH", "INIT" - the colons are dropped as
      * insignificant, not treated as part of the identifier). Since
      * nothing in parser/index.js's `parseIdentificationDivision` (which
      * scans the region between PROGRAM-ID and DATA DIVISION) recognizes
      * any of this, the entire REPLACE line is silently skipped as an
      * unrecognized clause, and the DATA DIVISION parser then meets a
      * literal `PIC 9(WIDTH)` / `VALUE INIT` - a bare identifier where a
      * numeric literal is expected - and evidently falls back to
      * defaults (PIC 9(1), VALUE 0) with no error surfaced anywhere.
      * Suggested fix: implement REPLACE as a genuine pre-parse, source-
      * text pseudo-text substitution pass (mirroring how COPY REPLACING
      * already works in parser/copybook-resolver.js, but operating on
      * the whole source rather than a copybook), or, as a minimum-effort
      * stopgap, detect an unrecognized REPLACE directive and raise a
      * visible, compiling TODO/conversion-error instead of silently
      * falling through to corrupted PIC/VALUE clauses.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP11REPLACE.
       REPLACE ==:WIDTH:== BY ==5== ==:INIT:== BY ==99==.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NUM PIC 9(:WIDTH:) VALUE :INIT:.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "NUM=" WS-NUM.
           ADD 1 TO WS-NUM.
           DISPLAY "NUM=" WS-NUM.
           STOP RUN.
