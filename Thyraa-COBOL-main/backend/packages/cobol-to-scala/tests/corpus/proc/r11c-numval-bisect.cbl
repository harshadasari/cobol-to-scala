       IDENTIFICATION DIVISION.
       PROGRAM-ID. R11CNUMVL.
      *
      * Bisecting r11b's NUMVAL crash: is it the leading/trailing
      * spaces alone, or the embedded space BETWEEN the sign and the
      * digits, that breaks the generated NUMVAL?
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC-A            PIC X(12) VALUE '  -123.45  '.
       01  WS-RES-A            PIC S9(3)V99.
       01  WS-SRC-B            PIC X(12) VALUE '+12.50'.
       01  WS-RES-B            PIC S9(3)V99.
       01  WS-SRC-C            PIC X(12) VALUE '+  12.50'.
       01  WS-RES-C            PIC S9(3)V99.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE FUNCTION NUMVAL(WS-SRC-A) TO WS-RES-A
           DISPLAY 'RES-A=' WS-RES-A
           MOVE FUNCTION NUMVAL(WS-SRC-B) TO WS-RES-B
           DISPLAY 'RES-B=' WS-RES-B
           MOVE FUNCTION NUMVAL(WS-SRC-C) TO WS-RES-C
           DISPLAY 'RES-C=' WS-RES-C
           STOP RUN.
