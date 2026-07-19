      * hh03: round-30/31 (ff09/ff14/gg05) verified a signed DISPLAY field
      * combined with an OCCURS table in a RELATIVE file, but only for a
      * FLAT table of signed elementary items directly under the 01
      * record (gg05's own shape). This probes one level further: a
      * table of GROUPS (each occurrence itself a group with a signed
      * child AND a plain-alphanumeric sibling child), addressed by
      * subscript - a shape writeRecordPlan/groupChildConstructorExpr's
      * allowTables path has never been exercised against (a table child
      * that is itself a GROUP, not a bare elementary signed field).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH03TBLGRP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "HH03REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
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
           MOVE 1 TO REC-ID.
           MOVE -12 TO ROW-QTY(1).
           MOVE "AAA" TO ROW-TAG(1).
           MOVE 34 TO ROW-QTY(2).
           MOVE "BBB" TO ROW-TAG(2).
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO REC-ID.
           MOVE -1 TO ROW-QTY(1).
           MOVE "CCC" TO ROW-TAG(1).
           MOVE 99 TO ROW-QTY(2).
           MOVE "DDD" TO ROW-TAG(2).
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
               DISPLAY "  QTY(" WS-I ")=" ROW-QTY(WS-I)
                   " TAG(" WS-I ")=" ROW-TAG(WS-I)
           END-PERFORM.

           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
               DISPLAY "  QTY(" WS-I ")=" ROW-QTY(WS-I)
                   " TAG(" WS-I ")=" ROW-TAG(WS-I)
           END-PERFORM.

           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
