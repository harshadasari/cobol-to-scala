       IDENTIFICATION DIVISION.
       PROGRAM-ID. N12ABBR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A           PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-A = 1 OR 2 OR 3
               DISPLAY "MATCH-123"
           ELSE
               DISPLAY "NO-MATCH-123"
           END-IF
           IF WS-A = 5 OR 6
               DISPLAY "MATCH-56"
           ELSE
               DISPLAY "NO-MATCH-56"
           END-IF
           STOP RUN.
