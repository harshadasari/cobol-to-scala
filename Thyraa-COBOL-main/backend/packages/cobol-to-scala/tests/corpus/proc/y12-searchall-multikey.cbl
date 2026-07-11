       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y12SRCHALL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 5 TIMES
               ASCENDING KEY IS WS-K1 WS-K2
               INDEXED BY WS-IDX.
               10  WS-K1    PIC 9(2).
               10  WS-K2    PIC 9(2).
               10  WS-VAL   PIC X(6).
       01  WS-FOUND         PIC X(6) VALUE "NONE".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-K1(1). MOVE 1 TO WS-K2(1).
           MOVE "AAA" TO WS-VAL(1).
           MOVE 10 TO WS-K1(2). MOVE 2 TO WS-K2(2).
           MOVE "BBB" TO WS-VAL(2).
           MOVE 20 TO WS-K1(3). MOVE 1 TO WS-K2(3).
           MOVE "CCC" TO WS-VAL(3).
           MOVE 20 TO WS-K1(4). MOVE 2 TO WS-K2(4).
           MOVE "DDD" TO WS-VAL(4).
           MOVE 30 TO WS-K1(5). MOVE 1 TO WS-K2(5).
           MOVE "EEE" TO WS-VAL(5).

           SEARCH ALL WS-ENTRY
               WHEN WS-K1(WS-IDX) = 20 AND WS-K2(WS-IDX) = 2
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           DISPLAY "FOUND1=" WS-FOUND.

           MOVE "NONE" TO WS-FOUND.
           SEARCH ALL WS-ENTRY
               WHEN WS-K1(WS-IDX) = 10 AND WS-K2(WS-IDX) = 1
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           DISPLAY "FOUND2=" WS-FOUND.

           MOVE "NONE" TO WS-FOUND.
           SEARCH ALL WS-ENTRY
               WHEN WS-K1(WS-IDX) = 20 AND WS-K2(WS-IDX) = 9
                   MOVE WS-VAL(WS-IDX) TO WS-FOUND
           END-SEARCH.
           DISPLAY "FOUND3=" WS-FOUND.
           STOP RUN.
