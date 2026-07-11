       IDENTIFICATION DIVISION.
       PROGRAM-ID. R03SRCHD.
      *
      * Adversarial: SEARCH ALL (binary search) over a table declared
      * DESCENDING KEY. The table must be populated in actual
      * descending order for SEARCH ALL to behave per the standard;
      * a naive port that always assumes ascending-order binary search
      * will diverge here.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FOUND-POS        PIC 9(2).
       01  WS-PROD-TABLE.
           05  WS-PROD-ENTRY   OCCURS 5 TIMES
                                   DESCENDING KEY IS WS-PROD-CODE
                                   INDEXED BY WS-PIDX.
               10  WS-PROD-CODE PIC 9(4).
               10  WS-PROD-NAME PIC X(10).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 5000 TO WS-PROD-CODE(1)
           MOVE 'RIVET' TO WS-PROD-NAME(1)
           MOVE 4000 TO WS-PROD-CODE(2)
           MOVE 'SCREW' TO WS-PROD-NAME(2)
           MOVE 3000 TO WS-PROD-CODE(3)
           MOVE 'WASHER' TO WS-PROD-NAME(3)
           MOVE 2000 TO WS-PROD-CODE(4)
           MOVE 'NUT' TO WS-PROD-NAME(4)
           MOVE 1000 TO WS-PROD-CODE(5)
           MOVE 'BOLT' TO WS-PROD-NAME(5)
      *
           SEARCH ALL WS-PROD-ENTRY
               AT END
                   DISPLAY 'SEARCH-1-RESULT=NOT-FOUND'
               WHEN WS-PROD-CODE(WS-PIDX) = 3000
                   SET WS-FOUND-POS TO WS-PIDX
                   DISPLAY 'SEARCH-1-RESULT=FOUND'
                   DISPLAY 'SEARCH-1-POS=' WS-FOUND-POS
                   DISPLAY 'SEARCH-1-NAME=' WS-PROD-NAME(WS-PIDX)
           END-SEARCH
      *
           SEARCH ALL WS-PROD-ENTRY
               AT END
                   DISPLAY 'SEARCH-2-RESULT=NOT-FOUND'
               WHEN WS-PROD-CODE(WS-PIDX) = 9999
                   SET WS-FOUND-POS TO WS-PIDX
                   DISPLAY 'SEARCH-2-RESULT=FOUND'
           END-SEARCH
      *
      *    Boundary values: smallest key (last in descending order)
      *    and largest key (first in descending order).
           SEARCH ALL WS-PROD-ENTRY
               AT END
                   DISPLAY 'SEARCH-3-RESULT=NOT-FOUND'
               WHEN WS-PROD-CODE(WS-PIDX) = 1000
                   SET WS-FOUND-POS TO WS-PIDX
                   DISPLAY 'SEARCH-3-RESULT=FOUND'
                   DISPLAY 'SEARCH-3-POS=' WS-FOUND-POS
           END-SEARCH
           STOP RUN.
