       IDENTIFICATION DIVISION.
       PROGRAM-ID. N01BNEST.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-OUTER       PIC 9(2) VALUE 0.
       01 WS-INNER       PIC 9(2) VALUE 0.
       01 WS-TOTAL       PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM UNTIL WS-OUTER >= 3
               ADD 1 TO WS-OUTER
               MOVE 0 TO WS-INNER
               PERFORM UNTIL WS-INNER >= 10
                   ADD 1 TO WS-INNER
                   IF WS-INNER = 4
                       EXIT PERFORM
                   END-IF
                   ADD 1 TO WS-TOTAL
               END-PERFORM
               DISPLAY "OUTER=" WS-OUTER " INNER=" WS-INNER
           END-PERFORM
           DISPLAY "TOTAL=" WS-TOTAL
           STOP RUN.
