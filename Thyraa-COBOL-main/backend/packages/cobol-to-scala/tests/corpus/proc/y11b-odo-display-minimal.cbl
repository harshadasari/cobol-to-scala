       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y11BMIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-COUNT     PIC 9 VALUE 3.
           05  WS-ELEM      PIC 9 OCCURS 1 TO 5 TIMES
                            DEPENDING ON WS-COUNT.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1 TO WS-ELEM(1).
           MOVE 2 TO WS-ELEM(2).
           MOVE 3 TO WS-ELEM(3).
           DISPLAY "GROUP=[" WS-REC "]".
           STOP RUN.
