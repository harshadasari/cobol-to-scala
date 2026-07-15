      * dd07: DELETE records from a SEQUENTIAL-access RELATIVE file,
      * CLOSE, then re-OPEN INPUT and use that file's SURVIVING records
      * to feed a SORT's own INPUT PROCEDURE (RELEASE-ing each read
      * record into the sort work file). Probes whether a deleted
      * (removed) slot leaves any gap/blank/corrupted record behind
      * that the subsequent SORT would see - no prior corpus program
      * combines DELETE with SORT reading the SAME (post-delete)
      * RELATIVE file as its own data source.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD07DELSORT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "DD07REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
           SELECT SORT-WORK ASSIGN TO "DD07SORTWK".
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID    PIC 9(3).
           05  REC-VAL   PIC X(5).
       SD  SORT-WORK.
       01  SORT-REC.
           05  S-ID      PIC 9(3).
           05  S-VAL     PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY       PIC 9(3) VALUE 0.
       01  WS-STATUS     PIC X(2).
       01  WS-EOF        PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID. MOVE "EEEEE" TO REC-VAL. WRITE REL-REC.
           MOVE 2 TO REC-ID. MOVE "DDDDD" TO REC-VAL. WRITE REL-REC.
           MOVE 3 TO REC-ID. MOVE "CCCCC" TO REC-VAL. WRITE REL-REC.
           MOVE 4 TO REC-ID. MOVE "BBBBB" TO REC-VAL. WRITE REL-REC.
           MOVE 5 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           READ REL-FILE.
           READ REL-FILE.
           DELETE REL-FILE.
           DISPLAY "DELETE-REC2 STATUS=" WS-STATUS.
           READ REL-FILE.
           READ REL-FILE.
           DELETE REL-FILE.
           DISPLAY "DELETE-REC4 STATUS=" WS-STATUS.
           CLOSE REL-FILE.

           SORT SORT-WORK ASCENDING KEY S-ID
               INPUT PROCEDURE FEED-SORT
               OUTPUT PROCEDURE SHOW-SORT.
           STOP RUN.
       FEED-SORT.
           OPEN INPUT REL-FILE.
           PERFORM UNTIL WS-EOF = "Y"
               READ REL-FILE
                   AT END MOVE "Y" TO WS-EOF
                   NOT AT END
                       MOVE REC-ID TO S-ID
                       MOVE REC-VAL TO S-VAL
                       RELEASE SORT-REC
               END-READ
           END-PERFORM.
           CLOSE REL-FILE.
       SHOW-SORT.
           MOVE "N" TO WS-EOF.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN SORT-WORK AT END MOVE "Y" TO WS-EOF
               NOT AT END
                   DISPLAY "SORTED ID=" S-ID " VAL=" S-VAL
           END-PERFORM.
       END PROGRAM DD07DELSORT.
