      * Adversarial (round 23): round-22 finding 1's own doc comment
      * (flattenGroupLeaves, generator/expression-gen.js) says an
      * OCCURS-bearing child of a RECURSIVE program's GROUP LINKAGE
      * parameter still bails to `null`, "the genuinely-unsupported
      * residual case that keeps the ordinary [non-recursive-safe,
      * shared-module-var] convention" - but no corpus program actually
      * tries this to confirm the fallback is HONEST (a visible
      * marker) rather than a silent reproduction of the exact
      * clobbering bug round-21/round-22 already fixed for the
      * non-OCCURS cases. LS-DEPTH-GRP here contains LS-DEPTH
      * (elementary) AND LS-ITEMS (an OCCURS 2 TIMES table) - three
      * levels of recursion, checking whether each activation's own
      * LS-DEPTH/LS-ITEMS values survive correctly (like k01) or get
      * silently clobbered by a shared var (the pre-fix k01 bug,
      * reproduced here instead for the OCCURS-child shape
      * specifically).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DEPTH-GRP.
           05 WS-DEPTH PIC 9(2) VALUE 1.
           05 WS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-ITEMS(1).
           MOVE 20 TO WS-ITEMS(2).
           CALL "L10SUB" USING WS-DEPTH-GRP.
           STOP RUN.
       END PROGRAM L10MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L10SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT-GRP.
           05 WS-NEXT PIC 9(2).
           05 WS-NEXT-ITEMS PIC 9(2) OCCURS 2 TIMES.
       LINKAGE SECTION.
       01 LS-DEPTH-GRP.
           05 LS-DEPTH PIC 9(2).
           05 LS-ITEMS PIC 9(2) OCCURS 2 TIMES.
       PROCEDURE DIVISION USING LS-DEPTH-GRP.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " I1=" LS-ITEMS(1)
               " I2=" LS-ITEMS(2).
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               COMPUTE WS-NEXT-ITEMS(1) = LS-ITEMS(1) + 1
               COMPUTE WS-NEXT-ITEMS(2) = LS-ITEMS(2) + 1
               CALL "L10SUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " I1=" LS-ITEMS(1)
               " I2=" LS-ITEMS(2).
           GOBACK.
       END PROGRAM L10SUB.
