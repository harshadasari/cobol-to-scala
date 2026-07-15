      * gg11: another fresh combination on top of gg06's RECURSIVE +
      * RELATIVE-file I/O probe - this time the shared file's record is
      * ODO-bearing (OCCURS DEPENDING ON, round-30 finding 1's own fixed-
      * width-padding fix), and each recursive activation WRITEs a
      * DIFFERENT live count to its own key (depth=1 writes count=1,
      * depth=2 writes count=2, depth=3 writes count=3) - checking that
      * round-30's "pad every record to the table's declared maximum"
      * fix survives being driven from inside recursive re-entry, not
      * just flat sequential code.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG11MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "GG11SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG11SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG11REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
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
       01  WS-NEXT-DEPTH   PIC 9(2).
       01  WS-I            PIC 9(2).
       01  WS-J            PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           IF LS-DEPTH = 1
               OPEN OUTPUT REL-FILE
           END-IF.

           MOVE LS-DEPTH TO WS-RKEY.
           MOVE LS-DEPTH TO REC-COUNT.
           PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > LS-DEPTH
               IF WS-J = 1
                   MOVE "AAA" TO REC-ITEM(WS-J)
               END-IF
               IF WS-J = 2
                   MOVE "BBB" TO REC-ITEM(WS-J)
               END-IF
               IF WS-J = 3
                   MOVE "CCC" TO REC-ITEM(WS-J)
               END-IF
           END-PERFORM.
           WRITE REL-REC.
           DISPLAY "WRITE DEPTH=" LS-DEPTH " ST=" WS-STATUS.

           IF LS-DEPTH < 3
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "GG11SUB" USING WS-NEXT-DEPTH
           END-IF.

           IF LS-DEPTH = 1
               CLOSE REL-FILE
               OPEN INPUT REL-FILE
               PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
                   READ REL-FILE
                   DISPLAY "READ ST=" WS-STATUS " COUNT=" REC-COUNT
                   PERFORM VARYING WS-J FROM 1 BY 1
                           UNTIL WS-J > REC-COUNT
                       DISPLAY "  ITEM(" WS-J ")=" REC-ITEM(WS-J)
                   END-PERFORM
               END-PERFORM
               CLOSE REL-FILE
           END-IF.
           GOBACK.
       END PROGRAM GG11SUB.
       END PROGRAM GG11MAIN.
