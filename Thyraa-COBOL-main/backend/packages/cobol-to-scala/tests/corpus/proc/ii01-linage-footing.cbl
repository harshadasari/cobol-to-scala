      * ii01: round-32 finding 1 (hh01) implemented WRITE's AT END-OF-PAGE
      * for the BARE `LINAGE IS <n> LINES` clause only - the parser
      * (parseFdClauses) explicitly documents that any `WITH FOOTING AT`/
      * `LINES AT TOP`/`LINES AT BOTTOM` sub-clause tokens "fall through
      * to the generic catch-all ctx.advance() ... consumed one token at
      * a time" - i.e. silently dropped, not even captured. This probes
      * whether a `WITH FOOTING AT` clause (which real cobc uses to fire
      * AT END-OF-PAGE potentially several WRITEs before the declared
      * page-size total, once the running line count reaches the FOOTING
      * line rather than the full LINAGE line count) changes cobc's own
      * real AT END-OF-PAGE timing versus this engine's simplistic
      * "count to LINAGE total, then reset" model, which has no notion
      * of FOOTING at all.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II01LINFOOT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "II01PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES
           WITH FOOTING AT 3.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 8
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
