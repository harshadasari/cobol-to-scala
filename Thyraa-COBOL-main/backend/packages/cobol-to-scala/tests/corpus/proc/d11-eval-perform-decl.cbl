       IDENTIFICATION DIVISION.
       PROGRAM-ID. D11.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT BAD-FILE ASSIGN TO "D11NOSUCH.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS FS-BAD.
       DATA DIVISION.
       FILE SECTION.
       FD  BAD-FILE.
       01  BAD-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  FS-BAD PIC XX.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       DECLARATIVES.
       BAD-HANDLER SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON BAD-FILE.
       BAD-HANDLER-PARA.
           DISPLAY "HANDLER FIRED FS=" FS-BAD.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               EVALUATE WS-I
                   WHEN 1
                       DISPLAY "ONE"
                   WHEN 2
                       DISPLAY "TWO"
                   WHEN OTHER
                       DISPLAY "OTHER=" WS-I
               END-EVALUATE
           END-PERFORM.
       END DECLARATIVES.
       MAIN-PARA.
           OPEN INPUT BAD-FILE.
           DISPLAY "AFTER OPEN FS=" FS-BAD.
           STOP RUN.
