      * dd11: OCCURS DEPENDING ON (ODO) dynamic sizing combined with
      * round-25-27's new RELATIVE-file I/O - an FD record whose table
      * portion is variable-length (driven by REC-COUNT) is WRITTEn at
      * one live count, then REWRITTEN at a DIFFERENT live count, then
      * read back - a combination no round-25/26/27 corpus program
      * exercises (their own ODO probes are all plain WORKING-STORAGE;
      * their own RELATIVE-file probes never involve an ODO table).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD11ODOFILE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "DD11REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
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
           MOVE 2 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           READ REL-FILE.
           DISPLAY "BEFORE-REWRITE COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.
           MOVE 4 TO REC-COUNT.
           MOVE "CCC" TO REC-ITEM(1).
           MOVE "DDD" TO REC-ITEM(2).
           MOVE "EEE" TO REC-ITEM(3).
           MOVE "FFF" TO REC-ITEM(4).
           REWRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "AFTER-REWRITE COUNT=" REC-COUNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.
           CLOSE REL-FILE.
           STOP RUN.
