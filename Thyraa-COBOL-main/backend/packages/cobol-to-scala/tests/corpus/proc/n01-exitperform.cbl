       IDENTIFICATION DIVISION.
       PROGRAM-ID. N01EXITP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I           PIC 9(2) VALUE 0.
       01 WS-SUM         PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM UNTIL WS-I >= 10
               ADD 1 TO WS-I
               IF WS-I = 5
                   EXIT PERFORM
               END-IF
               ADD WS-I TO WS-SUM
           END-PERFORM
           DISPLAY "WS-I=" WS-I
           DISPLAY "WS-SUM=" WS-SUM
           DISPLAY "AFTER-LOOP-RAN"
           STOP RUN.
