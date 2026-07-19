      * mm04 (round 37): pressure-test on round-36 finding 2's
      * parseFunctionArgOperand - a FUNCTION argument that is a
      * PARENTHESIZED sub-expression combining TWO parenthesized groups
      * with a multiply between them: FUNCTION MOD((WS-A + WS-B) *
      * (WS-C - WS-D), 6). parseFunctionArgOperand explicitly claims to
      * handle one level of "(...)" within an argument (see its own doc
      * comment/code, parser/procedure-parser.js) - this checks TWO such
      * groups combined by an operator in the SAME argument, and that the
      * resulting nested ArithmeticExpression-of-ArithmeticExpression tree
      * still generates and computes correctly (not just parses).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM04.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A      PIC 9(2) VALUE 5.
       01  WS-B      PIC 9(2) VALUE 3.
       01  WS-C      PIC 9(2) VALUE 9.
       01  WS-D      PIC 9(2) VALUE 4.
       01  WS-RESULT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT =
               FUNCTION MOD((WS-A + WS-B) * (WS-C - WS-D), 6).
           DISPLAY "RESULT=" WS-RESULT.
           STOP RUN.
