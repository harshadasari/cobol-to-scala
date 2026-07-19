      * ii07: round-32 finding 3 (hh03) verified WRITE/READ of a table-of-
      * groups RELATIVE-file record, but never REWRITE of one. This
      * reuses hh03's exact record shape (REC-ROW OCCURS 2 TIMES, each
      * row a signed ROW-QTY + plain ROW-TAG) and probes whether
      * generateKeyedRewriteStatement's own finalTextExpr (built through
      * the SAME writeRecordPlan/groupChildConstructorExpr machinery
      * WRITE uses) correctly reuses the round-32 table-of-groups
      * constructor path too, or whether REWRITE's own code path was
      * left on some older, table-of-groups-unaware convention.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II07TBLREWR.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "II07REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ROW     OCCURS 2 TIMES.
               10  ROW-QTY     PIC S9(3).
               10  ROW-TAG     PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE 1 TO REC-ID.
           MOVE -12 TO ROW-QTY(1).
           MOVE "AAA" TO ROW-TAG(1).
           MOVE 34 TO ROW-QTY(2).
           MOVE "BBB" TO ROW-TAG(2).
           WRITE REL-REC INVALID KEY DISPLAY "W1 FAIL".
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO WS-RKEY.
           MOVE 2 TO REC-ID.
           MOVE -1 TO ROW-QTY(1).
           MOVE "CCC" TO ROW-TAG(1).
           MOVE 99 TO ROW-QTY(2).
           MOVE "DDD" TO ROW-TAG(2).
           WRITE REL-REC INVALID KEY DISPLAY "W2 FAIL".
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE INVALID KEY DISPLAY "R1 FAIL".
           DISPLAY "READ1-BEFORE ST=" WS-STATUS " ID=" REC-ID.

           MOVE 100 TO ROW-QTY(1).
           MOVE "ZZZ" TO ROW-TAG(1).
           MOVE -100 TO ROW-QTY(2).
           MOVE "YYY" TO ROW-TAG(2).
           REWRITE REL-REC INVALID KEY DISPLAY "RW1 FAIL".
           DISPLAY "REWRITE1 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE INVALID KEY DISPLAY "R2 FAIL".
           DISPLAY "READ-KEY1 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
               DISPLAY "  QTY(" WS-I ")=" ROW-QTY(WS-I)
                   " TAG(" WS-I ")=" ROW-TAG(WS-I)
           END-PERFORM.

           MOVE 2 TO WS-RKEY.
           READ REL-FILE INVALID KEY DISPLAY "R3 FAIL".
           DISPLAY "READ-KEY2 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
               DISPLAY "  QTY(" WS-I ")=" ROW-QTY(WS-I)
                   " TAG(" WS-I ")=" ROW-TAG(WS-I)
           END-PERFORM.
           CLOSE REL-FILE.
           STOP RUN.
