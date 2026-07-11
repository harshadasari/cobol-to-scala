       IDENTIFICATION DIVISION.
       PROGRAM-ID. N06REDEFG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DATE.
           05 WS-YEAR    PIC 9(4).
           05 WS-MONTH   PIC 9(2).
           05 WS-DAY     PIC 9(2).
       01 WS-DATE-ALT REDEFINES WS-DATE.
           05 WS-DAY-ALT    PIC 9(2).
           05 WS-MONTH-ALT  PIC 9(2).
           05 WS-YEAR-ALT   PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 2026 TO WS-YEAR
           MOVE 7 TO WS-MONTH
           MOVE 11 TO WS-DAY
           DISPLAY "ALT-DAY=" WS-DAY-ALT
           DISPLAY "ALT-MONTH=" WS-MONTH-ALT
           DISPLAY "ALT-YEAR=" WS-YEAR-ALT
           MOVE 99 TO WS-DAY-ALT
           DISPLAY "YEAR=" WS-YEAR " MONTH=" WS-MONTH " DAY=" WS-DAY
           STOP RUN.
