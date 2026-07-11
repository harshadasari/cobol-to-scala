       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y04COMPBIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "Y04A.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05  REC-NAME        PIC X(6).
           05  REC-BIN         PIC S9(4) COMP.
       WORKING-STORAGE SECTION.
       01  IN-REC.
           05  IN-NAME         PIC X(6).
           05  IN-BIN          PIC S9(4) COMP.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT FILE-A.
           MOVE "ABCDEF" TO REC-NAME.
           MOVE -1234 TO REC-BIN.
           WRITE REC-A.
           MOVE "GHIJKL" TO REC-NAME.
           MOVE 9999 TO REC-BIN.
           WRITE REC-A.
           CLOSE FILE-A.
           OPEN INPUT FILE-A.
           READ FILE-A INTO IN-REC
               AT END DISPLAY "EOF1"
           END-READ.
           DISPLAY "NAME=" IN-NAME " BIN=" IN-BIN.
           READ FILE-A INTO IN-REC
               AT END DISPLAY "EOF2"
           END-READ.
           DISPLAY "NAME=" IN-NAME " BIN=" IN-BIN.
           CLOSE FILE-A.
           STOP RUN.
