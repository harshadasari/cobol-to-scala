      * pp14b (round 40): isolation follow-up for pp14's own finding. pp14
      * calls an UNRESOLVABLE program name (not declared anywhere in the
      * source), which hits the ALREADY-documented, already-honest round-7
      * finding 1c decline (a visible "external subprogram not available
      * for conversion" TODO comment) for the CALL itself - muddying
      * whether the separate ON EXCEPTION/NOT ON EXCEPTION clause-drop is
      * its own distinct gap. This probe calls a program that DOES exist
      * in-source (fully resolvable, ordinary CALL - ends normally, no
      * exception condition at all) with a NOT ON EXCEPTION clause that
      * real cobc fires on every ordinary successful CALL. Since
      * generateCall never references statement.onException/
      * notOnException anywhere (confirmed by direct grep), this checks
      * whether the NOT ON EXCEPTION block is silently dropped with NO
      * marker at all even on the plain, resolvable, successful-call path
      * - a cleaner, more universal case than pp14's own unresolvable-
      * target shape.
      *
      * OUTCOME (HONEST - byte-match, and a useful negative result):
      * real cobc does NOT fire "CALL-SUCCEEDED-AS-EXPECTED" either - this
      * GnuCOBOL build appears to skip its CALL-exception-condition
      * machinery entirely for an ordinary static (literal, resolvable)
      * CALL, only engaging it (per pp14's own evidence) when the literal
      * name can't be resolved at all. So even though generateCall never
      * implements onException/notOnException codegen at all (confirmed
      * by grep), that gap causes NO observable divergence in either shape
      * tested this round - a real, if narrow, generator gap that happens
      * to be unreachable given how this specific cobc build actually
      * dispatches CALL exceptions. Left undocumented as a "known gap"
      * since no corpus program yet demonstrates it producing a wrong
      * answer against real cobc.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP14BMAIN.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-CALL".
           CALL "PP14BSUB"
               ON EXCEPTION
                   DISPLAY "CALL-FAILED-UNEXPECTED"
               NOT ON EXCEPTION
                   DISPLAY "CALL-SUCCEEDED-AS-EXPECTED"
           END-CALL.
           DISPLAY "AFTER-CALL".
           STOP RUN.
       END PROGRAM PP14BMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP14BSUB.
       PROCEDURE DIVISION.
           DISPLAY "IN SUB".
           GOBACK.
       END PROGRAM PP14BSUB.
