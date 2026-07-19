      * nn04 (round 38): CALL ... USING BY REFERENCE of a REF-MODIFIED
      * operand into a RECURSIVE program - the second half of the same
      * hypothesis nn03 probed for a subscripted operand (round-21 finding
      * 2's true aliasing was only ever built/verified for a "plain,
      * unsubscripted, non-ref-mod" BY REFERENCE operand).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN04MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STR PIC X(10) VALUE "ABCDEFGHIJ".
       01  WS-DEPTH PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE STR=[" WS-STR "]".
           CALL "NN04SUB" USING BY REFERENCE WS-STR(3:4)
                                BY REFERENCE WS-DEPTH.
           DISPLAY "AFTER STR=[" WS-STR "]".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN04SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-SEG PIC X(4).
       01  LK-DEPTH PIC 9.
       PROCEDURE DIVISION USING LK-SEG LK-DEPTH.
       SUB-MAIN.
           MOVE "ZZZZ" TO LK-SEG.
           DISPLAY "IN SUB DEPTH=" LK-DEPTH " SEG=[" LK-SEG "]".
           IF LK-DEPTH > 0
               SUBTRACT 1 FROM LK-DEPTH
               CALL "NN04SUB" USING BY REFERENCE LK-SEG
                                    BY REFERENCE LK-DEPTH
           END-IF.
       END PROGRAM NN04SUB.

       END PROGRAM NN04MAIN.
