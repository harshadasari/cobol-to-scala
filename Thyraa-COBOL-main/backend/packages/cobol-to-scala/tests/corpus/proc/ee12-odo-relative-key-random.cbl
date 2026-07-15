      * ee12: OCCURS DEPENDING ON (ODO) combined with EXPLICIT
      * RELATIVE-KEY RANDOM-access addressing - dd11 (round-28) only
      * ever exercised ODO combined with SEQUENTIAL-access RELATIVE
      * files (no explicit key, just READ/REWRITE in file order); this
      * writes an ODO record at one specific key position (RANDOM
      * access, WRITE with an explicit key), then a second, differently-
      * sized ODO record at another key, then reads BOTH back by their
      * own keys (not sequentially) - the keyed WRITE/READ codegen
      * (round 25-27's occVar/bufVar machinery) has never been exercised
      * with a variable-length (ODO) record before.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE12ODORELKEY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "EE12REL.DAT"
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
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 3 TO WS-RKEY.
           MOVE 2 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           WRITE REL-REC.
           DISPLAY "WRITE3 ST=" WS-STATUS.

           MOVE 1 TO WS-RKEY.
           MOVE 4 TO REC-COUNT.
           MOVE "CCC" TO REC-ITEM(1).
           MOVE "DDD" TO REC-ITEM(2).
           MOVE "EEE" TO REC-ITEM(3).
           MOVE "FFF" TO REC-ITEM(4).
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           MOVE 3 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ3 ST=" WS-STATUS " COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           CLOSE REL-FILE.
           STOP RUN.
