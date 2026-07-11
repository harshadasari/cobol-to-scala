       IDENTIFICATION DIVISION.
       PROGRAM-ID. P11SRCHALL.
      *
      * Phase 2 corpus target: SEARCH ALL (binary search) over a
      * table declared ASCENDING KEY, INDEXED BY. One search hits,
      * one misses.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FOUND-POS        PIC 9(2).
       01  WS-PROD-TABLE.
           05  WS-PROD-ENTRY   OCCURS 5 TIMES
                                   ASCENDING KEY IS WS-PROD-CODE
                                   INDEXED BY WS-PIDX.
               10  WS-PROD-CODE PIC 9(4).
               10  WS-PROD-NAME PIC X(10).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 1001 TO WS-PROD-CODE(1)
           MOVE 'BOLT' TO WS-PROD-NAME(1)
           MOVE 1002 TO WS-PROD-CODE(2)
           MOVE 'NUT' TO WS-PROD-NAME(2)
           MOVE 1003 TO WS-PROD-CODE(3)
           MOVE 'WASHER' TO WS-PROD-NAME(3)
           MOVE 1004 TO WS-PROD-CODE(4)
           MOVE 'SCREW' TO WS-PROD-NAME(4)
           MOVE 1005 TO WS-PROD-CODE(5)
           MOVE 'RIVET' TO WS-PROD-NAME(5)
      *
           SEARCH ALL WS-PROD-ENTRY
               AT END
                   DISPLAY 'SEARCH-1-RESULT=NOT-FOUND'
               WHEN WS-PROD-CODE(WS-PIDX) = 1003
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
           STOP RUN.
