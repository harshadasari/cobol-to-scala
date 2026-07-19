      * ll15 (round 36): minimal isolation/bisection follow-up to ll07's
      * finding - a single COMPUTE, no ON SIZE ERROR, no ROUNDED, no second
      * statement - just FUNCTION MOD's FIRST argument being an arithmetic
      * expression (FUNCTION NUMVAL(WS-STR) * 2) rather than a bare
      * literal/variable/single nested FUNCTION call, to show the parser
      * bug in isolation without the collateral token-stream corruption
      * ll07 also exhibits downstream.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL15.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR    PIC X(4) VALUE "17.0".
       01  WS-RESULT PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT =
               FUNCTION MOD(FUNCTION NUMVAL(WS-STR) * 2, 5).
           DISPLAY "RESULT=" WS-RESULT.
           STOP RUN.
