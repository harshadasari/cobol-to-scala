       IDENTIFICATION DIVISION.
       PROGRAM-ID. R11INTRIN.
      *
      * Adversarial: intrinsic-function composition beyond the
      * baseline corpus's p15-intrinsics.cbl - FUNCTION MAX over three
      * VARIABLE arguments (incl. a negative one), FUNCTION LENGTH of
      * a GROUP item (must equal the sum of its elementary children's
      * byte lengths, not fail/return 0), FUNCTION NUMVAL on a string
      * with an explicit leading '+' and embedded spaces between the
      * sign and the digits, FUNCTION MOD across both-negative and
      * mixed-sign operand combinations (floored-division convention),
      * and a FUNCTION call nested as the argument of another FUNCTION
      * call inside COMPUTE.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-V1               PIC S9(3)   VALUE -10.
       01  WS-V2               PIC S9(3)   VALUE 25.
       01  WS-V3               PIC S9(3)   VALUE 3.
       01  WS-MAX-RESULT       PIC S9(3).
       01  WS-GROUP.
           05  WS-G-A          PIC X(4)    VALUE 'ABCD'.
           05  WS-G-B          PIC 9(3)    VALUE 123.
       01  WS-LEN-GROUP        PIC 9(2).
       01  WS-NUMVAL-SRC2      PIC X(12)   VALUE ' +  12.5 '.
       01  WS-NUMVAL-RESULT2   PIC S9(3)V99.
       01  WS-MOD-A            PIC S9(3).
       01  WS-MOD-B            PIC S9(3).
       01  WS-MIXED            PIC X(10)   VALUE '  -45.6  '.
       01  WS-NESTED-RESULT    PIC S9(3)V9.
       PROCEDURE DIVISION.
       0000-MAIN.
           COMPUTE WS-MAX-RESULT = FUNCTION MAX(WS-V1 WS-V2 WS-V3)
           DISPLAY 'MAX-RESULT=' WS-MAX-RESULT
      *
           MOVE FUNCTION LENGTH(WS-GROUP) TO WS-LEN-GROUP
           DISPLAY 'LEN-GROUP=' WS-LEN-GROUP
      *
           MOVE FUNCTION NUMVAL(WS-NUMVAL-SRC2) TO WS-NUMVAL-RESULT2
           DISPLAY 'NUMVAL-RESULT2=' WS-NUMVAL-RESULT2
      *
           COMPUTE WS-MOD-A = FUNCTION MOD(7, -3)
           DISPLAY 'MOD-A=' WS-MOD-A
      *
           COMPUTE WS-MOD-B = FUNCTION MOD(-7, -3)
           DISPLAY 'MOD-B=' WS-MOD-B
      *
           COMPUTE WS-NESTED-RESULT =
               FUNCTION NUMVAL(FUNCTION UPPER-CASE(WS-MIXED))
           DISPLAY 'NESTED-RESULT=' WS-NESTED-RESULT
           STOP RUN.
