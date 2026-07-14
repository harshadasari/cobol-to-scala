      * Adversarial (round 25): REWRITE has NEVER been exercised by any of
      * the 332 pre-existing corpus programs across 24 rounds. This checks
      * the most basic possible shape - OPEN I-O a RELATIVE file, REWRITE
      * one record's field with a new value (set directly via MOVE, not
      * dependent on a prior READ's own correctness), CLOSE, then reopen
      * INPUT and read both records back to see whether the REWRITE actually
      * persisted the new value to the file the way real cobc's REWRITE
      * does, or silently left the original value in place.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O01REWRITE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "O01FILE.DAT"
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
           MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL.
           WRITE SOME-REC.
           MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           MOVE "ZZZZZ" TO REC-VAL.
           REWRITE SOME-REC.
           DISPLAY "AFTER-REWRITE STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "REREAD1 ID=" REC-ID " VAL=" REC-VAL.
           READ SOME-FILE.
           DISPLAY "REREAD2 ID=" REC-ID " VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.
