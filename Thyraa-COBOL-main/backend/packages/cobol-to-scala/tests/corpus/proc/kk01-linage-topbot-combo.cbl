      * kk01 (round 35): round-34's own jj01/jj02 fixed the `WITH FOOTING
      * AT <m>` threshold formula (footingLines - 1) but only ever combined
      * it with a bare FOOTING clause - never together with `LINES AT TOP`/
      * `LINES AT BOTTOM` in the SAME FD (ii02 tested TOP/BOTTOM alone,
      * confirming they don't affect AT END-OF-PAGE timing by themselves,
      * but that combination has never been tried alongside a REAL FOOTING
      * clause). Uses the identical pageSize=5/footingLines=4 values as jj01
      * (already oracle-verified to produce NOTEOP/NOTEOP/EOP/EOP/EOP/
      * NOTEOP/NOTEOP/EOP/EOP/EOP across 10 WRITEs) with LINES AT TOP 2 and
      * LINES AT BOTTOM 1 added, to confirm the parser's per-token,
      * any-order clause loop (data-division-parser.js) doesn't corrupt the
      * FOOTING capture when TOP/BOTTOM tokens are interleaved with it, and
      * that TOP/BOTTOM's own harmless discard (confirmed by ii02) still
      * holds true when FOOTING is also present.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK01LINCOMBO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "KK01PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES
           WITH FOOTING AT 4
           LINES AT TOP 2
           LINES AT BOTTOM 1.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 10
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
