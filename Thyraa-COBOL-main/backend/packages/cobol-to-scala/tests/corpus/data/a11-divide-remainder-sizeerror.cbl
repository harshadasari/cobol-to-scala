       IDENTIFICATION DIVISION.
       PROGRAM-ID. A11DIV.
      *
      * Adversarial: DIVIDE ... REMAINDER, DIVIDE BY ZERO with
      * ON SIZE ERROR, and ON SIZE ERROR that should NOT fire.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DIVIDEND         PIC S9(5) COMP-3 VALUE 17.
       01  WS-DIVISOR          PIC S9(5) COMP-3 VALUE 5.
       01  WS-QUOT             PIC S9(5) COMP-3.
       01  WS-REM              PIC S9(5) COMP-3.
       01  WS-ZERO-DIVISOR     PIC S9(5) COMP-3 VALUE 0.
       01  WS-NEG-DIVIDEND     PIC S9(5) COMP-3 VALUE -17.
       PROCEDURE DIVISION.
       0000-MAIN.
           DIVIDE WS-DIVIDEND BY WS-DIVISOR
               GIVING WS-QUOT REMAINDER WS-REM
           DISPLAY 'QUOT=' WS-QUOT
           DISPLAY 'REM=' WS-REM

           DIVIDE WS-NEG-DIVIDEND BY WS-DIVISOR
               GIVING WS-QUOT REMAINDER WS-REM
           DISPLAY 'NEG-QUOT=' WS-QUOT
           DISPLAY 'NEG-REM=' WS-REM

           DIVIDE WS-DIVIDEND BY WS-ZERO-DIVISOR
               GIVING WS-QUOT REMAINDER WS-REM
               ON SIZE ERROR
                   DISPLAY 'DIV-ZERO-SIZE-ERROR'
               NOT ON SIZE ERROR
                   DISPLAY 'DIV-ZERO-NO-ERROR-QUOT=' WS-QUOT
           END-DIVIDE

           DIVIDE WS-DIVIDEND BY WS-DIVISOR
               GIVING WS-QUOT
               ON SIZE ERROR
                   DISPLAY 'UNEXPECTED-SIZE-ERROR'
               NOT ON SIZE ERROR
                   DISPLAY 'NORMAL-QUOT=' WS-QUOT
           END-DIVIDE

           STOP RUN.
