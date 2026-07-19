      * mm03 (round 37): pressure-test on round-36 finding 2 (ll07/ll15)'s
      * parseFunctionArgument fix, generalized from a single arithmetic
      * expression (one operator, one nested FUNCTION call) to THREE
      * levels of nesting with a mix of operators and precedence: FUNCTION
      * MOD's first argument is
      *   FUNCTION NUMVAL(WS-A) + FUNCTION NUMVAL(WS-B) * FUNCTION NUMVAL(WS-C)
      * - three separate nested FUNCTION calls combined by BOTH + and *
      * inside one FUNCTION argument, exercising the new
      * parseFunctionArgAddSubtract/MultiplyDivide precedence chain across
      * more than one operator/more than one nested call in the same
      * argument.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM03.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A      PIC X(2) VALUE "10".
       01  WS-B      PIC X(1) VALUE "3".
       01  WS-C      PIC X(1) VALUE "2".
       01  WS-RESULT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT =
               FUNCTION MOD(FUNCTION NUMVAL(WS-A) +
                   FUNCTION NUMVAL(WS-B) * FUNCTION NUMVAL(WS-C), 7).
           DISPLAY "RESULT=" WS-RESULT.
           STOP RUN.
