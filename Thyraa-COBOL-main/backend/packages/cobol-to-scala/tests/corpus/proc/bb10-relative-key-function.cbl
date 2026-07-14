      * Adversarial (round 26): round-25's own doc comment explicitly
      * flags "RANDOM/DYNAMIC-access via an explicit RELATIVE/RECORD KEY
      * (rather than 'whatever was just READ') is not modeled - no corpus
      * program exercises it" as out of scope. This exercises exactly
      * that gap, but with the RELATIVE KEY computed via arithmetic
      * (FUNCTION MOD) rather than a literal, to check whether READ
      * RANDOM at least reads SOME record correctly (sequentially, by
      * coincidence) or silently returns the wrong one / a bogus status.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB10RELKEY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB10FILE.DAT"
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
       01 WS-BASE   PIC 9(3) VALUE 8.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE SOME-REC.
           MOVE 2 TO REC-ID. MOVE "BBBBB" TO REC-VAL. WRITE SOME-REC.
           MOVE 3 TO REC-ID. MOVE "CCCCC" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           COMPUTE WS-RKEY = FUNCTION MOD(WS-BASE, 3) + 1.
           DISPLAY "COMPUTED-KEY=" WS-RKEY.
           READ SOME-FILE
               INVALID KEY DISPLAY "READ-INVALID-KEY"
               NOT INVALID KEY DISPLAY "OK ID=" REC-ID " VAL=" REC-VAL
           END-READ.
           DISPLAY "STATUS=" WS-STATUS.
           CLOSE SOME-FILE.
           STOP RUN.
