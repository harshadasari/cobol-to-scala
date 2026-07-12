       IDENTIFICATION DIVISION.
       PROGRAM-ID. E12.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-COUNT PIC 9(2) VALUE 4.
           05  WS-ROW OCCURS 1 TO 5 TIMES
                   DEPENDING ON WS-COUNT.
               10  R-CODE PIC X(2).
               10  R-NUM  PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO R-CODE(1). MOVE 111 TO R-NUM(1).
           MOVE "BB" TO R-CODE(2). MOVE 222 TO R-NUM(2).
           MOVE "CC" TO R-CODE(3). MOVE 333 TO R-NUM(3).
           MOVE "DD" TO R-CODE(4). MOVE 444 TO R-NUM(4).
           MOVE WS-ROW(1) TO WS-ROW(3).
           DISPLAY "R1=" R-CODE(1) " " R-NUM(1).
           DISPLAY "R2=" R-CODE(2) " " R-NUM(2).
           DISPLAY "R3=" R-CODE(3) " " R-NUM(3).
           DISPLAY "R4=" R-CODE(4) " " R-NUM(4).
           DISPLAY "COUNT=" WS-COUNT.
           STOP RUN.
