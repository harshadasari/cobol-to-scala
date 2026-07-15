      * gg09: fresh combination - INSPECT TALLYING and INSPECT REPLACING
      * both applied directly to a record field fetched via a KEYED
      * (RANDOM access) RELATIVE-file READ, then the mutated field is
      * REWRITEen back to the SAME record and re-read to confirm the
      * change persisted through the file's own codec path (not just an
      * in-memory WORKING-STORAGE mutation, the only shape ever tested
      * for INSPECT before).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG09INSKY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG09REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-TEXT    PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-COUNT        PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE "AABAABAAB " TO REC-TEXT.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ-BEFORE ST=" WS-STATUS " TEXT=[" REC-TEXT "]".

           INSPECT REC-TEXT TALLYING WS-COUNT FOR ALL "A".
           DISPLAY "TALLY-A=" WS-COUNT.

           INSPECT REC-TEXT REPLACING ALL "A" BY "Z".
           DISPLAY "AFTER-REPLACE=[" REC-TEXT "]".

           REWRITE REL-REC.
           DISPLAY "REWRITE ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ-AFTER ST=" WS-STATUS " TEXT=[" REC-TEXT "]".
           CLOSE REL-FILE.
           STOP RUN.
