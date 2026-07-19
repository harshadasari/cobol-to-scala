      * ll07 (round 36): fresh-territory probe - COMPUTE with a deeply
      * nested arithmetic expression mixing FUNCTION MOD and FUNCTION
      * NUMVAL, plus ROUNDED and ON SIZE ERROR, across two statements: one
      * that fits (no size error) and one deliberately engineered to
      * overflow the target's PIC (triggering ON SIZE ERROR, whose branch
      * must leave the target UNCHANGED from its prior value, matching real
      * cobc's ON SIZE ERROR semantics).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR1      PIC X(6) VALUE "123.45".
       01  WS-STR2      PIC X(4) VALUE "17.0".
       01  WS-RESULT    PIC 9(3)V99 VALUE 0.
       01  WS-OVERFLOW  PIC 9(2) VALUE 77.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT ROUNDED =
               FUNCTION MOD(FUNCTION NUMVAL(WS-STR1) * 10,
                   FUNCTION NUMVAL(WS-STR2)) + 5.25
               ON SIZE ERROR
                   DISPLAY "UNEXPECTED SIZE ERROR 1"
           END-COMPUTE.
           DISPLAY "RESULT=" WS-RESULT.

           COMPUTE WS-OVERFLOW ROUNDED =
               FUNCTION MOD(FUNCTION NUMVAL(WS-STR1) * 100,
                   FUNCTION NUMVAL(WS-STR2)) + 999
               ON SIZE ERROR
                   DISPLAY "SIZE ERROR 2 (EXPECTED)"
           END-COMPUTE.
           DISPLAY "OVERFLOW=" WS-OVERFLOW.
           STOP RUN.
