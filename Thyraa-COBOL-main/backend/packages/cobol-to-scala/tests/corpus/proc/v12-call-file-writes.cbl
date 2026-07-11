       IDENTIFICATION DIVISION.
       PROGRAM-ID. V12A.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A: START".
           CALL "V12WRITE".
           DISPLAY "A: BACK FROM CALL".
           CALL "V12READ".
           DISPLAY "A: END".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. V12WRITE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "v12data.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC             PIC X(10).
       PROCEDURE DIVISION.
       W-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE "REC0001" TO OUT-REC.
           WRITE OUT-REC.
           MOVE "REC0002" TO OUT-REC.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           DISPLAY "SUB-WRITE: WROTE 2 RECORDS".
           GOBACK.
       END PROGRAM V12WRITE.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. V12READ.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "v12data.dat"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE.
       01  IN-REC              PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-EOF              PIC X VALUE 'N'.
       PROCEDURE DIVISION.
       R-PARA.
           OPEN INPUT IN-FILE.
           PERFORM UNTIL WS-EOF = 'Y'
               READ IN-FILE
                   AT END
                       MOVE 'Y' TO WS-EOF
                   NOT AT END
                       DISPLAY "SUB-READ: [" IN-REC "]"
               END-READ
           END-PERFORM.
           CLOSE IN-FILE.
           GOBACK.
       END PROGRAM V12READ.
       END PROGRAM V12A.
