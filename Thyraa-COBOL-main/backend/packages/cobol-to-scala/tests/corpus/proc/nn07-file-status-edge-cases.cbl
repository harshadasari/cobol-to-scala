      * nn07 (round 38): FILE STATUS edge cases not exercised by the round-
      * 25/26 REWRITE/DELETE/START campaign - (1) a SECOND sequential READ
      * past end-of-file (after the first already returned AT END/status
      * 10), (2) OPENing a file a second time while it's still open
      * (real cobc: status 41), (3) a READ issued after the file has
      * already been CLOSEd (real cobc: status 47 - not open), (4) a
      * second CLOSE of an already-closed file (real cobc: status 42).
      * Every FILE STATUS value is DISPLAYed so a silent divergence would
      * show up as a wrong number, not just a crash.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN07STATUS.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "NN07FILE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-STATUS PIC XX VALUE "00".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           WRITE SOME-REC FROM "REC-ONE".
           WRITE SOME-REC FROM "REC-TWO".
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           DISPLAY "OPEN1 STATUS=" WS-STATUS.
           READ SOME-FILE.
           DISPLAY "READ1 STATUS=" WS-STATUS " REC=[" SOME-REC "]".
           READ SOME-FILE.
           DISPLAY "READ2 STATUS=" WS-STATUS " REC=[" SOME-REC "]".
           READ SOME-FILE.
           DISPLAY "READ3(PASTEND) STATUS=" WS-STATUS.
           READ SOME-FILE.
           DISPLAY "READ4(PASTEND-AGAIN) STATUS=" WS-STATUS.

           OPEN INPUT SOME-FILE.
           DISPLAY "REOPEN-WHILE-OPEN STATUS=" WS-STATUS.

           CLOSE SOME-FILE.
           DISPLAY "CLOSE1 STATUS=" WS-STATUS.

           READ SOME-FILE.
           DISPLAY "READ-AFTER-CLOSE STATUS=" WS-STATUS.

           CLOSE SOME-FILE.
           DISPLAY "CLOSE2(ALREADY-CLOSED) STATUS=" WS-STATUS.

           STOP RUN.
