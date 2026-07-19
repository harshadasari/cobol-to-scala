      * ll02 (round 36): pressure-test on round 35 finding 2 (kk07)'s BY
      * CONTENT snapshot fix generalizing beyond SELF-recursion - does a
      * RECURSIVE program that calls a DIFFERENT RECURSIVE program (not
      * itself), passing BY CONTENT, still get a correct isolated snapshot?
      * Real cobc: LL02A gets a private copy of WS-VAL (BY CONTENT), adds 5
      * (105), then calls LL02B (a different RECURSIVE program) BY CONTENT
      * with its own LK-VAL (105) - LL02B gets ITS OWN private copy, adds
      * 1000 (1105), but that mutation must NOT be visible back in LL02A
      * after the call returns (LL02A's own LK-VAL must still read 105, not
      * 1105), and none of this ever propagates back to WS-VAL in MAIN
      * (must still read 100 at the very end).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL02MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-VAL PIC 9(4) VALUE 100.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MAIN BEFORE VAL=" WS-VAL.
           CALL "LL02A" USING BY CONTENT WS-VAL.
           DISPLAY "MAIN AFTER VAL=" WS-VAL.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL02A IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(4).
       PROCEDURE DIVISION USING LK-VAL.
       A-MAIN.
           ADD 5 TO LK-VAL.
           DISPLAY "A BEFORE-B VAL=" LK-VAL.
           CALL "LL02B" USING BY CONTENT LK-VAL.
           DISPLAY "A AFTER-B  VAL=" LK-VAL.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL02B IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL2 PIC 9(4).
       PROCEDURE DIVISION USING LK-VAL2.
       B-MAIN.
           ADD 1000 TO LK-VAL2.
           DISPLAY "B VAL2=" LK-VAL2.
       END PROGRAM LL02B.

       END PROGRAM LL02A.

       END PROGRAM LL02MAIN.
