      * Adversarial (round 26): OPEN I-O ... CLOSE ... OPEN I-O AGAIN (same
      * file, same run) - generateOpen's I-O branch reloads bufVar fresh
      * from disk and resets posVar to 0 every time it runs, and
      * generateClose flushes+nulls bufVar first. This checks that a
      * SECOND OPEN I-O of the same file within one run correctly picks up
      * the FIRST open's REWRITE (not stale in-memory state left over from
      * before the first CLOSE, and not the ORIGINAL on-disk content as if
      * the first REWRITE never happened), then rewrites it AGAIN, and a
      * third INPUT-mode open confirms both rewrites landed durably.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB05REOPEN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB05FILE.DAT"
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
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           DISPLAY "FIRST-OPEN-READ VAL=" REC-VAL.
           MOVE "FIRST" TO REC-VAL.
           REWRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           DISPLAY "SECOND-OPEN-READ VAL=" REC-VAL.
           MOVE "SECND" TO REC-VAL.
           REWRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "FINAL-READ VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.
