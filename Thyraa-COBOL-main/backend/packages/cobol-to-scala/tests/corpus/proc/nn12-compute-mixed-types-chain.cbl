      * nn12 (round 38): a single COMPUTE combining FOUR differently-typed
      * operands (COMP-3 packed decimal, COMP/BINARY, plain DISPLAY
      * numeric, and an inline decimal literal) chained through SIX
      * arithmetic operators of mixed precedence (+, *, /, -, **),
      * wrapped in parentheses, with ROUNDED - stress-tests
      * convertArithmeticExpression's operand-type coercion when every
      * single operand in the SAME expression is a different Scala
      * runtime representation (BigDecimal-from-packed, Int-from-binary,
      * BigDecimal-from-display-text, and a bare numeric literal).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN12COMPUTE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC S9(5)V99 COMP-3 VALUE 123.45.
       01  WS-B PIC S9(5) COMP VALUE 10.
       01  WS-C PIC S9(3)V9 VALUE 2.5.
       01  WS-D PIC S9(4) BINARY VALUE 4.
       01  WS-RESULT PIC S9(7)V999 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT ROUNDED =
               (WS-A + WS-B) * WS-C / WS-D - 1.111 ** 2.
           DISPLAY "RESULT=" WS-RESULT.
           STOP RUN.
