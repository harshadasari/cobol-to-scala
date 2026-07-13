      * Adversarial (round 21): STRING ... WITH POINTER whose pointer
      * variable's value was just computed via a nested intrinsic
      * FUNCTION call (FUNCTION LENGTH(FUNCTION TRIM(...)) + 1), rather
      * than a literal or a plain MOVE - a direct "WITH POINTER FUNCTION
      * ..." is rejected by cobc itself (verified: "expecting Identifier"
      * - the WITH POINTER operand must be a data-name), so this
      * exercises the realistic shape instead: the pointer's value
      * arrives via FUNCTION-based COMPUTE immediately beforehand, then
      * STRING reads/writes that same variable as its POINTER operand.
      * g09/i12/z06/q11 all exercise STRING/UNSTRING POINTER in other
      * combinations, but never with a FUNCTION-derived initial value.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J07STRPTRFUNC.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-OUT PIC X(20) VALUE SPACES.
       01  WS-TAG PIC X(8) VALUE "AB      ".
       01  WS-PTR PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-PTR = FUNCTION LENGTH(FUNCTION TRIM(WS-TAG)) + 1.
           DISPLAY "PTR-INIT=" WS-PTR.
           STRING "XY" DELIMITED BY SIZE
                  "Z" DELIMITED BY SIZE
                  INTO WS-OUT
                  WITH POINTER WS-PTR.
           DISPLAY "OUT=[" WS-OUT "]".
           DISPLAY "PTR-AFTER=" WS-PTR.
           STOP RUN.
