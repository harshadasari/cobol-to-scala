       IDENTIFICATION DIVISION.
       PROGRAM-ID. N04RELX.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A           PIC 9(3) VALUE 5.
       01 WS-B           PIC 9(3) VALUE 4.
       01 WS-C           PIC 9(3) VALUE 18.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-A * WS-B > WS-C
               DISPLAY "GREATER"
           ELSE
               DISPLAY "NOT-GREATER"
           END-IF
           IF WS-C < WS-A * WS-B
               DISPLAY "C-LESS"
           ELSE
               DISPLAY "C-NOT-LESS"
           END-IF
           STOP RUN.
