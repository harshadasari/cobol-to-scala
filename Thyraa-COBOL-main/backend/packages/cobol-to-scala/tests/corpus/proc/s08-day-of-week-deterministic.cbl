       IDENTIFICATION DIVISION.
       PROGRAM-ID. S08DAYWEEK.
      * Round-5 attack: ACCEPT FROM DAY-OF-WEEK. Deterministic-in-
      * principle (a pure function of "today"), and since cobc and
      * the generated Scala both run within the same test invocation
      * (same calendar day, barring an exact-midnight race), their
      * outputs should agree - this checks the generator computes the
      * ISO day-of-week number (1=Monday..7=Sunday) the same way
      * GnuCOBOL's runtime does, not merely that it doesn't crash.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DOW              PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           ACCEPT WS-DOW FROM DAY-OF-WEEK.
           IF WS-DOW >= 1 AND WS-DOW <= 7
               DISPLAY "DOW-IN-RANGE"
           ELSE
               DISPLAY "DOW-OUT-OF-RANGE"
           END-IF.
           STOP RUN.
