       IDENTIFICATION DIVISION.
       PROGRAM-ID. IFPERIOD2.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC S9(2) VALUE -1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           IF WS-X > 0
               DISPLAY "POS".
           DISPLAY "NEXT".
           DISPLAY "THIRD".
           STOP RUN.
