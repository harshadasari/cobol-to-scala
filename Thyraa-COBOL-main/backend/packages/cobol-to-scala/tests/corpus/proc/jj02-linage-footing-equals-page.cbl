       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ02LINEQ.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "JJ01PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES
           WITH FOOTING AT 5.
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
