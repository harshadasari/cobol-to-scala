       IDENTIFICATION DIVISION.
       PROGRAM-ID. E11.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-HEADER PIC X(4) VALUE "HEAD".
           05  WS-AMT PIC S9(5)V99 COMP-3 VALUE 123.45.
           05  WS-TABLE OCCURS 3 TIMES.
               10  T-CODE PIC X(2).
               10  T-QTY  PIC 9(3) VALUE 7.
           05  WS-FOOTER PIC X(4) VALUE "FOOT".
       01  WS-ALT REDEFINES WS-REC.
           05  A-RAW PIC X(23).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO T-CODE(1).
           MOVE "BB" TO T-CODE(2).
           MOVE "CC" TO T-CODE(3).
           MOVE 11 TO T-QTY(1).
           MOVE 22 TO T-QTY(2).
           MOVE 33 TO T-QTY(3).
           DISPLAY "BEFORE HEADER=" WS-HEADER.
           DISPLAY "BEFORE AMT=" WS-AMT.
           DISPLAY "BEFORE T1=" T-CODE(1) " " T-QTY(1).
           DISPLAY "BEFORE FOOTER=" WS-FOOTER.
           INITIALIZE WS-REC.
           DISPLAY "AFTER HEADER=" WS-HEADER.
           DISPLAY "AFTER AMT=" WS-AMT.
           DISPLAY "AFTER T1=" T-CODE(1) " " T-QTY(1).
           DISPLAY "AFTER T2=" T-CODE(2) " " T-QTY(2).
           DISPLAY "AFTER T3=" T-CODE(3) " " T-QTY(3).
           DISPLAY "AFTER FOOTER=" WS-FOOTER.
           STOP RUN.
