      * Adversarial (round 26): unlike DELETE, REWRITE never touches
      * posVar at all - so a SECOND REWRITE issued right after the first,
      * with no intervening READ, still passes the `posVar > 0` guard and
      * silently succeeds a second time (real COBOL requires a fresh READ
      * before EACH REWRITE for sequential I-O; a second one without it is
      * FILE STATUS 43, and the record is NOT changed by that second,
      * invalid REWRITE). Checks whether the SECOND rewrite's new value
      * incorrectly lands in the file.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB04DBLRW.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB04FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE SOME-REC.
           MOVE 2 TO REC-ID. MOVE "BBBBB" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           MOVE "XXXXX" TO REC-VAL.
           REWRITE SOME-REC.
           DISPLAY "AFTER-REWRITE-1 STATUS=" WS-STATUS.
           MOVE "YYYYY" TO REC-VAL.
           REWRITE SOME-REC.
           DISPLAY "AFTER-REWRITE-2 STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "REC1 ID=" REC-ID " VAL=" REC-VAL.
           READ SOME-FILE.
           DISPLAY "REC2 ID=" REC-ID " VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.
