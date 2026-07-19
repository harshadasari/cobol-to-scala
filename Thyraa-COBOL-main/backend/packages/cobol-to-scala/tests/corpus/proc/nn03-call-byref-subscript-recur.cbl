      * nn03 (round 38): CALL ... USING BY REFERENCE of a SUBSCRIPTED table
      * element into a RECURSIVE program. Round-21 finding 2's own true
      * getter/setter-closure aliasing for a BY REFERENCE LINKAGE parameter
      * was explicitly built (and, per tests/oracle/README.md's own Known
      * Gaps notes elsewhere in this codebase) only ever verified/extended
      * for a "plain, unsubscripted, non-ref-mod" operand - hypothesis: a
      * SUBSCRIPTED operand (WS-ITEM(2)) passed BY REFERENCE into a
      * RECURSIVE callee either silently fails to alias the caller's real
      * table cell (a snapshot-by-value regression) or hits an unresolved
      * codegen path.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN03MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TAB.
           05  WS-ITEM PIC 9(3) OCCURS 3 TIMES.
       01  WS-DEPTH PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-ITEM(1).
           MOVE 20 TO WS-ITEM(2).
           MOVE 30 TO WS-ITEM(3).
           DISPLAY "BEFORE ITEM2=" WS-ITEM(2).
           CALL "NN03SUB" USING BY REFERENCE WS-ITEM(2)
                                BY REFERENCE WS-DEPTH.
           DISPLAY "AFTER ITEM2=" WS-ITEM(2).
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN03SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(3).
       01  LK-DEPTH PIC 9.
       PROCEDURE DIVISION USING LK-VAL LK-DEPTH.
       SUB-MAIN.
           ADD 100 TO LK-VAL.
           DISPLAY "IN SUB DEPTH=" LK-DEPTH " VAL=" LK-VAL.
           IF LK-DEPTH > 0
               SUBTRACT 1 FROM LK-DEPTH
               CALL "NN03SUB" USING BY REFERENCE LK-VAL
                                    BY REFERENCE LK-DEPTH
           END-IF.
       END PROGRAM NN03SUB.

       END PROGRAM NN03MAIN.
