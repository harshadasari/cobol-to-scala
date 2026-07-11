       IDENTIFICATION DIVISION.
       PROGRAM-ID. N12BABBR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A           PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-A > 1 AND < 5
               DISPLAY "IN-RANGE"
           ELSE
               DISPLAY "OUT-RANGE"
           END-IF
           IF WS-A > 10 AND < 20
               DISPLAY "IN-RANGE2"
           ELSE
               DISPLAY "OUT-RANGE2"
           END-IF
           STOP RUN.
