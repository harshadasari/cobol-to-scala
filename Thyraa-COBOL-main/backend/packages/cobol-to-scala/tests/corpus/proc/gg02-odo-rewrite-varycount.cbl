      * gg02: round-30 finding 1 fixed ODO RELATIVE-file WRITE to always
      * pad to the table's declared MAXIMUM byte width regardless of the
      * live (DEPENDING ON) count active at WRITE time, verified only via
      * plain sequential WRITE-then-WRITE-then-sequential-READ (ff01). This
      * probes the RANDOM/keyed-access angle the fix's own writeup never
      * exercised: REWRITE of an already-written ODO record with a
      * DIFFERENT (smaller) live count than its original WRITE, addressed
      * by RELATIVE KEY, with an UNTOUCHED neighboring record (a different
      * key, its own different live count) read back afterward to confirm
      * the REWRITE didn't corrupt the neighboring max-width slot's own
      * padding/boundaries.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG02ODORW.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG02REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-COUNT   PIC 9(1).
           05  REC-ITEM    PIC X(3) OCCURS 1 TO 5 TIMES
                               DEPENDING ON REC-COUNT.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE 2 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           WRITE REL-REC.
           DISPLAY "WRITE-KEY1 ST=" WS-STATUS.

           MOVE 2 TO WS-RKEY.
           MOVE 5 TO REC-COUNT.
           MOVE "CCC" TO REC-ITEM(1).
           MOVE "DDD" TO REC-ITEM(2).
           MOVE "EEE" TO REC-ITEM(3).
           MOVE "FFF" TO REC-ITEM(4).
           MOVE "GGG" TO REC-ITEM(5).
           WRITE REL-REC.
           DISPLAY "WRITE-KEY2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ-KEY1-BEFORE ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           MOVE 1 TO REC-COUNT.
           MOVE "ZZZ" TO REC-ITEM(1).
           REWRITE REL-REC.
           DISPLAY "REWRITE-KEY1 ST=" WS-STATUS.

           MOVE 2 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ-KEY2-AFTER ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ-KEY1-AFTER ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           CLOSE REL-FILE.
           STOP RUN.
