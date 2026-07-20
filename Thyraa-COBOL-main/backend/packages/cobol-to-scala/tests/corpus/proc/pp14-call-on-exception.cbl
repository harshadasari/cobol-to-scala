      * pp14 (round 40): fresh-territory probe - CALL ... ON EXCEPTION /
      * NOT ON EXCEPTION. parseCallStatement (parser/procedure-parser.js)
      * parses both clauses into stmt.onException/stmt.notOnException, but
      * a direct grep of generator/expression-gen.js finds ZERO references
      * to either field anywhere in generateCall - the clauses are parsed
      * (so they don't corrupt the token stream) but their statement blocks
      * appear to be silently dropped at codegen. This probe calls a
      * literal program name that is never linked/defined anywhere in this
      * source (real cobc's dynamic call resolution should raise the CALL
      * exception condition and run the ON EXCEPTION block instead of
      * aborting), to check whether the generated Scala does the same or
      * silently produces no output for that branch at all.
      *
      * OUTCOME (HONEST - restates an already-accepted gap, not new):
      * cobc's own output here is itself a bit surprising - it prints
      * BOTH "CALL-FAILED-AS-EXPECTED" (ON EXCEPTION) AND
      * "CALL-SUCCEEDED-UNEXPECTED" (NOT ON EXCEPTION), which is not
      * standard "exactly one fires" COBOL semantics; see pp14b for
      * evidence this specific GnuCOBOL build appears to only run its
      * CALL-exception machinery at all for a literal name it can't
      * resolve even dynamically, and may double-dispatch in that narrow
      * case - a toolchain quirk, not a portable spec to match. On the
      * engine side: "PP14NOSUCHPROG" is unresolvable in this source, so
      * the WHOLE CALL statement (onException/notOnException included)
      * hits the ALREADY-documented, already-visible round-7 finding 1c
      * decline ("external subprogram not available for conversion" -
      * see the compiled TODO comment in the Scala output) - not a new,
      * undocumented gap. See pp14b for a cleaner isolation of whether
      * onException/notOnException codegen (confirmed via grep to not
      * exist at all in generateCall) causes any OTHER, distinguishable
      * divergence outside that already-accepted decline.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP14EXC.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-CALL".
           CALL "PP14NOSUCHPROG"
               ON EXCEPTION
                   DISPLAY "CALL-FAILED-AS-EXPECTED"
               NOT ON EXCEPTION
                   DISPLAY "CALL-SUCCEEDED-UNEXPECTED"
           END-CALL.
           DISPLAY "AFTER-CALL".
           STOP RUN.
