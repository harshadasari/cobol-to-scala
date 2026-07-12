       IDENTIFICATION DIVISION.
       PROGRAM-ID. E02.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-A.
               10  A-LEAD PIC X(1) VALUE "Z".
               10  A-NUM  PIC S9(4) COMP SYNC VALUE 0.
               10  A-TAIL PIC X(1) VALUE "Z".
           05  WS-B REDEFINES WS-A PIC X(5).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "LEN=" FUNCTION LENGTH(WS-A).
           MOVE "PQRST" TO WS-B.
           DISPLAY "LEAD=" A-LEAD.
           DISPLAY "TAIL=" A-TAIL.
           DISPLAY "NUM=" A-NUM.
           STOP RUN.
