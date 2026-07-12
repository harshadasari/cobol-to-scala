       IDENTIFICATION DIVISION.
       PROGRAM-ID. D09.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT OUT-FILE ASSIGN TO "D09OUT.DAT".
       DATA DIVISION.
       FILE SECTION.
       FD  OUT-FILE.
       01  OUT-REC.
           05  OR-AMT PIC 9(4) COMP-3.
           05  OR-ITEM OCCURS 2 TIMES PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-EOF PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1234 TO OR-AMT.
           MOVE "AAA" TO OR-ITEM(1).
           MOVE "BBB" TO OR-ITEM(2).
           OPEN OUTPUT OUT-FILE.
           WRITE OUT-REC.
           CLOSE OUT-FILE.
           DISPLAY "AMT=" OR-AMT.
           DISPLAY "ITEM1=" OR-ITEM(1) " ITEM2=" OR-ITEM(2).

           OPEN INPUT OUT-FILE.
           READ OUT-FILE
               AT END MOVE "Y" TO WS-EOF
           END-READ.
           DISPLAY "READBACK-AMT=" OR-AMT.
           DISPLAY "READBACK-ITEM1=" OR-ITEM(1)
               " READBACK-ITEM2=" OR-ITEM(2).
           CLOSE OUT-FILE.
           DISPLAY "DONE".
           STOP RUN.
