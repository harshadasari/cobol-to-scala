      * kk02 (round 35): boundary probe for round-34's `footingLines - 1`
      * threshold formula (linageEopLines, expression-gen.js) at the
      * SMALLEST legal FOOTING value, 1 - the threshold degenerates to 0,
      * meaning the per-file line counter (which starts incrementing from 1
      * on the very first WRITE) is `>= 0` from the first WRITE onward, so
      * AT END-OF-PAGE should fire on EVERY SINGLE WRITE until the counter
      * reaches the full page size and resets. jj01/jj02/ii01 only ever
      * exercised footingLines values of 3/4/5 against pageSize 5 - this is
      * the first probe at the extreme low end of the legal range.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK02LINFOOT1.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "KK02PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 6 LINES
           WITH FOOTING AT 1.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 12
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
