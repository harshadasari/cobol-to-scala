      * oo11 (round 39): fresh-territory probe from the round-39 brief -
      * EXIT PROGRAM vs GOBACK differences in a called subprogram. Two
      * subprograms (SUBA ends with EXIT PROGRAM, SUBB ends with GOBACK),
      * each maintaining its own WORKING-STORAGE counter, called 3 times
      * each - checks whether static WORKING-STORAGE state persists
      * identically across repeated calls for BOTH termination styles
      * (verified against real cobc: it does, for both - GnuCOBOL does
      * not implicitly CANCEL a program on either EXIT PROGRAM or
      * GOBACK).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO11MAIN.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "OO11SUBA".
           CALL "OO11SUBA".
           CALL "OO11SUBA".
           CALL "OO11SUBB".
           CALL "OO11SUBB".
           CALL "OO11SUBB".
           STOP RUN.
       END PROGRAM OO11MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO11SUBA.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
           ADD 1 TO WS-COUNT.
           DISPLAY "SUBA COUNT=" WS-COUNT.
           EXIT PROGRAM.
       END PROGRAM OO11SUBA.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO11SUBB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
           ADD 1 TO WS-COUNT.
           DISPLAY "SUBB COUNT=" WS-COUNT.
           GOBACK.
       END PROGRAM OO11SUBB.
