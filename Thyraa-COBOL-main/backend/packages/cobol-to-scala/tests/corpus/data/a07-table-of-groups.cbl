       IDENTIFICATION DIVISION.
       PROGRAM-ID. A07TGRP.
      *
      * Adversarial: table of groups with mixed COMP-3/DISPLAY children.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ENTRY OCCURS 3 TIMES.
               10  WS-ID        PIC 9(3).
               10  WS-AMOUNT    PIC S9(5)V99 COMP-3.
               10  WS-NAME      PIC X(6).
       01  WS-IDX              PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 101 TO WS-ID(1)
           MOVE 123.45 TO WS-AMOUNT(1)
           MOVE 'ALICE' TO WS-NAME(1)

           MOVE 202 TO WS-ID(2)
           MOVE -67.89 TO WS-AMOUNT(2)
           MOVE 'BOB' TO WS-NAME(2)

           MOVE 303 TO WS-ID(3)
           MOVE 0 TO WS-AMOUNT(3)
           MOVE 'CAROL' TO WS-NAME(3)

           PERFORM VARYING WS-IDX FROM 1 BY 1 UNTIL WS-IDX > 3
               DISPLAY 'ENTRY-ID=' WS-ID(WS-IDX)
                   ' AMT=' WS-AMOUNT(WS-IDX)
                   ' NAME=[' WS-NAME(WS-IDX) ']'
           END-PERFORM

           ADD WS-AMOUNT(1) WS-AMOUNT(2) WS-AMOUNT(3)
               GIVING WS-AMOUNT(3)
           DISPLAY 'SUM-INTO-3=' WS-AMOUNT(3)

           STOP RUN.
