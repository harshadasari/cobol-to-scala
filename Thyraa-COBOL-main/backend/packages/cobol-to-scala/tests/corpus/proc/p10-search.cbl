       IDENTIFICATION DIVISION.
       PROGRAM-ID. P10SEARCH.
      *
      * Phase 2 corpus target: linear SEARCH with AT END, over an
      * OCCURS ... INDEXED BY table. One search hits, one misses.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FOUND-POS        PIC 9(2).
       01  WS-CODE-TABLE.
           05  WS-CODE-ENTRY   OCCURS 5 TIMES INDEXED BY WS-IDX.
               10  WS-CODE     PIC X(3).
               10  WS-DESC     PIC X(10).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 'AAA' TO WS-CODE(1)
           MOVE 'WIDGET-A' TO WS-DESC(1)
           MOVE 'BBB' TO WS-CODE(2)
           MOVE 'WIDGET-B' TO WS-DESC(2)
           MOVE 'CCC' TO WS-CODE(3)
           MOVE 'WIDGET-C' TO WS-DESC(3)
           MOVE 'DDD' TO WS-CODE(4)
           MOVE 'WIDGET-D' TO WS-DESC(4)
           MOVE 'EEE' TO WS-CODE(5)
           MOVE 'WIDGET-E' TO WS-DESC(5)
      *
           SET WS-IDX TO 1
           SEARCH WS-CODE-ENTRY
               AT END
                   DISPLAY 'SEARCH-1-RESULT=NOT-FOUND'
               WHEN WS-CODE(WS-IDX) = 'CCC'
                   SET WS-FOUND-POS TO WS-IDX
                   DISPLAY 'SEARCH-1-RESULT=FOUND'
                   DISPLAY 'SEARCH-1-POS=' WS-FOUND-POS
                   DISPLAY 'SEARCH-1-DESC=' WS-DESC(WS-IDX)
           END-SEARCH
      *
           SET WS-IDX TO 1
           SEARCH WS-CODE-ENTRY
               AT END
                   DISPLAY 'SEARCH-2-RESULT=NOT-FOUND'
               WHEN WS-CODE(WS-IDX) = 'ZZZ'
                   SET WS-FOUND-POS TO WS-IDX
                   DISPLAY 'SEARCH-2-RESULT=FOUND'
           END-SEARCH
           STOP RUN.
