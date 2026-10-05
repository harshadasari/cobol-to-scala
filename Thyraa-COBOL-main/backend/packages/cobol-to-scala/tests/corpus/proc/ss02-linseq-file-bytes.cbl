      * ss02: writes a LINE SEQUENTIAL file whose records are text, padded
      * text and unsigned display numerics. The program never reads the
      * file back, so only a written-file byte comparison can see it.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. SS02.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "SS02OUT.DAT"
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
           05  WS-AMT          PIC 9(5)V99.
           05  FILLER          PIC X VALUE "|".
           05  WS-TXT          PIC X(8).
       01  WS-I                PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               MOVE WS-I TO WS-ID
               COMPUTE WS-AMT = WS-I * 12.5
               MOVE "ROW" TO WS-TXT
               MOVE WS-LINE TO OUT-REC
               WRITE OUT-REC
           END-PERFORM.
           MOVE "TRAILING   SPACES" TO OUT-REC.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           DISPLAY "WROTE FS=" FS-OUT.
           STOP RUN.
