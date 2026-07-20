      * pp07 (round 40): round-39 finding 5 (oo13) fixed ACCEPT FROM DATE
      * YYYYMMDD's parser corruption and generateAccept's format string, but
      * oo13's own use of the accepted field was via a ref-mod comparison
      * (a separate, still-unfixed gap - finding 6 only stopped it from
      * crashing). This probe uses the ACCEPT FROM DATE YYYYMMDD target
      * directly as a WHOLE-FIELD numeric IF/EVALUATE operand in the very
      * same paragraph, right after the ACCEPT, with no ref-mod and no
      * intermediate MOVE to another variable - the plainest possible
      * "use it immediately" shape.
      *
      * OUTCOME (HONEST - byte-match): the whole-field numeric IF/
      * EVALUATE path is unaffected; only the ref-mod'd-comparison shape
      * (oo13's own finding 6) has any remaining gap.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP07DIRECT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TODAY PIC 9(8).
       PROCEDURE DIVISION.
       MAIN-PARA.
           ACCEPT WS-TODAY FROM DATE YYYYMMDD.
           IF WS-TODAY > 20200101
               DISPLAY "AFTER-2020"
           ELSE
               DISPLAY "NOT-AFTER-2020"
           END-IF.
           EVALUATE TRUE
               WHEN WS-TODAY < 20000101
                   DISPLAY "PRE-2000"
               WHEN WS-TODAY < 21000101
                   DISPLAY "21ST-CENTURY"
               WHEN OTHER
                   DISPLAY "OTHER-CENTURY"
           END-EVALUATE.
           STOP RUN.
