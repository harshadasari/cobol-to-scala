      * mm15 (round 37): pressure-test on round-36 finding 2's new
      * parseFunctionArgPower/parseFunctionArgUnary levels specifically -
      * ll07/ll15/mm03/mm04/mm05 all exercised +/-/* inside a FUNCTION
      * argument, but none used the POWER operator (**) or a leading
      * unary minus INSIDE a FUNCTION argument. First COMPUTE: FUNCTION
      * MOD(WS-A ** 2 - WS-B, 4) exercises parseFunctionArgPower. Second:
      * FUNCTION MOD(-WS-C, 5) exercises parseFunctionArgUnary's
      * unaryMinus branch directly as a FUNCTION argument.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM15.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A       PIC 9(1) VALUE 3.
       01  WS-B       PIC 9(1) VALUE 2.
       01  WS-C       PIC 9(1) VALUE 7.
       01  WS-RESULT1 PIC S9(3) VALUE 0.
       01  WS-RESULT2 PIC S9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT1 =
               FUNCTION MOD(WS-A ** 2 - WS-B, 4).
           DISPLAY "RESULT1=" WS-RESULT1.
           COMPUTE WS-RESULT2 =
               FUNCTION MOD(-WS-C, 5).
           DISPLAY "RESULT2=" WS-RESULT2.
           STOP RUN.
