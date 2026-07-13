       IDENTIFICATION DIVISION.
       PROGRAM-ID. G03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-IDXSRC       PIC X(10) VALUE "0000030000".
       01  WS-IDXNUM       PIC 9(1) VALUE 0.
       01  WS-TABLE.
           05  WS-ROW OCCURS 5 TIMES.
               10  WS-VAL   PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 111 TO WS-VAL(1).
           MOVE 222 TO WS-VAL(2).
           MOVE 333 TO WS-VAL(3).
           MOVE 444 TO WS-VAL(4).
           MOVE 555 TO WS-VAL(5).
           MOVE WS-IDXSRC(6:1) TO WS-IDXNUM.
           DISPLAY "IDX=" WS-IDXNUM.
           DISPLAY "VAL=" WS-VAL(WS-IDXNUM).
           STOP RUN.
