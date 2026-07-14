      * Adversarial (round 24): EVALUATE with a WHEN clause that itself
      * contains a NESTED EVALUATE reusing the SAME subject identifier as
      * the outer EVALUATE - never exercised by any prior corpus program
      * (nested EVALUATEs elsewhere always evaluate a DIFFERENT subject one
      * level in). Checks that the inner EVALUATE's own subject-capture
      * temp (if the generator introduces one) doesn't collide with or
      * shadow the outer one incorrectly when both read the exact same
      * variable.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M13EVALNESTSAME.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE WS-X
               WHEN 1
                   DISPLAY "OUTER-1"
               WHEN 2
                   EVALUATE WS-X
                       WHEN 1
                           DISPLAY "INNER-1"
                       WHEN 2
                           DISPLAY "INNER-2"
                       WHEN OTHER
                           DISPLAY "INNER-OTHER"
                   END-EVALUATE
                   DISPLAY "OUTER-2-DONE"
               WHEN OTHER
                   DISPLAY "OUTER-OTHER"
           END-EVALUATE.
           MOVE 1 TO WS-X.
           EVALUATE WS-X
               WHEN 2
                   DISPLAY "OUTER-1-UNREACHED"
               WHEN 1
                   EVALUATE WS-X
                       WHEN 1
                           DISPLAY "SECOND-INNER-1"
                       WHEN OTHER
                           DISPLAY "SECOND-INNER-OTHER"
                   END-EVALUATE
                   DISPLAY "SECOND-OUTER-DONE"
           END-EVALUATE.
           STOP RUN.
