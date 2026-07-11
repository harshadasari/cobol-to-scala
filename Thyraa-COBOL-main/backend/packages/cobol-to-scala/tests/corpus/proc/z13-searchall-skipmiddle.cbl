       IDENTIFICATION DIVISION.
       PROGRAM-ID. SKIPMID.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 4 TIMES
               ASCENDING KEY IS WS-K1 WS-K2 WS-K3
               INDEXED BY WS-IDX.
               10  WS-K1 PIC 9(2).
               10  WS-K2 PIC 9(2).
               10  WS-K3 PIC 9(2).
               10  WS-VAL PIC X(3).
       01  WS-FOUND PIC X(3) VALUE "NONE".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-K1(1). MOVE 1 TO WS-K2(1). MOVE 5 TO WS-K3(1).
           MOVE "AAA" TO WS-VAL(1).
           MOVE 10 TO WS-K1(2). MOVE 2 TO WS-K2(2). MOVE 5 TO WS-K3(2).
           MOVE "BBB" TO WS-VAL(2).
           MOVE 10 TO WS-K1(3). MOVE 2 TO WS-K2(3). MOVE 9 TO WS-K3(3).
           MOVE "CCC" TO WS-VAL(3).
           MOVE 20 TO WS-K1(4). MOVE 1 TO WS-K2(4). MOVE 1 TO WS-K3(4).
           MOVE "DDD" TO WS-VAL(4).

           SEARCH ALL WS-ENTRY
               AT END MOVE "NONE" TO WS-FOUND
               WHEN WS-K1(WS-IDX) = 10 AND WS-K3(WS-IDX) = 9
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           DISPLAY "SKIPMID=" WS-FOUND.
           STOP RUN.
