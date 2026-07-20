      * oo13 (round 39): fresh-territory probe - ACCEPT FROM DATE/DAY/
      * DAY-OF-WEEK special registers (not previously exercised anywhere
      * in this corpus per a search of the existing z*/mm*/nn* programs).
      * Deliberately avoids ACCEPT FROM TIME (sub-second-scale, would be
      * genuinely flaky to byte-diff between the cobc run and the
      * separate scala-cli run moments later) - DATE/DAY/DAY-OF-WEEK are
      * all day-granularity and stable across the few seconds this test
      * takes to run both toolchains.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO13ACCEPTDATE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DATE PIC 9(6).
       01  WS-DATE4 PIC 9(8).
       01  WS-DAY PIC 9(5).
       01  WS-DOW PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ACCEPT WS-DATE FROM DATE.
           ACCEPT WS-DATE4 FROM DATE YYYYMMDD.
           ACCEPT WS-DAY FROM DAY.
           ACCEPT WS-DOW FROM DAY-OF-WEEK.
           DISPLAY "DATE=" WS-DATE.
           DISPLAY "DATE4=" WS-DATE4.
           DISPLAY "DAY=" WS-DAY.
           DISPLAY "DOW=" WS-DOW.
           IF WS-DATE4(1:4) = "2026"
               DISPLAY "YEAR-OK"
           ELSE
               DISPLAY "YEAR-UNEXPECTED"
           END-IF.
           STOP RUN.
