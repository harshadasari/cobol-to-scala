      * gg13: fresh combination - START (positioning, bb09/cc03's own
      * feature) on a DYNAMIC-access RELATIVE file whose record is
      * ODO-bearing (round-30 finding 1's own fixed-width-padding fix),
      * never combined before (searched: no corpus program combines
      * START with an OCCURS...DEPENDING ON record). Writes 4 ODO
      * records with varying live counts, STARTs at key >= 2, then reads
      * NEXT twice - checking that START's positioning plus round-30's
      * max-width padding cooperate correctly for READ NEXT over an ODO
      * record.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG13STODO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG13REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-COUNT   PIC 9(1).
           05  REC-ITEM    PIC X(3) OCCURS 1 TO 3 TIMES
                               DEPENDING ON REC-COUNT.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE 1 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           WRITE REL-REC.

           MOVE 2 TO WS-RKEY.
           MOVE 2 TO REC-COUNT.
           MOVE "BBB" TO REC-ITEM(1).
           MOVE "CCC" TO REC-ITEM(2).
           WRITE REL-REC.

           MOVE 3 TO WS-RKEY.
           MOVE 3 TO REC-COUNT.
           MOVE "DDD" TO REC-ITEM(1).
           MOVE "EEE" TO REC-ITEM(2).
           MOVE "FFF" TO REC-ITEM(3).
           WRITE REL-REC.

           MOVE 4 TO WS-RKEY.
           MOVE 1 TO REC-COUNT.
           MOVE "GGG" TO REC-ITEM(1).
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           MOVE 2 TO WS-RKEY.
           START REL-FILE KEY IS GREATER THAN OR EQUAL WS-RKEY
               INVALID KEY DISPLAY "START-FAILED"
           END-START.
           DISPLAY "AFTER-START ST=" WS-STATUS.

           READ REL-FILE NEXT RECORD.
           DISPLAY "NEXT1 ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE NEXT RECORD.
           DISPLAY "NEXT2 ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           CLOSE REL-FILE.
           STOP RUN.
