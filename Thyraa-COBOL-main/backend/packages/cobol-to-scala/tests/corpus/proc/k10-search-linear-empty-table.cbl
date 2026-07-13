      * Adversarial (round 22): plain (linear) SEARCH - not SEARCH ALL
      * (k08's binary-search variant) - against a table whose runtime
      * OCCURS DEPENDING ON count is ZERO. The AT END branch must fire
      * on the very first SEARCH advance, with no WHEN condition ever
      * evaluated.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K10SEARCHLINEMPTY.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-COUNT PIC 9 VALUE 0.
       01 WS-TABLE.
           05 WS-ENTRY OCCURS 0 TO 5 TIMES DEPENDING ON WS-COUNT
                       INDEXED BY WS-IDX.
               10 WS-VAL PIC 9(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           SET WS-IDX TO 1.
           SEARCH WS-ENTRY
               AT END
                   DISPLAY "LINEAR-SEARCH-EMPTY-AT-END"
               WHEN WS-VAL(WS-IDX) = 5
                   DISPLAY "FOUND-UNEXPECTED"
           END-SEARCH.
           STOP RUN.
