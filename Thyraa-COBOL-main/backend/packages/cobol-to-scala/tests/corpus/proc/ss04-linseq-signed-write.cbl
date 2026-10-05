      * ss04: like ss02 but with a SIGNED DISPLAY field moved (as part of a
      * group) into the record: cobc stores the sign as a trailing overpunch
      * byte ("p" for -0), the translator writes a leading "-". Stdout agrees;
      * only the written-file comparison sees it (see the ledger).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SS04.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "SS04OUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-OUT.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(24).
       WORKING-STORAGE SECTION.
       01  FS-OUT              PIC X(2).
       01  WS-LINE.
           05  WS-ID           PIC 9(4).
           05  FILLER          PIC X VALUE "|".
           05  WS-AMT          PIC S9(5)V99.
           05  FILLER          PIC X VALUE "|".
           05  WS-TXT          PIC X(8).
       01  WS-I                PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               MOVE WS-I TO WS-ID
               COMPUTE WS-AMT = WS-I * -12.5
               MOVE "ROW" TO WS-TXT
               MOVE WS-LINE TO OUT-REC
               WRITE OUT-REC
           END-PERFORM.
           MOVE "TRAILING   SPACES" TO OUT-REC.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           DISPLAY "WROTE FS=" FS-OUT.
           STOP RUN.
