       IDENTIFICATION DIVISION.
       PROGRAM-ID. NUM01.
      *
      * Round-4 attack: COMP-3 negative-zero (a computation that could
      * leave a negative sign nibble on a zero-magnitude packed value)
      * displayed through a signed-edited PICTURE, and S9(18) boundary
      * arithmetic with NO ON SIZE ERROR clause (silent high-order
      * truncation/wraparound at the 18-digit ceiling, not a rounding
      * question - a different corner from a01/a02/a11's SIZE ERROR
      * and store-time-rounding coverage).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-ZERO             PIC S9(3) COMP-3 VALUE 0.
       01  WS-FIVE             PIC S9(3) COMP-3 VALUE 5.
       01  WS-NZ1              PIC S9(3) COMP-3.
       01  WS-NZ2              PIC S9(3) COMP-3.
       01  WS-NZ3              PIC S9(3) COMP-3.
       01  WS-EDIT-NZ1         PIC -999.
       01  WS-EDIT-NZ2         PIC -999.
       01  WS-EDIT-NZ3         PIC -999.
       01  WS-BIG          PIC S9(18) COMP-3 VALUE 999999999999999999.
       01  WS-BIG-RESULT   PIC S9(18) COMP-3.
       01  WS-BIG-EDIT     PIC -(18)9.
       01  WS-BIG2         PIC S9(18) COMP-3 VALUE 500000000000000000.
       01  WS-BIG-SUM      PIC S9(18) COMP-3.
       01  WS-BIG-SUM-EDIT PIC -(18)9.
       PROCEDURE DIVISION.
       0000-MAIN.
      *    Various routes to a possible negative-zero packed value.
           COMPUTE WS-NZ1 = 0 - WS-ZERO
           MOVE WS-NZ1 TO WS-EDIT-NZ1
           DISPLAY 'NZ1-EDITED=' WS-EDIT-NZ1
           DISPLAY 'NZ1-RAW=' WS-NZ1
      *
           SUBTRACT WS-FIVE FROM WS-FIVE GIVING WS-NZ2
           MOVE WS-NZ2 TO WS-EDIT-NZ2
           DISPLAY 'NZ2-EDITED=' WS-EDIT-NZ2
           DISPLAY 'NZ2-RAW=' WS-NZ2
      *
           COMPUTE WS-NZ3 = -1 * WS-ZERO
           MOVE WS-NZ3 TO WS-EDIT-NZ3
           DISPLAY 'NZ3-EDITED=' WS-EDIT-NZ3
           DISPLAY 'NZ3-RAW=' WS-NZ3
      *
      *    S9(18) boundary: ADD past the 18-digit ceiling with no
      *    ON SIZE ERROR clause at all - silent high-order truncation.
           ADD 1 TO WS-BIG
           MOVE WS-BIG TO WS-BIG-EDIT
           DISPLAY 'BIG-AFTER-ADD1=' WS-BIG-EDIT
      *
      *    ADD GIVING past the ceiling (sum of two 18-digit values
      *    exceeds 18 digits) with no ON SIZE ERROR clause.
           ADD WS-BIG2 WS-BIG2 GIVING WS-BIG-SUM
           MOVE WS-BIG-SUM TO WS-BIG-SUM-EDIT
           DISPLAY 'BIG-SUM=' WS-BIG-SUM-EDIT
      *
           STOP RUN.
