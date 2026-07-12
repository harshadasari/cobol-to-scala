       IDENTIFICATION DIVISION.
       PROGRAM-ID. E01.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-OUTER-TABLE.
           05  WS-OUTER OCCURS 2 TIMES.
               10  WS-MID OCCURS 2 TIMES.
                   15  M-LEAD PIC X(1).
                   15  M-NUM  PIC S9(4) COMP SYNC.
                   15  M-TAIL PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "A" TO M-LEAD(1,1).
           MOVE 111 TO M-NUM(1,1).
           MOVE "B" TO M-TAIL(1,1).
           MOVE "C" TO M-LEAD(1,2).
           MOVE 222 TO M-NUM(1,2).
           MOVE "D" TO M-TAIL(1,2).
           MOVE "E" TO M-LEAD(2,1).
           MOVE 333 TO M-NUM(2,1).
           MOVE "F" TO M-TAIL(2,1).
           MOVE "G" TO M-LEAD(2,2).
           MOVE 444 TO M-NUM(2,2).
           MOVE "H" TO M-TAIL(2,2).
           DISPLAY "LEN=" FUNCTION LENGTH(WS-OUTER-TABLE).
           DISPLAY "R11=" M-LEAD(1,1) " " M-NUM(1,1) " " M-TAIL(1,1).
           DISPLAY "R12=" M-LEAD(1,2) " " M-NUM(1,2) " " M-TAIL(1,2).
           DISPLAY "R21=" M-LEAD(2,1) " " M-NUM(2,1) " " M-TAIL(2,1).
           DISPLAY "R22=" M-LEAD(2,2) " " M-NUM(2,2) " " M-TAIL(2,2).
           STOP RUN.
