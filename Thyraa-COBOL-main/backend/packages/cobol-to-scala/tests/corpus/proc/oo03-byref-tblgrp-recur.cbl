      * oo03 (round 39): round-38 finding 2 (nn03/nn04) fixed BY REFERENCE
      * writeback into a RECURSIVE callee for a subscripted SCALAR operand
      * and a ref-mod'd operand. This probe tries a GROUP-shaped
      * subscripted operand instead (a table of GROUPS, WS-ITEM(2) is
      * itself a 2-field group, not a scalar) - a shape round 38 never
      * exercised. The RECURSIVE callee mutates a subfield of the passed
      * group and recurses; the caller must see the mutation after the
      * call returns.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO03TBLGRP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ITEM OCCURS 3 TIMES.
               10  WS-ITEM-VAL PIC 9(3).
               10  WS-ITEM-TAG PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-ITEM-VAL(1).
           MOVE "AAA" TO WS-ITEM-TAG(1).
           MOVE 20 TO WS-ITEM-VAL(2).
           MOVE "BBB" TO WS-ITEM-TAG(2).
           MOVE 30 TO WS-ITEM-VAL(3).
           MOVE "CCC" TO WS-ITEM-TAG(3).
           DISPLAY "BEFORE VAL2=" WS-ITEM-VAL(2) " TAG2=" WS-ITEM-TAG(2).
           CALL "OO03SUB" USING BY REFERENCE WS-ITEM(2) 2.
           DISPLAY "AFTER VAL2=" WS-ITEM-VAL(2) " TAG2=" WS-ITEM-TAG(2).
           STOP RUN.
       END PROGRAM OO03TBLGRP.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO03SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-ITEM.
           05  LK-VAL PIC 9(3).
           05  LK-TAG PIC X(3).
       01  LK-DEPTH PIC 9.
       PROCEDURE DIVISION USING LK-ITEM LK-DEPTH.
           DISPLAY "IN SUB DEPTH=" LK-DEPTH " VAL=" LK-VAL.
           ADD LK-DEPTH TO LK-VAL.
           IF LK-DEPTH > 0
               CALL "OO03SUB" USING BY REFERENCE LK-ITEM 0
           END-IF.
           IF LK-DEPTH = 2
               MOVE "ZZZ" TO LK-TAG
           END-IF.
           GOBACK.
       END PROGRAM OO03SUB.
