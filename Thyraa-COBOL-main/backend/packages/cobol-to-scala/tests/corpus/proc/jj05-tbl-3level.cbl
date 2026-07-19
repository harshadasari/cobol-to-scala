      * jj05: round-33 finding 2 (ii06) converted a two-level table-of-
      * groups-containing-a-table RELATIVE-file WRITE crash into an honest
      * text-unsupported decline. This probes a THREE-level nesting (a
      * table of groups, each containing a table of groups, each
      * containing yet another plain table) to confirm the decline still
      * triggers cleanly at the deeper level rather than crashing
      * differently (e.g. a stack overflow in the recursive constructor-
      * builder, or a different unguarded fallback further down the
      * writeRecordPlan chain).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ05TBL3L.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "JJ05REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID       PIC 9(2).
           05  REC-OUTER    OCCURS 2 TIMES.
               10  OUTER-TAG    PIC X(2).
               10  REC-MIDDLE   OCCURS 2 TIMES.
                   15  MID-TAG      PIC X(2).
                   15  REC-INNER    PIC S9(2) OCCURS 2 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE "A1" TO OUTER-TAG(1).
           MOVE "B1" TO MID-TAG(1, 1).
           MOVE 1 TO REC-INNER(1, 1, 1).
           MOVE 2 TO REC-INNER(1, 1, 2).
           MOVE "B2" TO MID-TAG(1, 2).
           MOVE 3 TO REC-INNER(1, 2, 1).
           MOVE 4 TO REC-INNER(1, 2, 2).
           MOVE "A2" TO OUTER-TAG(2).
           MOVE "C1" TO MID-TAG(2, 1).
           MOVE 5 TO REC-INNER(2, 1, 1).
           MOVE 6 TO REC-INNER(2, 1, 2).
           MOVE "C2" TO MID-TAG(2, 2).
           MOVE 7 TO REC-INNER(2, 2, 1).
           MOVE 8 TO REC-INNER(2, 2, 2).
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID.
           DISPLAY "  OUTER1=" OUTER-TAG(1) " OUTER2=" OUTER-TAG(2).
           DISPLAY "  MID(1,1)=" MID-TAG(1, 1)
               " INNER(1,1,1)=" REC-INNER(1, 1, 1)
               " INNER(1,1,2)=" REC-INNER(1, 1, 2).
           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
