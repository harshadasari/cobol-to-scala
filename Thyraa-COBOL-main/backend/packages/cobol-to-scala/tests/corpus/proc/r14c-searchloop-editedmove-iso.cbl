       IDENTIFICATION DIVISION.
       PROGRAM-ID. R14CISOL.
      *
      * Isolation follow-up for r14: SEARCH re-executed inside a
      * PERFORM VARYING loop, plus MOVE of an intrinsic FUNCTION
      * result into an edited numeric field, with the 88-level attack
      * surface removed, to confirm these two parts are clean on
      * their own.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START            PIC 9(2).
       01  WS-NUM-TABLE.
           05  WS-NUM-ENTRY    OCCURS 5 TIMES INDEXED BY WS-NIDX.
               10  WS-NUM-VAL  PIC 9(3).
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
           MOVE FUNCTION MAX(WS-V1 WS-V2 WS-V3) TO WS-EDITED-FIELD
           DISPLAY 'EDITED-MAX=' WS-EDITED-FIELD
           STOP RUN.
