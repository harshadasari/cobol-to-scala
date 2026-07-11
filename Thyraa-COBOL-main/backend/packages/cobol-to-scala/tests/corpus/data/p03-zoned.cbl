       IDENTIFICATION DIVISION.
       PROGRAM-ID. P03ZONED.
      *
      * Phase 1 corpus: signed zoned-decimal (DISPLAY usage) numerics,
      * arithmetic producing negative results, then DISPLAY.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SMALL            PIC S9(5).
       01  WS-LARGE            PIC S9(5).
       01  WS-DIFF-NEG         PIC S9(6).
       01  WS-DIFF-POS         PIC S9(6).
       01  WS-SUM-NEG          PIC S9(6) VALUE 0.
       01  WS-PROD-NEG         PIC S9(8).
       01  WS-PROD-POS         PIC S9(8).
       01  WS-QUOT-NEG         PIC S9(5)V99.
       01  WS-REMAINDER        PIC S9(3).
       01  WS-DIVIDE-RESULT    PIC S9(4).
       01  WS-SUB-GIVING-NEG   PIC S9(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 100 TO WS-SMALL
           MOVE 750 TO WS-LARGE
           COMPUTE WS-DIFF-NEG = WS-SMALL - WS-LARGE
           COMPUTE WS-DIFF-POS = WS-LARGE - WS-SMALL
           ADD -500 TO WS-SUM-NEG
           ADD -250 TO WS-SUM-NEG
           MULTIPLY WS-SMALL BY -3 GIVING WS-PROD-NEG
           MULTIPLY WS-LARGE BY 3 GIVING WS-PROD-POS
           DIVIDE WS-SMALL INTO -750 GIVING WS-QUOT-NEG
           DIVIDE 17 INTO WS-LARGE GIVING WS-DIVIDE-RESULT
               REMAINDER WS-REMAINDER
           SUBTRACT WS-LARGE FROM WS-SMALL GIVING WS-SUB-GIVING-NEG
           DISPLAY 'SMALL=' WS-SMALL
           DISPLAY 'LARGE=' WS-LARGE
           DISPLAY 'DIFF-NEG=' WS-DIFF-NEG
           DISPLAY 'DIFF-POS=' WS-DIFF-POS
           DISPLAY 'SUM-NEG=' WS-SUM-NEG
           DISPLAY 'PROD-NEG=' WS-PROD-NEG
           DISPLAY 'PROD-POS=' WS-PROD-POS
           DISPLAY 'QUOT-NEG=' WS-QUOT-NEG
           DISPLAY 'REMAINDER=' WS-REMAINDER
           DISPLAY 'DIVIDE-RESULT=' WS-DIVIDE-RESULT
           DISPLAY 'SUB-GIVING-NEG=' WS-SUB-GIVING-NEG
           STOP RUN.
