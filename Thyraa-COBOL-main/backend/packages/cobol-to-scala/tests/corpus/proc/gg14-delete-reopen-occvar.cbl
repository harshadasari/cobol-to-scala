      * gg14: round-30 finding 2 fixed occVar-persistence for a WRITE-then-
      * close-then-reopen cycle (ff13, an all-zero-byte record). Neither
      * ff13 nor dd08 (the original occvar-reopen-reload program) ever
      * combines that fix with DELETE - this checks that a record DELETEd
      * (cc05's own shape) still correctly reads back as a genuine gap
      * (status 23) after a CLOSE + REOPEN round trip (not just within the
      * same OPEN session), and that a WRITE to that same now-empty key
      * afterward correctly succeeds and is retrievable. NOTE: every READ
      * below deliberately pairs INVALID KEY with NOT INVALID KEY (cc06's
      * own idiom) to avoid a SEPARATE, unrelated parser bug gg15 isolates
      * (a READ using ONLY "NOT INVALID KEY" with no preceding "AT END"/
      * "INVALID KEY" clause silently drops its own body) - that finding
      * is reported standalone via gg15, not conflated with this program's
      * own occVar/DELETE focus.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG14DELRO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG14REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(3).
           05  REC-VAL     PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(4).
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY. MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL. WRITE REL-REC.
           MOVE 2 TO WS-RKEY. MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL. WRITE REL-REC.
           MOVE 3 TO WS-RKEY. MOVE 3 TO REC-ID.
           MOVE "CCCCC" TO REC-VAL. WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 2 TO WS-RKEY.
           DELETE REL-FILE RECORD
               INVALID KEY DISPLAY "DELETE-INVALID"
           END-DELETE.
           DISPLAY "DELETE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 2 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ2-GAP-AFTER-REOPEN ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ2-UNEXPECTED-FOUND ID=" REC-ID
           END-READ.

           MOVE 2 TO WS-RKEY. MOVE 22 TO REC-ID.
           MOVE "ZZZZZ" TO REC-VAL.
           WRITE REL-REC
               INVALID KEY DISPLAY "REWRITE-GAP-INVALID"
           END-WRITE.
           DISPLAY "WRITE-INTO-GAP ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           MOVE 2 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY DISPLAY "READ2-FINAL-INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ2-FINAL ST=" WS-STATUS " ID=" REC-ID
                       " VAL=" REC-VAL
           END-READ.

           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY DISPLAY "READ1-FINAL-INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ1-FINAL ST=" WS-STATUS " ID=" REC-ID
                       " VAL=" REC-VAL
           END-READ.

           MOVE 3 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY DISPLAY "READ3-FINAL-INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ3-FINAL ST=" WS-STATUS " ID=" REC-ID
                       " VAL=" REC-VAL
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
