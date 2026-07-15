      * ee11: SEARCH ALL (binary search) over a table whose own ASCENDING
      * KEY is a COMP-1 (float) field - generateSearchAll's binary-search
      * codegen uses generic ==/< comparisons that should compile fine
      * for a Float key, but this has never been oracle-verified: every
      * prior SEARCH ALL corpus program uses an integer or alphanumeric
      * key.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE11SRCHCOMP1.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ROW OCCURS 5 TIMES
               ASCENDING KEY WS-KEY
               INDEXED BY WS-IDX.
               10  WS-KEY   COMP-1.
               10  WS-TAG   PIC X(4).
       01  WS-I         PIC 9 VALUE 1.
       01  WS-TARGET    COMP-1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1.5  TO WS-KEY(1).
           MOVE "AAA " TO WS-TAG(1).
           MOVE 2.25 TO WS-KEY(2).
           MOVE "BBB " TO WS-TAG(2).
           MOVE 3.75 TO WS-KEY(3).
           MOVE "CCC " TO WS-TAG(3).
           MOVE 5.0  TO WS-KEY(4).
           MOVE "DDD " TO WS-TAG(4).
           MOVE 9.25 TO WS-KEY(5).
           MOVE "EEE " TO WS-TAG(5).

           MOVE 3.75 TO WS-TARGET.
           SEARCH ALL WS-ROW
               AT END DISPLAY "NOT FOUND 3.75"
               WHEN WS-KEY(WS-IDX) = WS-TARGET
                   DISPLAY "FOUND IDX=" WS-IDX " TAG=" WS-TAG(WS-IDX)
           END-SEARCH.

           MOVE 4.0 TO WS-TARGET.
           SEARCH ALL WS-ROW
               AT END DISPLAY "NOT FOUND 4.0"
               WHEN WS-KEY(WS-IDX) = WS-TARGET
                   DISPLAY "FOUND IDX=" WS-IDX " TAG=" WS-TAG(WS-IDX)
           END-SEARCH.

           MOVE 9.25 TO WS-TARGET.
           SEARCH ALL WS-ROW
               AT END DISPLAY "NOT FOUND 9.25"
               WHEN WS-KEY(WS-IDX) = WS-TARGET
                   DISPLAY "FOUND IDX=" WS-IDX " TAG=" WS-TAG(WS-IDX)
           END-SEARCH.
           STOP RUN.
