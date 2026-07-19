      * ii06: round-32 finding 3 (hh03) extended groupChildConstructorExpr
      * to handle a table of GROUPS (one level of table nesting). Its
      * own companion function groupChildConstructorExprIndexed
      * explicitly declines (returns null, a documented decision, not an
      * oversight) whenever a table-of-groups row itself contains ANOTHER
      * OCCURS table - "a table nested inside a table, two independent
      * OCCURS dimensions ... not exercised by any corpus program". This
      * probes that exact two-level-nesting shape for real: REC-ROW
      * OCCURS 2 TIMES, each row containing ROW-TAG (plain) AND ROW-ITEM
      * PIC S9(3)V99 OCCURS 3 TIMES (a second, independent OCCURS
      * dimension) in a RELATIVE file record. Since ctorArgs comes back
      * null and this record has no non-DISPLAY field (all signed/plain
      * DISPLAY), writeRecordPlan falls through to the pre-existing
      * ODO/group text-mode path rather than declining outright -
      * whether that older text convention actually round-trips this
      * two-level shape correctly (or silently corrupts it) is the
      * question this probes.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II06NESTTBL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "II06REL.DAT"
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
               10  ROW-TAG     PIC X(2).
               10  ROW-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       01  WS-J            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE "AA" TO ROW-TAG(1).
           MOVE 12.34 TO ROW-ITEM(1, 1).
           MOVE -5.67 TO ROW-ITEM(1, 2).
           MOVE 0.01 TO ROW-ITEM(1, 3).
           MOVE "BB" TO ROW-TAG(2).
           MOVE -8.90 TO ROW-ITEM(2, 1).
           MOVE 1.11 TO ROW-ITEM(2, 2).
           MOVE -2.22 TO ROW-ITEM(2, 3).
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO REC-ID.
           MOVE "CC" TO ROW-TAG(1).
           MOVE 3.30 TO ROW-ITEM(1, 1).
           MOVE 4.40 TO ROW-ITEM(1, 2).
           MOVE -5.50 TO ROW-ITEM(1, 3).
           MOVE "DD" TO ROW-TAG(2).
           MOVE -6.60 TO ROW-ITEM(2, 1).
           MOVE 7.70 TO ROW-ITEM(2, 2).
           MOVE -8.80 TO ROW-ITEM(2, 3).
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
               DISPLAY "  TAG(" WS-I ")=" ROW-TAG(WS-I)
               PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 3
                   DISPLAY "    ITEM(" WS-I "," WS-J ")="
                       ROW-ITEM(WS-I, WS-J)
               END-PERFORM
           END-PERFORM.

           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 2
               DISPLAY "  TAG(" WS-I ")=" ROW-TAG(WS-I)
               PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 3
                   DISPLAY "    ITEM(" WS-I "," WS-J ")="
                       ROW-ITEM(WS-I, WS-J)
               END-PERFORM
           END-PERFORM.

           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
