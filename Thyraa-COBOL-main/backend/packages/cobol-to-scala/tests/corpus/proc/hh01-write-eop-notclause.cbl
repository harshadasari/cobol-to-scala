      * hh01: round-31 finding 3 fixed READ's own "NOT AT END" vs "NOT
      * INVALID KEY" clause-ordering ambiguity (parseReadStatement had TWO
      * separate, unconditional `if (ctx.matchValue('NOT'))` checks in a
      * row). WRITE's own parser (parseWriteStatement) has a SIMILAR
      * two-clause shape - `AT END-OF-PAGE`/`NOT AT END-OF-PAGE` followed
      * by `INVALID KEY`/`NOT INVALID KEY` - but only a SINGLE `if
      * (ctx.matchValue('NOT'))` check exists afterward (written assuming
      * it can only ever mean NOT INVALID KEY). This probes whether a
      * WRITE using `AT END-OF-PAGE ... NOT AT END-OF-PAGE ...` (legal
      * COBOL - no prior corpus program uses NOT AT END-OF-PAGE at all)
      * has its own NOT AT END-OF-PAGE clause silently swallowed the same
      * way READ's NOT INVALID KEY used to be.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH01WEOP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "HH01PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 2 LINES.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
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
