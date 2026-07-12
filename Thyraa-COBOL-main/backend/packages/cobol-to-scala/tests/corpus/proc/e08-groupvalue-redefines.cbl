       IDENTIFICATION DIVISION.
       PROGRAM-ID. E08.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-BASE VALUE "AB1234CD".
               10  B-F1 PIC X(2).
               10  B-F2 PIC 9(4).
               10  B-F3 PIC X(2).
           05  WS-ALT REDEFINES WS-BASE.
               10  A-CHUNK1 PIC X(4).
               10  A-CHUNK2 PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "F1=" B-F1.
           DISPLAY "F2=" B-F2.
           DISPLAY "F3=" B-F3.
           DISPLAY "CHUNK1=" A-CHUNK1.
           DISPLAY "CHUNK2=" A-CHUNK2.
           STOP RUN.
