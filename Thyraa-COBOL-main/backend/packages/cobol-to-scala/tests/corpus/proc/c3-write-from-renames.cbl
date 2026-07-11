       IDENTIFICATION DIVISION.
       PROGRAM-ID. WFRENAM.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "WFRENAM.OUT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC PIC X(6).
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-A PIC X(3).
           05  WS-B PIC X(3).
           05  WS-C PIC X(3).
       66  WS-AB RENAMES WS-A THRU WS-B.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "FOO" TO WS-A.
           MOVE "BAR" TO WS-B.
           MOVE "BAZ" TO WS-C.
           OPEN OUTPUT OUT-FILE.
           WRITE OUT-REC FROM WS-AB.
           CLOSE OUT-FILE.
           OPEN INPUT OUT-FILE.
           READ OUT-FILE
               AT END DISPLAY "EOF".
           DISPLAY "READBACK=[" OUT-REC "]".
           CLOSE OUT-FILE.
           STOP RUN.
