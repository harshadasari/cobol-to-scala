       IDENTIFICATION DIVISION.
       PROGRAM-ID. T10BLANKC3.
      * Round-6 attack: BLANK WHEN ZERO edited target fed from a
      * COMP-3 (packed-decimal) source, both a genuine-zero and a
      * non-zero case. Prior BLANK WHEN ZERO coverage (a09) only ever
      * MOVEs a DISPLAY-usage literal directly - never a packed-decimal
      * source field through an intermediate MOVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-AMOUNT-C3        PIC S9(5)V99 COMP-3 VALUE 0.
       01  WS-AMOUNT-C3-NZ     PIC S9(5)V99 COMP-3 VALUE 12.50.
       01  WS-EDITED-ZERO      PIC ZZZZ9.99 BLANK WHEN ZERO.
       01  WS-EDITED-NONZERO   PIC ZZZZ9.99 BLANK WHEN ZERO.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-AMOUNT-C3 TO WS-EDITED-ZERO.
           DISPLAY "ZERO=[" WS-EDITED-ZERO "]".
           MOVE WS-AMOUNT-C3-NZ TO WS-EDITED-NONZERO.
           DISPLAY "NONZERO=[" WS-EDITED-NONZERO "]".
           STOP RUN.
