      * rr04: a negative arithmetic result stored into an UNSIGNED item
      * keeps its absolute value (cobc), so later comparisons see a
      * non-negative number - not just the DISPLAY.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. RR04.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I   PIC 9 VALUE 1.
       01  WS-U   PIC 99 VALUE 5.
       01  WS-V   PIC 9(3)V9 VALUE 2.5.
       01  WS-S   PIC S99 VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD -2 TO WS-I.
           DISPLAY "ADD " WS-I.
           IF WS-I < 0 DISPLAY "NEG" ELSE DISPLAY "NOTNEG" END-IF.
           MOVE 1 TO WS-I.
           COMPUTE WS-I = WS-I - 3.
           DISPLAY "COMPUTE " WS-I.
           IF WS-I < 0 DISPLAY "NEG" ELSE DISPLAY "NOTNEG" END-IF.
           SUBTRACT 9 FROM WS-U.
           DISPLAY "SUBTRACT " WS-U.
           IF WS-U < 0 DISPLAY "NEG" ELSE DISPLAY "NOTNEG" END-IF.
           COMPUTE WS-V = 1.5 - 4.
           DISPLAY "DEC " WS-V.
           IF WS-V < 0 DISPLAY "NEG" ELSE DISPLAY "NOTNEG" END-IF.
           SUBTRACT 9 FROM WS-S.
           DISPLAY "SIGNED " WS-S.
           IF WS-S < 0 DISPLAY "NEG" ELSE DISPLAY "NOTNEG" END-IF.
           STOP RUN.
