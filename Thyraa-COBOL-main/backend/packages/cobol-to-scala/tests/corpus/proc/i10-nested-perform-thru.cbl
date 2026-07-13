       IDENTIFICATION DIVISION.
       PROGRAM-ID. I10NESTTHRU.
      *
      * Adversarial (round 20): deeply nested PERFORM ... THRU ranges -
      * PARA-A performs PARA-B THRU PARA-C, and PARA-B (the FIRST
      * paragraph physically inside that B..C range) itself issues a
      * NESTED PERFORM PARA-D THRU PARA-E, where D and E are ALSO
      * physically located inside the outer B..C range. Confirmed
      * against installed GnuCOBOL: D and E each run TWICE - once via
      * the explicit inner PERFORM call from within B, and once more
      * via the outer range's own ordinary paragraph-to-paragraph
      * fallthrough (B falls through into D, D into E, E into C) once
      * the inner PERFORM returns and B's own body ends - a genuinely
      * tricky double-execution no prior corpus program's THRU nesting
      * combines this way.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-D-COUNT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       PARA-A.
           DISPLAY "IN-A-BEFORE".
           PERFORM PARA-B THRU PARA-C.
           DISPLAY "IN-A-AFTER".
           STOP RUN.
       PARA-B.
           DISPLAY "IN-B".
           PERFORM PARA-D THRU PARA-E.
       PARA-D.
           DISPLAY "IN-D".
           ADD 1 TO WS-D-COUNT.
           DISPLAY "D-COUNT=" WS-D-COUNT.
       PARA-E.
           DISPLAY "IN-E".
       PARA-C.
           DISPLAY "IN-C".
