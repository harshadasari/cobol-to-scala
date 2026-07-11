       IDENTIFICATION DIVISION.
       PROGRAM-ID. R14INTPLY.
      *
      * Adversarial interplay: (1) SEARCH re-executed on every
      * iteration of a PERFORM VARYING loop, with the search start
      * index reset each time - stale index state from a previous
      * iteration must not leak in. (2) An 88-level condition-name set
      * via SET ... TO TRUE, then tested both by IF and by EVALUATE
      * TRUE. (3) The result of an intrinsic FUNCTION call MOVEd
      * directly into an edited (zero-suppressed, comma/decimal
      * -inserting) numeric PICTURE field.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START            PIC 9(2).
       01  WS-NUM-TABLE.
           05  WS-NUM-ENTRY    OCCURS 5 TIMES INDEXED BY WS-NIDX.
               10  WS-NUM-VAL  PIC 9(3).
       01  WS-STATUS           PIC X(1) VALUE 'A'.
           88  WS-STATUS-ACTIVE    VALUE 'A'.
           88  WS-STATUS-CLOSED    VALUE 'C'.
       01  WS-V1               PIC S9(5)V99 VALUE 1234.56.
       01  WS-V2               PIC S9(5)V99 VALUE 999.99.
       01  WS-V3               PIC S9(5)V99 VALUE 5000.10.
       01  WS-EDITED-FIELD     PIC ZZ,ZZ9.99.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 10 TO WS-NUM-VAL(1)
           MOVE 20 TO WS-NUM-VAL(2)
           MOVE 30 TO WS-NUM-VAL(3)
           MOVE 40 TO WS-NUM-VAL(4)
           MOVE 50 TO WS-NUM-VAL(5)
      *
           PERFORM VARYING WS-START FROM 1 BY 1 UNTIL WS-START > 5
               SET WS-NIDX TO WS-START
               SEARCH WS-NUM-ENTRY
                   AT END
                       DISPLAY 'START=' WS-START ' SEARCH=NOT-FOUND'
                   WHEN WS-NUM-VAL(WS-NIDX) = 30
                       DISPLAY 'START=' WS-START
                           ' SEARCH=FOUND-AT-' WS-NIDX
               END-SEARCH
           END-PERFORM
      *
           SET WS-STATUS-ACTIVE TO TRUE
           IF WS-STATUS-ACTIVE
               DISPLAY 'IF-CHECK=ACTIVE'
           ELSE
               DISPLAY 'IF-CHECK=NOT-ACTIVE'
           END-IF
           EVALUATE TRUE
               WHEN WS-STATUS-ACTIVE
                   DISPLAY 'EVAL-CHECK=ACTIVE'
               WHEN WS-STATUS-CLOSED
                   DISPLAY 'EVAL-CHECK=CLOSED'
               WHEN OTHER
                   DISPLAY 'EVAL-CHECK=UNKNOWN'
           END-EVALUATE
      *
           MOVE FUNCTION MAX(WS-V1 WS-V2 WS-V3) TO WS-EDITED-FIELD
           DISPLAY 'EDITED-MAX=' WS-EDITED-FIELD
           STOP RUN.
