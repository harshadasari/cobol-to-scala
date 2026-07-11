       IDENTIFICATION DIVISION.
       PROGRAM-ID. R04SRCHDU.
      *
      * Adversarial: SEARCH ALL (binary search) where the ASCENDING
      * KEY value is repeated across several entries. The standard
      * does not guarantee which matching entry is returned, but a
      * real binary-search implementation (GnuCOBOL's) picks a
      * specific, deterministic one for a given table layout - the
      * generated Scala must land on the SAME entry, not merely "a"
      * matching entry, for byte-for-byte oracle equivalence.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-FOUND-POS        PIC 9(2).
       01  WS-TABLE.
           05  WS-ENTRY        OCCURS 8 TIMES
                                   ASCENDING KEY IS WS-KEY
                                   INDEXED BY WS-IDX.
               10  WS-KEY      PIC 9(4).
               10  WS-TAG      PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 1000 TO WS-KEY(1)
           MOVE 'ONE1' TO WS-TAG(1)
           MOVE 2000 TO WS-KEY(2)
           MOVE 'TWO1' TO WS-TAG(2)
           MOVE 2000 TO WS-KEY(3)
           MOVE 'TWO2' TO WS-TAG(3)
           MOVE 2000 TO WS-KEY(4)
           MOVE 'TWO3' TO WS-TAG(4)
           MOVE 2000 TO WS-KEY(5)
           MOVE 'TWO4' TO WS-TAG(5)
           MOVE 2000 TO WS-KEY(6)
           MOVE 'TWO5' TO WS-TAG(6)
           MOVE 3000 TO WS-KEY(7)
           MOVE 'THR1' TO WS-TAG(7)
           MOVE 4000 TO WS-KEY(8)
           MOVE 'FOU1' TO WS-TAG(8)
      *
           SEARCH ALL WS-ENTRY
               AT END
                   DISPLAY 'RESULT=NOT-FOUND'
               WHEN WS-KEY(WS-IDX) = 2000
                   SET WS-FOUND-POS TO WS-IDX
                   DISPLAY 'RESULT=FOUND'
                   DISPLAY 'POS=' WS-FOUND-POS
                   DISPLAY 'TAG=' WS-TAG(WS-IDX)
           END-SEARCH
           STOP RUN.
