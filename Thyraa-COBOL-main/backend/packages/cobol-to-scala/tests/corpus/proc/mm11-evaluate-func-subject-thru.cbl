      * mm11 (round 37): fresh-territory probe - EVALUATE whose SUBJECT is
      * itself a FUNCTION call (FUNCTION MOD(WS-N * 7, 10)), with WHEN
      * clauses using range (THRU) comparisons rather than single values -
      * confirms the subject expression is evaluated once (not
      * re-evaluated per WHEN, and not corrupted by round-36's nested-
      * FUNCTION-argument parsing change) and that THRU-range matching
      * against a FUNCTION-call subject works across several values.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM11.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-N PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-N FROM 1 BY 1 UNTIL WS-N > 5
               EVALUATE FUNCTION MOD(WS-N * 7, 10)
                   WHEN 0 THRU 3
                       DISPLAY "N=" WS-N " LOW"
                   WHEN 4 THRU 6
                       DISPLAY "N=" WS-N " MID"
                   WHEN 7 THRU 9
                       DISPLAY "N=" WS-N " HIGH"
                   WHEN OTHER
                       DISPLAY "N=" WS-N " OTHER"
               END-EVALUATE
           END-PERFORM.
           STOP RUN.
