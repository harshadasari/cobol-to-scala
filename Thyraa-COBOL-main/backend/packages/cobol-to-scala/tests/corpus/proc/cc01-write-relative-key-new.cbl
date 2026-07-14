      * cc01: WRITE (not REWRITE) in RANDOM access mode with an
      * explicit RELATIVE KEY, placing NEW records at specific key
      * positions - distinct from REWRITE's update-existing semantics.
      * round-26 finding 2 implemented WRITE-key-gating (positive key
      * always succeeds, auto-extends); this probes whether the
      * resulting file has each record at the RIGHT position (not
      * just written in call order).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC01WRK.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "RELFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID    PIC 9(3).
           05  REC-VAL   PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY       PIC 9(4).
       01  WS-STATUS     PIC X(2).
       PROCEDURE DIVISION.
       MAIN-LOGIC.
           OPEN OUTPUT REL-FILE.
      * Write out of physical/key order: key 3 first, then 1, then 5
      * (skipping 2 and 4 - auto-extend with blanks per round-26).
           MOVE 3 TO WS-RKEY.
           MOVE 3 TO REC-ID.
           MOVE "THREE" TO REC-VAL.
           WRITE REL-REC
               INVALID KEY DISPLAY "WRITE3 INVALID"
               NOT INVALID KEY
                   DISPLAY "WRITE3 OK ST=" WS-STATUS
           END-WRITE.

           MOVE 1 TO WS-RKEY.
           MOVE 1 TO REC-ID.
           MOVE "ONE  " TO REC-VAL.
           WRITE REL-REC
               INVALID KEY DISPLAY "WRITE1 INVALID"
               NOT INVALID KEY
                   DISPLAY "WRITE1 OK ST=" WS-STATUS
           END-WRITE.

           MOVE 5 TO WS-RKEY.
           MOVE 5 TO REC-ID.
           MOVE "FIVE " TO REC-VAL.
           WRITE REL-REC
               INVALID KEY DISPLAY "WRITE5 INVALID"
               NOT INVALID KEY
                   DISPLAY "WRITE5 OK ST=" WS-STATUS
           END-WRITE.
           CLOSE REL-FILE.

      * Reopen I-O and READ by key, in a DIFFERENT order than
      * written, to prove each record landed at its OWN key
      * position, not write order.
           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ1 INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ1 ID=" REC-ID " VAL=" REC-VAL
           END-READ.

           MOVE 3 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ3 INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ3 ID=" REC-ID " VAL=" REC-VAL
           END-READ.

           MOVE 5 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ5 INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ5 ID=" REC-ID " VAL=" REC-VAL
           END-READ.

      * A slot never written (key 2) should read back blank, not
      * one of the other three records' content.
           MOVE 2 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ2 INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ2 ID=" REC-ID " VAL=" REC-VAL
           END-READ.

           CLOSE REL-FILE.
           STOP RUN.
