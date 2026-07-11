       IDENTIFICATION DIVISION.
       PROGRAM-ID. S10NEGDIV.
      * Round-5 attack: integer division and REMAINDER sign rules for
      * negative operands - COBOL truncates the quotient toward zero
      * (not floor), so REMAINDER must satisfy
      * dividend = quotient * divisor + remainder with the same sign
      * as the dividend for a truncating divide. Verify against cobc,
      * not assumption.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-Q                PIC S9(4) VALUE 0.
       01  WS-R                PIC S9(4) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DIVIDE -7 BY 2 GIVING WS-Q REMAINDER WS-R.
           DISPLAY "Q1=" WS-Q " R1=" WS-R.
           DIVIDE 7 BY -2 GIVING WS-Q REMAINDER WS-R.
           DISPLAY "Q2=" WS-Q " R2=" WS-R.
           DIVIDE -7 BY -2 GIVING WS-Q REMAINDER WS-R.
           DISPLAY "Q3=" WS-Q " R3=" WS-R.
           COMPUTE WS-Q = -7 / 2.
           DISPLAY "COMPUTE-Q=" WS-Q.
           STOP RUN.
