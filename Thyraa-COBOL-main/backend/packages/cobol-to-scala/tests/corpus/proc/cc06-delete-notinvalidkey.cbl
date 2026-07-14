      * cc06: a plain DELETE with BOTH the INVALID KEY and the
      * (fully legal, standard) NOT INVALID KEY clause, in the
      * ordinary SEQUENTIAL-access-with-prior-READ shape round-25/26
      * already established works for the INVALID-KEY-only case.
      * Isolates whether parseDeleteStatement recognizes NOT INVALID
      * KEY at all (READ/REWRITE/WRITE/START all do, per round-26).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC06DELN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "RELFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
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
           MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL.
           WRITE REL-REC.
           MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
      * Prior READ makes this a VALID delete - NOT INVALID KEY
      * should fire, and ONLY once, with the real post-delete
      * status.
           READ REL-FILE
               AT END DISPLAY "READ AT END"
           END-READ.
           DELETE REL-FILE RECORD
               INVALID KEY
                   DISPLAY "DELETE INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "DELETE NOTINVALID ST=" WS-STATUS
           END-DELETE.
           DISPLAY "AFTER-DELETE STATUS=" WS-STATUS.

           MOVE 2 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ2 INVALID"
               NOT INVALID KEY
                   DISPLAY "READ2 ID=" REC-ID " VAL=" REC-VAL
           END-READ.

           CLOSE REL-FILE.
           STOP RUN.
