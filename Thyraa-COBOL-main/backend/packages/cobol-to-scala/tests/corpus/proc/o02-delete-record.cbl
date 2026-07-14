      * Adversarial (round 25): DELETE has NEVER been exercised by any of
      * the 332 pre-existing corpus programs either - the exact sibling gap
      * to o01's REWRITE probe. Writes 3 records to a RELATIVE file, opens
      * I-O, READs and DELETEs the middle one, then reopens INPUT and reads
      * every remaining record to see whether the file now has 2 records
      * (real cobc) or still silently has all 3 (an engine whose DELETE is a
      * no-op).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O02DELETE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "O02FILE.DAT"
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
       01 WS-EOF    PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL.
           WRITE SOME-REC.
           MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL.
           WRITE SOME-REC.
           MOVE 3 TO REC-ID.
           MOVE "CCCCC" TO REC-VAL.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           READ SOME-FILE.
           DELETE SOME-FILE.
           DISPLAY "AFTER-DELETE STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           PERFORM UNTIL WS-EOF = "Y"
               READ SOME-FILE
                   AT END MOVE "Y" TO WS-EOF
                   NOT AT END
                       DISPLAY "REC ID=" REC-ID " VAL=" REC-VAL
               END-READ
           END-PERFORM.
           CLOSE SOME-FILE.
           STOP RUN.
