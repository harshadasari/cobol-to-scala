      * Adversarial (round 22): round-21 finding 2 (j10) only exercised
      * DIRECT self-recursion (a program CALLing its own PROGRAM-ID
      * again while still active). This checks MUTUAL recursion instead
      * - K04PROGA CALLs K04PROGB, which CALLs K04PROGA again (a
      * different program, not itself), five levels deep before hitting
      * a base case, then unwinding back up through GOBACKs. Neither
      * program ever writes back through its own LINKAGE parameter (it
      * only reads LS-N and passes a freshly computed value onward via
      * its own WORKING-STORAGE), so this deliberately does NOT
      * re-exercise round-21's own BY-REFERENCE-aliasing finding (already
      * covered by j10) - it isolates whether the generator's per-
      * program recursive-entry codegen (generateRecursiveEntryMethod,
      * gated per-PROGRAM-ID) composes correctly when TWO different
      * recursive programs call each other in a cycle, rather than one
      * program calling only itself.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K04MUTMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9 VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "K04PROGA" USING WS-N.
           DISPLAY "MAIN-DONE".
           STOP RUN.
       END PROGRAM K04MUTMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. K04PROGA RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9.
       LINKAGE SECTION.
       01 LS-N PIC 9.
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "A N=" LS-N.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "K04PROGB" USING WS-NEXT
           ELSE
               DISPLAY "A-BASE-CASE"
           END-IF.
           GOBACK.
       END PROGRAM K04PROGA.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. K04PROGB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9.
       LINKAGE SECTION.
       01 LS-N PIC 9.
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "B N=" LS-N.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "K04PROGA" USING WS-NEXT
           ELSE
               DISPLAY "B-BASE-CASE"
           END-IF.
           GOBACK.
       END PROGRAM K04PROGB.
