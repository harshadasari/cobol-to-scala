      * Adversarial (round 24): a RECURSIVE subprogram CALLed TWICE from the
      * SAME top-level caller, fully sequentially (the second CALL happens
      * only after the first CALL's own entire recursion chain has already
      * unwound and returned) - the first invocation triggers NO recursion
      * at all (base case immediately), the second triggers a real 4-level
      * recursive chain. Every prior recursive corpus program calls its
      * RECURSIVE subprogram exactly ONCE from the top; this checks whether
      * the generated entry()'s own state (and WORKING-STORAGE, which cobc
      * genuinely keeps static/shared even across independent, non-nested
      * top-level CALLs to the same RECURSIVE program - not just across
      * nested recursive activations) composes correctly across two
      * completely separate invocations in one run, rather than only
      * within a single recursive chain.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M14MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(2) VALUE 0.
       01 WS-B PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M14SUB" USING WS-A.
           DISPLAY "MAIN AFTER-1 A=" WS-A.
           CALL "M14SUB" USING WS-B.
           DISPLAY "MAIN AFTER-2 B=" WS-B.
           STOP RUN.
       END PROGRAM M14MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M14SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(2).
       01 WS-CNT  PIC 9(2) VALUE 0.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           ADD 1 TO WS-CNT.
           DISPLAY "ENTER N=" LS-N " CNT=" WS-CNT.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "M14SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT  N=" LS-N " CNT=" WS-CNT.
           GOBACK.
       END PROGRAM M14SUB.
