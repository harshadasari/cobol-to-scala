       IDENTIFICATION DIVISION.
       PROGRAM-ID. P06REDEF.
      *
      * Phase 1 corpus: REDEFINES view over a date field. Both the
      * numeric whole-field view and the YYYYMMDD component view
      * share the same storage; a write through either view is
      * visible through the other.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DATE-NUMERIC     PIC 9(8).
       01  WS-DATE-GROUP REDEFINES WS-DATE-NUMERIC.
           05  WS-YEAR         PIC 9(4).
           05  WS-MONTH        PIC 9(2).
           05  WS-DAY          PIC 9(2).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 20260711 TO WS-DATE-NUMERIC
           DISPLAY 'NUMERIC-VIEW=' WS-DATE-NUMERIC
           DISPLAY 'YEAR=' WS-YEAR
           DISPLAY 'MONTH=' WS-MONTH
           DISPLAY 'DAY=' WS-DAY
      *
           MOVE 12 TO WS-MONTH
           MOVE 25 TO WS-DAY
           DISPLAY 'AFTER-COMPONENT-WRITE=' WS-DATE-NUMERIC
      *
           MOVE 20301231 TO WS-DATE-NUMERIC
           DISPLAY 'AFTER-WHOLE-WRITE-YEAR=' WS-YEAR
           DISPLAY 'AFTER-WHOLE-WRITE-MONTH=' WS-MONTH
           DISPLAY 'AFTER-WHOLE-WRITE-DAY=' WS-DAY
           STOP RUN.
