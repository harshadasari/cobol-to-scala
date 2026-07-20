      * oo05 (round 39): round-38 finding 3 (nn07) fixed FILE STATUS for
      * READ-after-CLOSE (47), reopen-while-open (41), double-CLOSE (42),
      * and second-consecutive-past-end READ (46). This probe pressure-
      * tests OTHER lifecycle transitions round 38 never tried, on a
      * RELATIVE file opened I-O with DYNAMIC access (this sandbox's cobc
      * build has no INDEXED-file support at all - confirmed via a direct
      * compile attempt, "compiler is not configured to support
      * ORGANIZATION INDEXED" - so RELATIVE is used instead, matching the
      * round-25/26 bb* REWRITE/DELETE campaign's own established
      * convention): WRITE after CLOSE, REWRITE after CLOSE, and DELETE
      * after CLOSE.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO05POSTCLOSE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "OO05FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REL-DATA PIC X(8).
       WORKING-STORAGE SECTION.
       01  WS-RKEY PIC 9(2) VALUE 0.
       01  WS-STATUS PIC XX VALUE "00".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE "FIRSTREC" TO REL-DATA.
           WRITE REL-REC.
           MOVE 2 TO WS-RKEY.
           MOVE "SECNDREC" TO REL-DATA.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ1 STATUS=" WS-STATUS.
           CLOSE REL-FILE.
           DISPLAY "CLOSE1 STATUS=" WS-STATUS.

           MOVE 3 TO WS-RKEY.
           MOVE "THIRDREC" TO REL-DATA.
           WRITE REL-REC.
           DISPLAY "WRITE-AFTER-CLOSE STATUS=" WS-STATUS.

           MOVE "CHANGED1" TO REL-DATA.
           REWRITE REL-REC.
           DISPLAY "REWRITE-AFTER-CLOSE STATUS=" WS-STATUS.

           DELETE REL-FILE.
           DISPLAY "DELETE-AFTER-CLOSE STATUS=" WS-STATUS.

           STOP RUN.
