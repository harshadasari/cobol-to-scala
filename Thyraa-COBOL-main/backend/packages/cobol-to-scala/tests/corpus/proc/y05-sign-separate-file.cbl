       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y05SEPSIGN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "Y05A.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05  REC-NAME        PIC X(6).
           05  REC-AMT         PIC S9(4)V99 SIGN IS LEADING SEPARATE.
       WORKING-STORAGE SECTION.
       01  IN-REC.
           05  IN-NAME         PIC X(6).
           05  IN-AMT          PIC S9(4)V99 SIGN IS LEADING SEPARATE.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT FILE-A.
           MOVE "ABCDEF" TO REC-NAME.
           MOVE -1234.56 TO REC-AMT.
           WRITE REC-A.
           MOVE "GHIJKL" TO REC-NAME.
           MOVE 78.90 TO REC-AMT.
           WRITE REC-A.
           CLOSE FILE-A.
           OPEN INPUT FILE-A.
           READ FILE-A INTO IN-REC
               AT END DISPLAY "EOF1"
           END-READ.
           DISPLAY "NAME=" IN-NAME " AMT=" IN-AMT.
           READ FILE-A INTO IN-REC
               AT END DISPLAY "EOF2"
           END-READ.
           DISPLAY "NAME=" IN-NAME " AMT=" IN-AMT.
           CLOSE FILE-A.
           STOP RUN.
