       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y03RETRY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "Y03A.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-A.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A               PIC X(10).
       WORKING-STORAGE SECTION.
       01  FS-A                PIC X(2).
       PROCEDURE DIVISION.
       DECLARATIVES.
       A-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON FILE-A.
       A-HANDLER-PARA.
           DISPLAY "A-HANDLER FIRED FS-A=" FS-A.
       END DECLARATIVES.
       MAIN-PARA.
           OPEN INPUT FILE-A.
           DISPLAY "FIRST OPEN FS-A=" FS-A.
           IF FS-A NOT = "00"
               OPEN OUTPUT FILE-A
               MOVE "SEEDED-LINE" TO REC-A
               WRITE REC-A
               CLOSE FILE-A
           END-IF.
           OPEN INPUT FILE-A.
           DISPLAY "SECOND OPEN FS-A=" FS-A.
           READ FILE-A INTO REC-A
               AT END DISPLAY "UNEXPECTED EOF"
           END-READ.
           DISPLAY "REC-A=" REC-A.
           CLOSE FILE-A.
           STOP RUN.
