       IDENTIFICATION DIVISION.
       PROGRAM-ID. D02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC VALUE "ABCDE".
           05  F1 PIC X(1).
           05  F2 PIC S9(4) COMP SYNC.
           05  F3 PIC X(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-REC).
           DISPLAY "F1=" F1.
           DISPLAY "F2=" F2.
           DISPLAY "F3=" F3.
           STOP RUN.
