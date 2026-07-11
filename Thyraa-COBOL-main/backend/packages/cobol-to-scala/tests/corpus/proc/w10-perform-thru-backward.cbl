       IDENTIFICATION DIVISION.
       PROGRAM-ID. W10.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-COUNT  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM PARA-C THRU PARA-A.
           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.
       PARA-A.
           ADD 1 TO WS-COUNT.
           DISPLAY "IN-PARA-A".
       PARA-B.
           ADD 10 TO WS-COUNT.
           DISPLAY "IN-PARA-B".
       PARA-C.
           ADD 100 TO WS-COUNT.
           DISPLAY "IN-PARA-C".
