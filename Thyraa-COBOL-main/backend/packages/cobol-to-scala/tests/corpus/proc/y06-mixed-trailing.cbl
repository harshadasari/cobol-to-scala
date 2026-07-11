       IDENTIFICATION DIVISION.
       PROGRAM-ID. Y06MIXTS.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "Y06A.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT FILE-B ASSIGN TO "Y06B.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05  REC-NAME        PIC X(10).
           05  REC-AMT         PIC S9(5)V99 COMP-3.
       FD  FILE-B.
       01  REC-B.
           05  REC-NAME-B      PIC X(10).
       WORKING-STORAGE SECTION.
       01  IN-REC.
           05  IN-NAME         PIC X(10).
           05  IN-AMT          PIC S9(5)V99 COMP-3.
       01  IN-REC-B.
           05  IN-NAME-B       PIC X(10).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT FILE-A.
           MOVE "AB" TO REC-NAME.
           MOVE 23456.78 TO REC-AMT.
           WRITE REC-A.
           CLOSE FILE-A.

           OPEN OUTPUT FILE-B.
           MOVE "AB" TO REC-NAME-B.
           WRITE REC-B.
           CLOSE FILE-B.

           OPEN INPUT FILE-A.
           READ FILE-A INTO IN-REC
               AT END DISPLAY "EOF-A"
           END-READ.
           CLOSE FILE-A.
           DISPLAY "A-NAME=[" IN-NAME "] AMT=" IN-AMT.

           OPEN INPUT FILE-B.
           READ FILE-B INTO IN-REC-B
               AT END DISPLAY "EOF-B"
           END-READ.
           CLOSE FILE-B.
           DISPLAY "B-NAME=[" IN-NAME-B "]".
           STOP RUN.
