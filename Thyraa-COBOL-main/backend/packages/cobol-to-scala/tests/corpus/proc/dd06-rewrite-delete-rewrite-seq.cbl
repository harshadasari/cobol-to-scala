      * dd06: REWRITE, then DELETE, then REWRITE of a DIFFERENT record,
      * all in one sequential OPEN I-O "transaction" over a 5-record
      * RELATIVE file, each preceded by its own READ. Round-25 built
      * REWRITE/DELETE separately; round-26 fixed the invalid-usage
      * (no-prior-READ) edge for each independently - but no prior
      * corpus program interleaves a REWRITE, a DELETE, and a SECOND,
      * LATER REWRITE of a record that is NOT the one just
      * read/mutated, in the same run, checking that posVar/hasCurrentVa
      * bookkeeping (round-25/26) stays correct across a MIXED
      * sequence, not just repeats of the SAME operation.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD06SEQ.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "DD06FILE.DAT"
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
           MOVE 2 TO REC-ID. MOVE "BBBBB" TO REC-VAL. WRITE SOME-REC.
           MOVE 3 TO REC-ID. MOVE "CCCCC" TO REC-VAL. WRITE SOME-REC.
           MOVE 4 TO REC-ID. MOVE "DDDDD" TO REC-VAL. WRITE SOME-REC.
           MOVE 5 TO REC-ID. MOVE "EEEEE" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
      * READ rec 1, REWRITE it.
           READ SOME-FILE.
           MOVE "ZZZZZ" TO REC-VAL.
           REWRITE SOME-REC.
           DISPLAY "REWRITE1 STATUS=" WS-STATUS.
      * READ rec 2, DELETE it.
           READ SOME-FILE.
           DELETE SOME-FILE.
           DISPLAY "DELETE2 STATUS=" WS-STATUS.
      * READ rec 3, REWRITE a DIFFERENT record (rec 4, not rec 3).
           READ SOME-FILE.
           READ SOME-FILE.
           MOVE "YYYYY" TO REC-VAL.
           REWRITE SOME-REC.
           DISPLAY "REWRITE4 STATUS=" WS-STATUS.
      * A stray REWRITE with no intervening READ - must fail 43.
           REWRITE SOME-REC.
           DISPLAY "REWRITE-STALE STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           PERFORM 5 TIMES
               READ SOME-FILE
                   AT END DISPLAY "EOF"
                   NOT AT END
                       DISPLAY "REC ID=" REC-ID " VAL=" REC-VAL
                           " ST=" WS-STATUS
               END-READ
           END-PERFORM.
           CLOSE SOME-FILE.
           STOP RUN.
