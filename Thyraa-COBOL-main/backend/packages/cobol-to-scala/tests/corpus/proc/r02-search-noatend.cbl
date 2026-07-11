       IDENTIFICATION DIVISION.
       PROGRAM-ID. R02SRCH.
      *
      * Adversarial: SEARCH with the AT END phrase entirely absent
      * (only WHEN clauses). On a failed search, control must simply
      * fall through to the next sentence (no imperative fires), and
      * the index is left at its exhausted post-table position.
      * Also: SEARCH starting past the last occurrence (index already
      * beyond the table bound) - AT END must fire immediately without
      * evaluating any WHEN.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-MARKER           PIC X(10) VALUE 'UNTOUCHED'.
       01  WS-CODE-TABLE.
           05  WS-CODE-ENTRY   OCCURS 5 TIMES INDEXED BY WS-IDX.
               10  WS-CODE     PIC X(3).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 'AAA' TO WS-CODE(1)
           MOVE 'BBB' TO WS-CODE(2)
           MOVE 'CCC' TO WS-CODE(3)
           MOVE 'DDD' TO WS-CODE(4)
           MOVE 'EEE' TO WS-CODE(5)
      *
      *    No AT END phrase at all; target 'ZZZ' is not present, so
      *    the WHEN imperative must never execute and WS-MARKER must
      *    stay 'UNTOUCHED'. Execution just continues past END-SEARCH.
           SET WS-IDX TO 1
           SEARCH WS-CODE-ENTRY
               WHEN WS-CODE(WS-IDX) = 'ZZZ'
                   MOVE 'TOUCHED!!!' TO WS-MARKER
           END-SEARCH
           DISPLAY 'AFTER-NOATEND-MARKER=' WS-MARKER
           DISPLAY 'AFTER-NOATEND-IDX=' WS-IDX
      *
      *    Start already one past the last occurrence: AT END must
      *    fire immediately, no WHEN is ever evaluated.
           SET WS-IDX TO 6
           SEARCH WS-CODE-ENTRY
               AT END
                   DISPLAY 'PASTEND-RESULT=AT-END-FIRED'
               WHEN WS-CODE(WS-IDX) = 'AAA'
                   DISPLAY 'PASTEND-RESULT=WRONGLY-MATCHED'
           END-SEARCH
           STOP RUN.
