      * Round-12 probe z08: (a) MOVE numeric-to-numeric where the SOURCE has
      * MORE integer digits AND more decimal digits than the target ("double
      * truncation" - loses high-order integer digits AND low-order decimal
      * digits in the same MOVE, no rounding); (b) a negative COMP value
      * MOVEd into an UNSIGNED PIC 9 target (does cobc store the absolute
      * value, or something else?); (c) same question for a negative
      * COMPUTE result stored into an unsigned target.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z08TRUNC.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC       PIC S9(5)V999 VALUE -12345.678.
       01  WS-TGT       PIC 9(2)V9    VALUE 0.
       01  WS-COMPA     PIC S9(4) COMP VALUE -25.
       01  WS-UNSB      PIC 9(4) VALUE 0.
       01  WS-UNSC      PIC 9(3) VALUE 0.
       01  WS-M         PIC S9(3) VALUE -7.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-SRC TO WS-TGT.
           DISPLAY "DOUBLE-TRUNC-TGT=" WS-TGT.

           MOVE WS-COMPA TO WS-UNSB.
           DISPLAY "NEG-COMP-TO-UNSIGNED=" WS-UNSB.

           COMPUTE WS-UNSC = WS-M * 3.
           DISPLAY "NEG-COMPUTE-TO-UNSIGNED=" WS-UNSC.
           STOP RUN.
