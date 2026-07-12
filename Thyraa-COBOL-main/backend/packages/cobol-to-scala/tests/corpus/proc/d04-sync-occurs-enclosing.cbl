       IDENTIFICATION DIVISION.
       PROGRAM-ID. D04.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 2 TIMES.
               10  R-LEAD PIC X(1).
               10  R-NUM  PIC S9(4) COMP SYNC.
               10  R-TAIL PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "A" TO R-LEAD(1).
           MOVE 111 TO R-NUM(1).
           MOVE "B" TO R-TAIL(1).
           MOVE "C" TO R-LEAD(2).
           MOVE 222 TO R-NUM(2).
           MOVE "D" TO R-TAIL(2).
           DISPLAY "LEN=" FUNCTION LENGTH(WS-TABLE).
           DISPLAY "R1=" R-LEAD(1) " " R-NUM(1) " " R-TAIL(1).
           DISPLAY "R2=" R-LEAD(2) " " R-NUM(2) " " R-TAIL(2).
           STOP RUN.
