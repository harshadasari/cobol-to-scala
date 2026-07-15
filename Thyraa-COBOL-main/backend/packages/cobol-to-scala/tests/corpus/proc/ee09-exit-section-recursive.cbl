      * ee09: EXIT SECTION used mid-paragraph, inside a RECURSIVE
      * program's own SECTION structure - probes whether generateExit's
      * SECTION handling (a bare `return`, generator/expression-gen.js)
      * collides with round-21's RECURSIVE-program nested-local-def
      * convention (generateProgramFlowLinesNested/
      * renderNestedFallthroughDefs, method-gen.js), which chains every
      * paragraph's own nested def to the next via a call appended INSIDE
      * each def's own body (not sequential top-level calls, unlike the
      * ordinary non-recursive _stepN wrapper convention round-4 built
      * specifically to avoid this) - a `return` fired partway through
      * one such nested def could plausibly cascade all the way back up
      * through the WHOLE chain (each caller's own last action was also
      * just that same call) instead of stopping only at the end of the
      * CURRENT SECTION, which is what EXIT SECTION actually requires.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE09MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "EE09SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE09SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       SECTION-A SECTION.
       PARA-A1.
           DISPLAY "A1 DEPTH=" LS-DEPTH.
           IF LS-DEPTH = 1
               EXIT SECTION
           END-IF.
           DISPLAY "A1-TAIL DEPTH=" LS-DEPTH.
       PARA-A2.
           DISPLAY "A2 DEPTH=" LS-DEPTH.
       SECTION-B SECTION.
       PARA-B1.
           DISPLAY "B1 DEPTH=" LS-DEPTH.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "EE09SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM EE09SUB.
       END PROGRAM EE09MAIN.
