       IDENTIFICATION DIVISION.
       PROGRAM-ID. FCOMP3C.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "FCOMP3C.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD OUT-FILE
           RECORD CONTAINS 8 CHARACTERS.
       01 OUT-REC.
           05 OUT-AMT   PIC S9(5)V99 COMP-3.
           05 OUT-TAG   PIC X(4).
       WORKING-STORAGE SECTION.
       01 WS-EOF PIC X VALUE 'N'.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT OUT-FILE.
           MOVE 23456.78 TO OUT-AMT.
           MOVE "AAAA" TO OUT-TAG.
           WRITE OUT-REC.
           MOVE -34567.89 TO OUT-AMT.
           MOVE "BBBB" TO OUT-TAG.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           OPEN INPUT OUT-FILE.
           PERFORM UNTIL WS-EOF = 'Y'
               READ OUT-FILE
                   AT END MOVE 'Y' TO WS-EOF
                   NOT AT END
                       DISPLAY "AMT=" OUT-AMT " TAG=" OUT-TAG
               END-READ
           END-PERFORM.
           CLOSE OUT-FILE.
           STOP RUN.
