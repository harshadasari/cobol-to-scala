      * mm02 (round 37): pressure-test on round-36 finding 1 (ll01)'s
      * call-site-id fix for a call site appearing in TWO DIFFERENT
      * paragraphs of the SAME program (not duplicated within one
      * paragraph, ll01's own shape, and not the same site executed
      * repeatedly at runtime via a loop, ll14's own shape) - PARA-ONE and
      * PARA-TWO are each reached via an explicit out-of-line PERFORM, each
      * with its own textually identical-looking
      * `CALL "MM02SUB" USING BY CONTENT WS-VAL` statement - two separate
      * generated Scala methods, so no actual var-name collision is
      * EXPECTED (each method is its own scope), but this exercises the
      * call-site counter across a paragraph boundary rather than within
      * one flat statement list.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM02MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-VAL PIC 9(3) VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-ONE.
           PERFORM PARA-TWO.
           DISPLAY "MAIN AFTER VAL=" WS-VAL.
           STOP RUN.

       PARA-ONE.
           DISPLAY "PARA-ONE BEFORE VAL=" WS-VAL.
           CALL "MM02SUB" USING BY CONTENT WS-VAL.
           DISPLAY "PARA-ONE AFTER VAL=" WS-VAL.

       PARA-TWO.
           DISPLAY "PARA-TWO BEFORE VAL=" WS-VAL.
           CALL "MM02SUB" USING BY CONTENT WS-VAL.
           DISPLAY "PARA-TWO AFTER VAL=" WS-VAL.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM02SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(3).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-MAIN.
           ADD 1000 TO LK-VAL.
           DISPLAY "IN SUB VAL=" LK-VAL.
       END PROGRAM MM02SUB.

       END PROGRAM MM02MAIN.
