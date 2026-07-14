      * Adversarial (round 26): a VALID (READ-before-every-DELETE)
      * alternating-delete pattern across 5 records - deletes records
      * 2 and 4, keeping 1/3/5, each preceded by its own proper READ.
      * This is the "legitimate" counterpart to bb03's illegal
      * double-delete: a solid regression guard confirming round-25's
      * posVar-rewind logic (DELETE decrements posVar so the next
      * sequential READ continues correctly) holds up across MULTIPLE
      * deletes interspersed with reads, not just a single one.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB14ALTDEL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB14FILE.DAT"
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
           MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE SOME-REC.
           MOVE 2 TO REC-ID. MOVE "BBBBB" TO REC-VAL. WRITE SOME-REC.
           MOVE 3 TO REC-ID. MOVE "CCCCC" TO REC-VAL. WRITE SOME-REC.
           MOVE 4 TO REC-ID. MOVE "DDDDD" TO REC-VAL. WRITE SOME-REC.
           MOVE 5 TO REC-ID. MOVE "EEEEE" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           DISPLAY "READ ID=" REC-ID.
           READ SOME-FILE.
           DISPLAY "READ ID=" REC-ID.
           DELETE SOME-FILE.
           DISPLAY "DELETED ID=2 STATUS=" WS-STATUS.
           READ SOME-FILE.
           DISPLAY "READ ID=" REC-ID.
           READ SOME-FILE.
           DISPLAY "READ ID=" REC-ID.
           DELETE SOME-FILE.
           DISPLAY "DELETED ID=4 STATUS=" WS-STATUS.
           READ SOME-FILE.
           DISPLAY "READ ID=" REC-ID.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           PERFORM UNTIL WS-EOF = "Y"
               READ SOME-FILE
                   AT END MOVE "Y" TO WS-EOF
                   NOT AT END DISPLAY "SURV ID=" REC-ID " VAL=" REC-VAL
               END-READ
           END-PERFORM.
           CLOSE SOME-FILE.
           STOP RUN.
