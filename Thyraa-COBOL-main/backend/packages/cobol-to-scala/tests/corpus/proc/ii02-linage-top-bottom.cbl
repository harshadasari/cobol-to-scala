      * ii02: companion to ii01 - probes `LINES AT TOP`/`LINES AT BOTTOM`
      * WITHOUT a FOOTING sub-clause, to isolate whether TOP/BOTTOM alone
      * (margin-only clauses, no footer-body split) change cobc's own
      * real AT END-OF-PAGE timing versus this engine's bare-LINAGE
      * "count to n, then reset" model. A direct GnuCOBOL probe (outside
      * this corpus) already confirmed TOP/BOTTOM alone reproduce the
      * exact SAME EOP timing as a bare `LINAGE IS n LINES` clause with
      * no sub-clauses at all - this program locks that in as a
      * regression guard (expected to already pass, unlike ii01's own
      * FOOTING probe).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II02LINTOPBOT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "II02PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 3 LINES
           LINES AT TOP 2
           LINES AT BOTTOM 2.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 7
               MOVE "LINE" TO PRINT-REC
               WRITE PRINT-REC
                   AT END-OF-PAGE
                       DISPLAY "EOP AT I=" WS-I
                   NOT AT END-OF-PAGE
                       DISPLAY "NOTEOP AT I=" WS-I
               END-WRITE
           END-PERFORM.
           CLOSE PRINT-FILE.
           STOP RUN.
