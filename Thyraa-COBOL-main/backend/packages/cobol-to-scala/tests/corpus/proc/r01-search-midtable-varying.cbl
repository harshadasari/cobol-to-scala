       IDENTIFICATION DIVISION.
       PROGRAM-ID. R01SRCH.
      *
      * Adversarial: SEARCH starting mid-table after SET to index 3
      * (must search FORWARD ONLY from current index, not the whole
      * table), and SEARCH ... VARYING another index-name declared on
      * the same table (must sync to the primary index start value and
      * increment in lockstep, regardless of its own prior value).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE-TABLE.
           05  WS-CODE-ENTRY   OCCURS 5 TIMES
                               INDEXED BY WS-IDX WS-IDX2.
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
      *    Part A: start search at index 3, target 'BBB' is BEHIND the
      *    start point - a correct forward-only search must NOT find
      *    it (AT END fires) even though 'BBB' exists in the table.
           SET WS-IDX TO 3
           SEARCH WS-CODE-ENTRY
               AT END
                   DISPLAY 'PART-A=NOT-FOUND'
               WHEN WS-CODE(WS-IDX) = 'BBB'
                   DISPLAY 'PART-A=FOUND-WRONGLY-AT-' WS-IDX
           END-SEARCH
      *
      *    Part B: start search at index 3, target 'DDD' is ahead of
      *    the start point - must be found at index 4.
           SET WS-IDX TO 3
           SEARCH WS-CODE-ENTRY
               AT END
                   DISPLAY 'PART-B=NOT-FOUND'
               WHEN WS-CODE(WS-IDX) = 'DDD'
                   DISPLAY 'PART-B=FOUND-AT-' WS-IDX
           END-SEARCH
      *
      *    Part C: VARYING another index-name (WS-IDX2, pre-set to a
      *    deliberately wrong value 99) - it must be resynced to
      *    WS-IDX's starting value (1) and then incremented in lockstep
      *    with WS-IDX for every search iteration.
           SET WS-IDX TO 1
           SET WS-IDX2 TO 99
           SEARCH WS-CODE-ENTRY VARYING WS-IDX2
               AT END
                   DISPLAY 'PART-C=NOT-FOUND'
               WHEN WS-CODE(WS-IDX) = 'CCC'
                   DISPLAY 'PART-C-IDX=' WS-IDX
                   DISPLAY 'PART-C-IDX2=' WS-IDX2
           END-SEARCH
           STOP RUN.
