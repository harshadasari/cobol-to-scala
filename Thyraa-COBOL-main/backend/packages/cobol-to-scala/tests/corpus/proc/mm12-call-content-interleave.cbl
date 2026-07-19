      * mm12 (round 37): pressure-test on round-36 finding 1's call-site-id
      * counter - FOUR textually distinct CALL statements in ONE
      * paragraph, INTERLEAVED between TWO DIFFERENT RECURSIVE target
      * programs (X, Y, X, Y - not all calls to the same target, unlike
      * mm01/ll01), each BY CONTENT. Confirms nextCallSiteId() is a pure
      * source-order counter independent of which RECURSIVE program is
      * being called, so the same-named snapshot pattern used per target
      * doesn't accidentally collide across DIFFERENT targets either.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM12MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC 9(3) VALUE 1.
       01  WS-B PIC 9(3) VALUE 2.
       01  WS-C PIC 9(3) VALUE 3.
       01  WS-D PIC 9(3) VALUE 4.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE A=" WS-A " B=" WS-B " C=" WS-C " D=" WS-D.
           CALL "MM12X" USING BY CONTENT WS-A.
           CALL "MM12Y" USING BY CONTENT WS-B.
           CALL "MM12X" USING BY CONTENT WS-C.
           CALL "MM12Y" USING BY CONTENT WS-D.
           DISPLAY "AFTER A=" WS-A " B=" WS-B " C=" WS-C " D=" WS-D.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM12X IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(3).
       PROCEDURE DIVISION USING LK-VAL.
       X-MAIN.
           ADD 10 TO LK-VAL.
           DISPLAY "IN X VAL=" LK-VAL.
       END PROGRAM MM12X.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM12Y IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL2 PIC 9(3).
       PROCEDURE DIVISION USING LK-VAL2.
       Y-MAIN.
           ADD 500 TO LK-VAL2.
           DISPLAY "IN Y VAL=" LK-VAL2.
       END PROGRAM MM12Y.

       END PROGRAM MM12MAIN.
