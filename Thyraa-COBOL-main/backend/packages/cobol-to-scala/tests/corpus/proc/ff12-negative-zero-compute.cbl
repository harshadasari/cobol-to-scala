      * ff12: Negative-zero handling in COMPUTE - basic arithmetic edge
      * case not touched in 20+ rounds. Real COBOL fixed-point decimal
      * arithmetic has no IEEE-754-style signed zero, but this checks
      * that a computation which would produce a "negative zero" under
      * naive floating-point-style arithmetic (e.g. multiplying a
      * negative number by zero, or subtracting a value from itself
      * after negation) DISPLAYs as a plain, unsigned "0" - not "-0" -
      * matching real cobc's decimal semantics, including for a signed
      * PICTURE clause where a sign character would otherwise be shown
      * for any genuinely negative value.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF12NEGZERO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A            PIC S9(3)V99  VALUE -5.25.
       01  WS-B            PIC S9(3)V99  VALUE 0.
       01  WS-RESULT       PIC S9(3)V99  VALUE 0.
       01  WS-RESULT2      PIC S9(3)V99  VALUE 0.
       01  WS-RESULT3      PIC S9(3)V99  VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT = WS-A * 0.
           DISPLAY "MUL-BY-ZERO=" WS-RESULT.

           COMPUTE WS-RESULT2 = WS-A - WS-A.
           DISPLAY "SELF-SUBTRACT=" WS-RESULT2.

           COMPUTE WS-RESULT3 = (-1) * WS-B.
           DISPLAY "NEG-TIMES-ZERO=" WS-RESULT3.

           COMPUTE WS-RESULT = 0 - 0.
           DISPLAY "ZERO-MINUS-ZERO=" WS-RESULT.

           COMPUTE WS-RESULT = -0.
           DISPLAY "LITERAL-NEG-ZERO=" WS-RESULT.
           STOP RUN.
