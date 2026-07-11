       IDENTIFICATION DIVISION.
       PROGRAM-ID. W05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-TABLE.
           05 WS-ROW OCCURS 3 TIMES.
               10 WS-A PIC X(3).
               10 WS-B PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-A(1).
           MOVE 111 TO WS-B(1).
           MOVE "BBB" TO WS-A(2).
           MOVE 222 TO WS-B(2).
           MOVE WS-ROW(1) TO WS-ROW(3).
           DISPLAY "ROW3-A=" WS-A(3) " ROW3-B=" WS-B(3).
           MOVE WS-ROW(2) TO WS-ROW(1).
           DISPLAY "ROW1-A=" WS-A(1) " ROW1-B=" WS-B(1).
           STOP RUN.
