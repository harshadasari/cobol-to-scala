      * Adversarial (round 23): every corpus EVALUATE ... WHEN x THRU y
      * program to date ranges over a NUMERIC subject. This uses an
      * ALPHANUMERIC subject (WS-CODE, PIC X) instead - COBOL's THRU
      * range comparison on an alphanumeric operand is a lexicographic
      * (collating-sequence) bound check, not an arithmetic one, a
      * genuinely different comparison codepath than the numeric case
      * every prior EVALUATE-range corpus program already exercises.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L09EVALTHRU.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-CODE PIC X.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "A" TO WS-CODE.
           PERFORM CHECK-CODE.
           MOVE "C" TO WS-CODE.
           PERFORM CHECK-CODE.
           MOVE "E" TO WS-CODE.
           PERFORM CHECK-CODE.
           MOVE "F" TO WS-CODE.
           PERFORM CHECK-CODE.
           MOVE "H" TO WS-CODE.
           PERFORM CHECK-CODE.
           MOVE "Z" TO WS-CODE.
           PERFORM CHECK-CODE.
           STOP RUN.
       CHECK-CODE.
           EVALUATE WS-CODE
               WHEN "A" THRU "E"
                   DISPLAY "CODE=" WS-CODE " RANGE=A-E"
               WHEN "F" THRU "J"
                   DISPLAY "CODE=" WS-CODE " RANGE=F-J"
               WHEN OTHER
                   DISPLAY "CODE=" WS-CODE " RANGE=OTHER"
           END-EVALUATE.
