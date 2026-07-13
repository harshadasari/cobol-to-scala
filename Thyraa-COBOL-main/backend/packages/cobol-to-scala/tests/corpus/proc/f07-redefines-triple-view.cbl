       IDENTIFICATION DIVISION.
       PROGRAM-ID. F07.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
          05 WS-A PIC X(6) VALUE "123456".
          05 WS-B REDEFINES WS-A.
             10 B-ONE PIC X(3).
             10 B-TWO PIC X(3).
          05 WS-C REDEFINES WS-A.
             10 C-ALL PIC 9(6).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A=" WS-A.
           DISPLAY "B1=" B-ONE.
           DISPLAY "B2=" B-TWO.
           DISPLAY "C=" C-ALL.
           MOVE "987654" TO WS-A.
           DISPLAY "AFTER-C=" C-ALL.
           MOVE "999" TO B-TWO.
           DISPLAY "AFTER-A=" WS-A.
           DISPLAY "AFTER-C2=" C-ALL.
           STOP RUN.
