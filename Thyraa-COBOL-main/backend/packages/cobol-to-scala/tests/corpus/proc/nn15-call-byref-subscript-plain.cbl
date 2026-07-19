      * nn15 (round 38): control probe for nn03's finding - CALL ... USING
      * BY REFERENCE of a SUBSCRIPTED table element into an ORDINARY
      * (non-RECURSIVE) callee. nn03 found that a subscripted BY REFERENCE
      * operand silently fails to write back to the caller's real table
      * cell when the callee is RECURSIVE (falls back to a BY-CONTENT-
      * style call-site snapshot instead of a live alias) - this checks
      * whether the SAME subscripted-operand shape works correctly for a
      * plain, non-recursive callee (isolating whether the bug is specific
      * to generateCall's `target.recursive` branch, or a general
      * subscripted-BY-REFERENCE gap that also affects the ordinary path).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN15MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TAB.
           05  WS-ITEM PIC 9(3) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-ITEM(1).
           MOVE 20 TO WS-ITEM(2).
           MOVE 30 TO WS-ITEM(3).
           DISPLAY "BEFORE ITEM2=" WS-ITEM(2).
           CALL "NN15SUB" USING BY REFERENCE WS-ITEM(2).
           DISPLAY "AFTER ITEM2=" WS-ITEM(2).
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN15SUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(3).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-MAIN.
           ADD 100 TO LK-VAL.
           DISPLAY "IN SUB VAL=" LK-VAL.
       END PROGRAM NN15SUB.

       END PROGRAM NN15MAIN.
