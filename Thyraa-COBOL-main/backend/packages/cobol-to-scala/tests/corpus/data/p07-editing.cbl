       IDENTIFICATION DIVISION.
       PROGRAM-ID. P07EDIT.
      *
      * Phase 1 corpus: numeric-edited pictures - zero suppression
      * (Z), comma insertion, decimal point, currency sign ($, fixed
      * and floating), CR/DB, and sign insertion (+/-, fixed and
      * floating). Values MOVEd in, edited pictures DISPLAYed.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-ZS-VAL           PIC ZZZ9.
       01  WS-ZS-ZERO          PIC ZZZ9.
       01  WS-COMMA-BIG        PIC Z,ZZZ,ZZ9.99.
       01  WS-COMMA-SMALL      PIC Z,ZZZ,ZZ9.99.
       01  WS-DOLLAR-FIXED     PIC $9999.99.
       01  WS-DOLLAR-FLOAT-BIG PIC $$$,$$9.99.
       01  WS-DOLLAR-FLOAT-SM  PIC $$$,$$9.99.
       01  WS-CR-POS           PIC 9(5).99CR.
       01  WS-CR-NEG           PIC 9(5).99CR.
       01  WS-DB-POS           PIC 9(5).99DB.
       01  WS-DB-NEG           PIC 9(5).99DB.
       01  WS-PLUS-FIXED-POS   PIC +9(5).
       01  WS-PLUS-FIXED-NEG   PIC +9(5).
       01  WS-PLUS-FLOAT-POS   PIC ++++9.99.
       01  WS-PLUS-FLOAT-NEG   PIC ++++9.99.
       01  WS-MINUS-FLOAT-POS  PIC ----9.99.
       01  WS-MINUS-FLOAT-NEG  PIC ----9.99.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 7 TO WS-ZS-VAL
           MOVE 0 TO WS-ZS-ZERO
           MOVE 1234567.89 TO WS-COMMA-BIG
           MOVE 42.5 TO WS-COMMA-SMALL
           MOVE 5.5 TO WS-DOLLAR-FIXED
           MOVE 1234.5 TO WS-DOLLAR-FLOAT-BIG
           MOVE 7 TO WS-DOLLAR-FLOAT-SM
           MOVE 50 TO WS-CR-POS
           MOVE -50 TO WS-CR-NEG
           MOVE 50 TO WS-DB-POS
           MOVE -50 TO WS-DB-NEG
           MOVE 50 TO WS-PLUS-FIXED-POS
           MOVE -50 TO WS-PLUS-FIXED-NEG
           MOVE 50 TO WS-PLUS-FLOAT-POS
           MOVE -50 TO WS-PLUS-FLOAT-NEG
           MOVE 50 TO WS-MINUS-FLOAT-POS
           MOVE -50 TO WS-MINUS-FLOAT-NEG
           DISPLAY 'ZS-VAL=' WS-ZS-VAL
           DISPLAY 'ZS-ZERO=' WS-ZS-ZERO
           DISPLAY 'COMMA-BIG=' WS-COMMA-BIG
           DISPLAY 'COMMA-SMALL=' WS-COMMA-SMALL
           DISPLAY 'DOLLAR-FIXED=' WS-DOLLAR-FIXED
           DISPLAY 'DOLLAR-FLOAT-BIG=' WS-DOLLAR-FLOAT-BIG
           DISPLAY 'DOLLAR-FLOAT-SM=' WS-DOLLAR-FLOAT-SM
           DISPLAY 'CR-POS=' WS-CR-POS
           DISPLAY 'CR-NEG=' WS-CR-NEG
           DISPLAY 'DB-POS=' WS-DB-POS
           DISPLAY 'DB-NEG=' WS-DB-NEG
           DISPLAY 'PLUS-FIXED-POS=' WS-PLUS-FIXED-POS
           DISPLAY 'PLUS-FIXED-NEG=' WS-PLUS-FIXED-NEG
           DISPLAY 'PLUS-FLOAT-POS=' WS-PLUS-FLOAT-POS
           DISPLAY 'PLUS-FLOAT-NEG=' WS-PLUS-FLOAT-NEG
           DISPLAY 'MINUS-FLOAT-POS=' WS-MINUS-FLOAT-POS
           DISPLAY 'MINUS-FLOAT-NEG=' WS-MINUS-FLOAT-NEG
           STOP RUN.
