      * gg12: gg02 already probes round-30 finding 1's ODO max-width
      * padding fix under REWRITE via RANDOM (keyed) access. This checks
      * the OTHER REWRITE code path - plain SEQUENTIAL access, addressed
      * by read position (posVar/hasCurrentVar), not RELATIVE KEY
      * (generateRewriteStatement's non-keyed branch) - REWRITE-ing the
      * FIRST of two ODO records with a SMALLER live count than it was
      * originally written with, then continuing the sequential read to
      * confirm the second (untouched) record's own boundary/padding is
      * unaffected.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG12ODOSEQ.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG12REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-COUNT   PIC 9(1).
           05  REC-ITEM    PIC X(3) OCCURS 1 TO 4 TIMES
                               DEPENDING ON REC-COUNT.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 4 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           MOVE "CCC" TO REC-ITEM(3).
           MOVE "DDD" TO REC-ITEM(4).
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO REC-COUNT.
           MOVE "EEE" TO REC-ITEM(1).
           MOVE "FFF" TO REC-ITEM(2).
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1-BEFORE ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           MOVE 1 TO REC-COUNT.
           MOVE "ZZZ" TO REC-ITEM(1).
           REWRITE REL-REC.
           DISPLAY "REWRITE1 ST=" WS-STATUS.

           READ REL-FILE.
           DISPLAY "READ2-AFTER ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "REREAD1 ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.
           CLOSE REL-FILE.
           STOP RUN.
