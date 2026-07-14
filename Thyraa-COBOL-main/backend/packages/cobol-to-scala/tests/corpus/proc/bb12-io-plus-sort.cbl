      * Adversarial (round 26): does round-25's brand-new OPEN I-O buffer
      * machinery (bufVar/posVar/iteratorVar per FD file) interact badly
      * with the completely separate SD/SORT machinery when BOTH are used
      * in the same program (different files)? Opens one file I-O and
      * REWRITEs a record, then separately SORTs an unrelated file via
      * INPUT/OUTPUT PROCEDURE, then goes back and confirms the I-O file's
      * own REWRITE still landed correctly (no shared state clobbered).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB12IOSORT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB12FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
           SELECT SORT-FILE ASSIGN TO "BB12SORT.DAT".
           SELECT SORT-OUT ASSIGN TO "BB12SORTOUT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       SD  SORT-FILE.
       01  SORT-REC.
           05 SORT-KEY PIC 9(3).
       FD  SORT-OUT.
       01  SORT-OUT-REC PIC 9(3).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       01 WS-EOF    PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           MOVE "ZZZZZ" TO REC-VAL.
           REWRITE SOME-REC.
           CLOSE SOME-FILE.

           SORT SORT-FILE ON ASCENDING KEY SORT-KEY
               INPUT PROCEDURE IS FEED-SORT
               OUTPUT PROCEDURE IS DRAIN-SORT.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "AFTER-SORT REREAD VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.

       FEED-SORT.
           MOVE 30 TO SORT-KEY. RELEASE SORT-REC.
           MOVE 10 TO SORT-KEY. RELEASE SORT-REC.
           MOVE 20 TO SORT-KEY. RELEASE SORT-REC.

       DRAIN-SORT.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN SORT-FILE AT END MOVE "Y" TO WS-EOF
               NOT AT END DISPLAY "SORTED=" SORT-KEY
           END-PERFORM.
