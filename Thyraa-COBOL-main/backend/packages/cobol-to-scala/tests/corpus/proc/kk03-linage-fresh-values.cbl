      * kk03 (round 35): a THIRD fresh pageSize/footingLines pair
      * (7/6, never tried by ii01/jj01/jj02/kk02) further confirming
      * round-34's `footingLines - 1` threshold formula generalizes, across
      * TWO full page cycles (14 WRITEs, pageSize=7) rather than stopping
      * at the first reset like every prior probe.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK03LINFRESH.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "KK03PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 7 LINES
           WITH FOOTING AT 6.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 14
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
