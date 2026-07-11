       IDENTIFICATION DIVISION.
       PROGRAM-ID. P01COMP3.
      *
      * Phase 1 corpus: COMP-3 (packed-decimal) data layout coverage.
      * Positive, negative, zero, odd/even digit counts, V99 scales.
      * No file I/O - literals are MOVEd in and results DISPLAYed.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-POS-SMALL        PIC S9(3)V99 COMP-3.
       01  WS-NEG-SMALL        PIC S9(3)V99 COMP-3.
       01  WS-ZERO-VAL         PIC S9(5)V99 COMP-3.
       01  WS-ODD5-POS         PIC S9(5) COMP-3.
       01  WS-EVEN4-NEG        PIC S9(4) COMP-3.
       01  WS-ODD7-POS         PIC S9(7) COMP-3.
       01  WS-EVEN6-NEG        PIC S9(6) COMP-3.
       01  WS-LARGE-POS        PIC S9(9)V99 COMP-3.
       01  WS-LARGE-NEG        PIC S9(9)V99 COMP-3.
       01  WS-UNSIGNED-V       PIC 9(3)V99 COMP-3.
       01  WS-ALL-DECIMAL      PIC SV9(5) COMP-3.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 123.45 TO WS-POS-SMALL
           MOVE -123.45 TO WS-NEG-SMALL
           MOVE 0 TO WS-ZERO-VAL
           MOVE 12345 TO WS-ODD5-POS
           MOVE -1234 TO WS-EVEN4-NEG
           MOVE 1234567 TO WS-ODD7-POS
           MOVE -123456 TO WS-EVEN6-NEG
           MOVE 1234567.89 TO WS-LARGE-POS
           MOVE -987654321.99 TO WS-LARGE-NEG
           MOVE 42.5 TO WS-UNSIGNED-V
           MOVE -0.54321 TO WS-ALL-DECIMAL
           DISPLAY 'POS-SMALL=' WS-POS-SMALL
           DISPLAY 'NEG-SMALL=' WS-NEG-SMALL
           DISPLAY 'ZERO-VAL=' WS-ZERO-VAL
           DISPLAY 'ODD5-POS=' WS-ODD5-POS
           DISPLAY 'EVEN4-NEG=' WS-EVEN4-NEG
           DISPLAY 'ODD7-POS=' WS-ODD7-POS
           DISPLAY 'EVEN6-NEG=' WS-EVEN6-NEG
           DISPLAY 'LARGE-POS=' WS-LARGE-POS
           DISPLAY 'LARGE-NEG=' WS-LARGE-NEG
           DISPLAY 'UNSIGNED-V=' WS-UNSIGNED-V
           DISPLAY 'ALL-DECIMAL=' WS-ALL-DECIMAL
           STOP RUN.
