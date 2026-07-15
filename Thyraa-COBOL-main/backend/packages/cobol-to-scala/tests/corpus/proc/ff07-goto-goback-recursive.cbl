      * ff07: GO TO used inside a RECURSIVE program's own nested-local-
      * def paragraph to jump FORWARD past an intervening paragraph
      * straight to a GOBACK - stresses dd05's own fix (the per-def
      * `_chain` gating that replaced the removed `_stepN` wrapper split)
      * combined with an unconditional (non-DEPENDING-ON) GO TO, a shape
      * dd05 itself only exercised via GO TO ... DEPENDING ON. Also
      * checks that GOBACK reached via GO TO (rather than natural fall-
      * through) still correctly unwinds only ONE recursion level, not
      * more, and that the paragraph the GO TO jumps OVER (PARA-SKIP)
      * never executes.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF07MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "FF07SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF07SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       PARA-ENTER.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "FF07SUB" USING WS-NEXT-DEPTH
           END-IF.
           GO TO PARA-FINISH.
       PARA-SKIP.
           DISPLAY "SKIP-SHOULD-NOT-PRINT DEPTH=" LS-DEPTH.
       PARA-FINISH.
           DISPLAY "FINISH DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM FF07SUB.
       END PROGRAM FF07MAIN.
