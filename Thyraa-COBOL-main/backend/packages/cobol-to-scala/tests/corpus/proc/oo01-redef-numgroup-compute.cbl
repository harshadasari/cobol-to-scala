      * oo01 (round 39): round-38 finding 1 (nn02) fixed a NUMERIC
      * elementary item REDEFINES-ing a GROUP so it registers a real
      * accessor (not a bare compile-crashing stub) when used as a MOVE
      * source. This probe pressure-tests the SAME shape used in a fresh
      * context round 38 never tried: as an operand inside a COMPUTE
      * (arithmetic use, not just a MOVE-source read).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO01REDEFCOMP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-A PIC 99 VALUE 12.
           05  WS-B PIC 99 VALUE 34.
       01  WS-NUM REDEFINES WS-GROUP PIC 9(4).
       01  WS-RESULT PIC 9(6) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT = WS-NUM * 2 + 1.
           DISPLAY "RESULT=" WS-RESULT.
           ADD WS-NUM TO WS-RESULT.
           DISPLAY "RESULT2=" WS-RESULT.
           STOP RUN.
