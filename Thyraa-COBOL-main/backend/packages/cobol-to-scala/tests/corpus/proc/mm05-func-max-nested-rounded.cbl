      * mm05 (round 37): pressure-test on round-36 finding 2's parser fix
      * combined with the PRE-EXISTING FUNCTION MAX case in
      * functionCallToBigDecimalOperand (generator/expression-gen.js) -
      * ll07/ll15 only exercised FUNCTION MOD's own (newly added) MOD case.
      * Here FUNCTION MAX's arguments are each themselves arithmetic
      * expressions (WS-A * 2 + 1, and WS-B - FUNCTION NUMVAL(WS-C)),
      * inside a COMPUTE with ROUNDED and ON SIZE ERROR, mirroring ll07's
      * overall shape but through the MAX case's own BigDecimal coercion
      * path, not MOD's. One COMPUTE fits cleanly, the second deliberately
      * overflows its target's PIC to fire ON SIZE ERROR (target must stay
      * unchanged).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM05.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A       PIC 9(2) VALUE 4.
       01  WS-B       PIC 9(2) VALUE 20.
       01  WS-C       PIC X(4) VALUE "12.5".
       01  WS-RESULT  PIC 9(3)V99 VALUE 0.
       01  WS-OVERFLOW PIC 9(2) VALUE 77.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT ROUNDED =
               FUNCTION MAX(WS-A * 2 + 1, WS-B - FUNCTION NUMVAL(WS-C))
                   + 0.25
               ON SIZE ERROR
                   DISPLAY "UNEXPECTED SIZE ERROR 1"
           END-COMPUTE.
           DISPLAY "RESULT=" WS-RESULT.

           COMPUTE WS-OVERFLOW ROUNDED =
               FUNCTION MAX(WS-A * 2 + 1, WS-B - FUNCTION NUMVAL(WS-C))
                   + 999
               ON SIZE ERROR
                   DISPLAY "SIZE ERROR 2 (EXPECTED)"
           END-COMPUTE.
           DISPLAY "OVERFLOW=" WS-OVERFLOW.
           STOP RUN.
