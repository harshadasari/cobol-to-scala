       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y07RDINTO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "Y07A.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A               PIC X(10).
       WORKING-STORAGE SECTION.
       01  SAVE-REC-1          PIC X(10).
       01  SAVE-REC-2          PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT FILE-A.
           MOVE "FIRSTLINE" TO REC-A.
           WRITE REC-A.
           MOVE "SECONDLIN" TO REC-A.
           WRITE REC-A.
           CLOSE FILE-A.
           OPEN INPUT FILE-A.
           READ FILE-A INTO SAVE-REC-1
               AT END DISPLAY "EOF1"
           END-READ.
           READ FILE-A INTO SAVE-REC-2
               AT END DISPLAY "EOF2"
           END-READ.
           DISPLAY "REC1=[" SAVE-REC-1 "]".
           DISPLAY "REC2=[" SAVE-REC-2 "]".
           DISPLAY "CURRENT-REC-A=[" REC-A "]".
           CLOSE FILE-A.
           STOP RUN.
