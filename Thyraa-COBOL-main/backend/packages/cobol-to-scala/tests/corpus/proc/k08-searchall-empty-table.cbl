      * Adversarial (round 22): SEARCH ALL (binary search) against a
      * table whose runtime OCCURS DEPENDING ON count is ZERO - no prior
      * corpus SEARCH ALL program (y12, z01, z13, e09, etc.) ever
      * exercises a completely empty table. The AT END branch must fire
      * immediately; the WHEN condition must never evaluate against any
      * (nonexistent) element.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K08SEARCHALLEMPTY.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-COUNT PIC 9 VALUE 0.
       01 WS-TABLE.
           05 WS-ENTRY OCCURS 0 TO 5 TIMES DEPENDING ON WS-COUNT
                       ASCENDING KEY IS WS-KEY INDEXED BY WS-IDX.
               10 WS-KEY PIC 9(3).
               10 WS-VAL PIC X(5).
       01 WS-FOUND PIC X(3) VALUE "NO".
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET WS-IDX TO 1.
           SEARCH ALL WS-ENTRY
               AT END
                   DISPLAY "NOT-FOUND-EMPTY-TABLE"
               WHEN WS-KEY(WS-IDX) = 100
                   MOVE "YES" TO WS-FOUND
                   DISPLAY "FOUND-UNEXPECTED"
           END-SEARCH.
           DISPLAY "FOUND=" WS-FOUND.
           STOP RUN.
