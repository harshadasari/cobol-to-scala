      * Adversarial (round 26): ACCESS MODE RANDOM REWRITE with an
      * explicit RELATIVE KEY that points at a record NEVER read (key=99,
      * only 2 records exist) - real cobc raises the INVALID KEY
      * condition since RANDOM access re-addresses by key, not by "last
      * READ position". This generator's I-O model has no real RANDOM
      * addressing at all (round-25's own doc comment: "RANDOM/DYNAMIC
      * access via an explicit RELATIVE/RECORD KEY is not modeled"), so
      * REWRITE here just checks posVar (whatever the last SEQUENTIAL
      * READ happened to leave it at) rather than the key - checking
      * whether the INVALID KEY branch fires correctly or is silently
      * skipped/misrouted.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB13INVKEY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB13FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
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
           MOVE 99 TO WS-RKEY.
           MOVE 99 TO REC-ID.
           MOVE "NOPE!" TO REC-VAL.
           REWRITE SOME-REC
               INVALID KEY DISPLAY "REWRITE-INVALID-KEY"
               NOT INVALID KEY DISPLAY "REWRITE-SUCCEEDED"
           END-REWRITE.
           DISPLAY "STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "REC1 ID=" REC-ID " VAL=" REC-VAL.
           READ SOME-FILE.
           DISPLAY "REC2 ID=" REC-ID " VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.
