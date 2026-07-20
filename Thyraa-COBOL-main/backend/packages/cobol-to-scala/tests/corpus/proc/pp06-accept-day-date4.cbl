      * pp06 (round 40): round-39 findings 4 and 5 (oo13) each fixed one
      * ACCEPT variant (FROM DAY's missing year prefix, FROM DATE YYYYMMDD's
      * parser corruption) in isolation. This probe combines BOTH in the
      * SAME program/paragraph to check for any interaction bug between the
      * two generateAccept branches or the parser's now-two-armed DATE
      * lookahead (bare DATE vs DATE YYYYMMDD) when both ACCEPT forms plus a
      * plain bare DATE all appear back to back.
      *
      * OUTCOME (HONEST - byte-match): no interaction bug between the
      * three ACCEPT forms/branches when combined in one paragraph.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP06ACCEPT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DATE6 PIC 9(6).
       01  WS-DATE8 PIC 9(8).
       01  WS-DAY PIC 9(5).
       01  WS-CENTURY PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           ACCEPT WS-DATE6 FROM DATE.
           ACCEPT WS-DATE8 FROM DATE YYYYMMDD.
           ACCEPT WS-DAY FROM DAY.
           DISPLAY "DATE6=" WS-DATE6.
           DISPLAY "DATE8=" WS-DATE8.
           DISPLAY "DAY=" WS-DAY.
           COMPUTE WS-CENTURY = WS-DATE8 / 1000000.
           DISPLAY "CENTURY=" WS-CENTURY.
           STOP RUN.
