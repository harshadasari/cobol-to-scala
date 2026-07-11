       IDENTIFICATION DIVISION.
       PROGRAM-ID. A01BIG.
      *
      * Adversarial: 18-digit COMP-3 arithmetic, MULTIPLY overflow
      * with ON SIZE ERROR, negative intermediate results.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-BIG1             PIC S9(18) COMP-3.
       01  WS-BIG2             PIC S9(18) COMP-3 VALUE 2.
       01  WS-BIG-RESULT       PIC S9(18) COMP-3.
       01  WS-SMALL-TARGET     PIC S9(3) COMP-3.
       01  WS-NEG-INTER        PIC S9(5)V99 COMP-3.
       01  WS-A                PIC S9(5) COMP-3 VALUE 10.
       01  WS-B                PIC S9(5) COMP-3 VALUE 40.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 999999999999999999 TO WS-BIG1
           MULTIPLY WS-BIG1 BY WS-BIG2 GIVING WS-BIG-RESULT
               ON SIZE ERROR
                   DISPLAY 'BIG-MULT-SIZE-ERROR'
               NOT ON SIZE ERROR
                   DISPLAY 'BIG-RESULT=' WS-BIG-RESULT
           END-MULTIPLY

           MOVE 12345 TO WS-SMALL-TARGET
           MULTIPLY 999 BY WS-SMALL-TARGET
               ON SIZE ERROR
                   DISPLAY 'SMALL-MULT-SIZE-ERROR'
               NOT ON SIZE ERROR
                   DISPLAY 'SMALL-RESULT=' WS-SMALL-TARGET
           END-MULTIPLY

           COMPUTE WS-NEG-INTER = (WS-A - WS-B) * 3
           DISPLAY 'NEG-INTER=' WS-NEG-INTER

           COMPUTE WS-NEG-INTER = (WS-A - WS-B) / 4
           DISPLAY 'NEG-DIV=' WS-NEG-INTER

           STOP RUN.
