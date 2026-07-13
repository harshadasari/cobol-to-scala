      * Adversarial (round 22): STOP RUN fired from deep INSIDE a
      * recursive CALL activation (depth 3 of a self-recursive
      * subprogram), stressing round-21's own generateRecursiveEntryMethod
      * fix (generator/scala-generator.js) - every reachable paragraph of
      * a recursive program is nested as a local `def` INSIDE entry()
      * itself (not a top-level method), each level's own entry() call
      * still live on the JVM call stack when the deepest one fires
      * STOP RUN. Real cobc's STOP RUN terminates the WHOLE run unit
      * outright, regardless of call/recursion depth (z09b already
      * covers this for a single, non-recursive CALL depth) - so NONE of
      * the "EXIT DEPTH=" displays for depth 1 or 2, and NOT
      * "MAIN-AFTER-CALL", may ever print; only ENTER DEPTH=01/02/03 and
      * "STOPPING-AT-DEPTH-3" should appear.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K12RECSTOP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-D PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MAIN-BEFORE-CALL".
           CALL "K12RECSTOPSUB" USING WS-D.
           DISPLAY "MAIN-AFTER-CALL-MUST-NEVER-PRINT".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. K12RECSTOPSUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9.
       LINKAGE SECTION.
       01 LS-DEPTH PIC 9.
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           IF LS-DEPTH = 3
               DISPLAY "STOPPING-AT-DEPTH-3"
               STOP RUN
           END-IF.
           COMPUTE WS-NEXT = LS-DEPTH + 1.
           CALL "K12RECSTOPSUB" USING WS-NEXT.
           DISPLAY "EXIT DEPTH=" LS-DEPTH " MUST-NEVER-PRINT-FOR-1-OR-2".
           GOBACK.
       END PROGRAM K12RECSTOPSUB.
       END PROGRAM K12RECSTOP.
