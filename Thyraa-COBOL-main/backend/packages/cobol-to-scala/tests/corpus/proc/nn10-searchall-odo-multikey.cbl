      * nn10 (round 38): SEARCH ALL (binary search) over an OCCURS
      * DEPENDING ON table with a TWO-FIELD composite ASCENDING KEY,
      * where the runtime ODO count is set to a MIDDLE value (neither 0
      * nor the declared maximum) - y12/z01/z13 exercise multi-key
      * SEARCH ALL on a FIXED-size table; k08/k10 exercise ODO-bounded
      * SEARCH ALL/SEARCH but only with a SINGLE key and only the ZERO-
      * count edge. This crosses both: does the binary-search bound
      * correctly use the LIVE ODO count (not the static max) when the
      * comparator itself has to weigh two key fields per probe?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN10SEARCHODO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNT PIC 9 VALUE 4.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 1 TO 8 TIMES DEPENDING ON WS-COUNT
                   ASCENDING KEY IS WS-K1 WS-K2
                   INDEXED BY WS-IDX.
               10  WS-K1 PIC 9(2).
               10  WS-K2 PIC 9(2).
               10  WS-TAG PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-K1(1). MOVE 1 TO WS-K2(1).
           MOVE "A001" TO WS-TAG(1).
           MOVE 10 TO WS-K1(2). MOVE 5 TO WS-K2(2).
           MOVE "A005" TO WS-TAG(2).
           MOVE 20 TO WS-K1(3). MOVE 2 TO WS-K2(3).
           MOVE "B002" TO WS-TAG(3).
           MOVE 30 TO WS-K1(4). MOVE 9 TO WS-K2(4).
           MOVE "C009" TO WS-TAG(4).
      * beyond WS-COUNT=4 - must never be visited by SEARCH ALL
           MOVE 40 TO WS-K1(5). MOVE 1 TO WS-K2(5).
           MOVE "ZZZZ" TO WS-TAG(5).
           MOVE 99 TO WS-K1(6). MOVE 9 TO WS-K2(6).
           MOVE "ZZZZ" TO WS-TAG(6).

           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END DISPLAY "SEARCH1: NOT FOUND"
               WHEN WS-K1(WS-IDX) = 20 AND WS-K2(WS-IDX) = 2
                   DISPLAY "SEARCH1: FOUND TAG=" WS-TAG(WS-IDX)
                       " AT " WS-IDX
           END-SEARCH.

           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END DISPLAY "SEARCH2: NOT FOUND (BEYOND-COUNT KEY)"
               WHEN WS-K1(WS-IDX) = 40 AND WS-K2(WS-IDX) = 1
                   DISPLAY "SEARCH2: FOUND TAG=" WS-TAG(WS-IDX)
                       " AT " WS-IDX
           END-SEARCH.

           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END DISPLAY "SEARCH3: NOT FOUND"
               WHEN WS-K1(WS-IDX) = 10 AND WS-K2(WS-IDX) = 5
                   DISPLAY "SEARCH3: FOUND TAG=" WS-TAG(WS-IDX)
                       " AT " WS-IDX
           END-SEARCH.
           STOP RUN.
