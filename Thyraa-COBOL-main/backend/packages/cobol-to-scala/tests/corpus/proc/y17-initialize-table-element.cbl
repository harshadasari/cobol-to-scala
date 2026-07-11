       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y17INITAB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 3 TIMES.
               10  WS-NAME    PIC X(6) VALUE "XXXXXX".
               10  WS-AMT     PIC 9(4) VALUE 9999.
       01  WS-I               PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAAA" TO WS-NAME(1).
           MOVE "BBBBBB" TO WS-NAME(2).
           MOVE "CCCCCC" TO WS-NAME(3).
           MOVE 111 TO WS-AMT(1).
           MOVE 222 TO WS-AMT(2).
           MOVE 333 TO WS-AMT(3).

           INITIALIZE WS-ENTRY(WS-I).

           DISPLAY "E1=" WS-NAME(1) "/" WS-AMT(1).
           DISPLAY "E2=" WS-NAME(2) "/" WS-AMT(2).
           DISPLAY "E3=" WS-NAME(3) "/" WS-AMT(3).
           STOP RUN.
