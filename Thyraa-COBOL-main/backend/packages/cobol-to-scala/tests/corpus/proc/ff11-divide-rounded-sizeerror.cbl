      * ff11: DIVIDE ... ROUNDED ... ON SIZE ERROR, in combinations not
      * touched in 20+ rounds - a rounded quotient that overflows the
      * target's declared PICTURE size (triggering ON SIZE ERROR despite
      * rounding, not despite the raw division itself), a rounded
      * quotient that does NOT overflow (ON SIZE ERROR must NOT fire),
      * and division by zero (which must fire ON SIZE ERROR and leave
      * the target UNCHANGED, since real COBOL never stores a result at
      * all when SIZE ERROR is detected).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF11DIVRND.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A            PIC S9(3)V9  VALUE 999.9.
       01  WS-B            PIC S9(1)V9  VALUE 0.1.
       01  WS-RESULT       PIC S9(2)V9  VALUE 0.
       01  WS-ZERO         PIC S9(1)    VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
      * 999.9 / 0.1 = 9999.0, rounded to 1 decimal still 9999.0 -
      * overflows a PIC S9(2)V9 (max 99.9) target.
           DIVIDE WS-A BY WS-B GIVING WS-RESULT ROUNDED
               ON SIZE ERROR
                   DISPLAY "OVERFLOW SIZE-ERROR RESULT=" WS-RESULT
               NOT ON SIZE ERROR
                   DISPLAY "OVERFLOW NO-ERROR RESULT=" WS-RESULT
           END-DIVIDE.

           MOVE 0 TO WS-RESULT.
           MOVE 10.0 TO WS-A.
           MOVE 4.0 TO WS-B.
      * 10.0 / 4.0 = 2.5, fits cleanly in PIC S9(2)V9.
           DIVIDE WS-A BY WS-B GIVING WS-RESULT ROUNDED
               ON SIZE ERROR
                   DISPLAY "FITS SIZE-ERROR RESULT=" WS-RESULT
               NOT ON SIZE ERROR
                   DISPLAY "FITS NO-ERROR RESULT=" WS-RESULT
           END-DIVIDE.

           MOVE 55.5 TO WS-RESULT.
           DIVIDE WS-A BY WS-ZERO GIVING WS-RESULT ROUNDED
               ON SIZE ERROR
                   DISPLAY "DIVZERO SIZE-ERROR RESULT=" WS-RESULT
               NOT ON SIZE ERROR
                   DISPLAY "DIVZERO NO-ERROR RESULT=" WS-RESULT
           END-DIVIDE.
           STOP RUN.
