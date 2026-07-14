      * Adversarial (round 25): round-23's l04 already confirmed a 3-program
      * mutual-RECURSIVE cycle (A->B->C->A, a single LINEAR chain, only ever
      * one activation of each program in flight at a time). This checks
      * something structurally different: TWO RECURSIVE programs, O14A and
      * O14B, mirror-calling each other TWICE per activation (a branching,
      * Fibonacci-shaped call tree, not a linear chain) - so MULTIPLE
      * activations of the SAME program (e.g. two different O14A frames)
      * can be simultaneously suspended on the call stack at once, each
      * relying on that program's own (per round-21 finding 2/j10,
      * genuinely shared/static) WORKING-STORAGE scratch variables. A
      * linear chain like l04 never has two suspended activations of the
      * SAME program at once, so it never exercises this. Computes
      * fib(5)=5 by mutual A/B recursion; the real question is whether the
      * generated Scala's own per-activation LINKAGE aliasing plus
      * shared-WORKING-STORAGE model reproduces whatever real cobc actually
      * does here - correct fib(5) or a shared-storage collision - byte for
      * byte.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O14MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N      PIC 9(2) VALUE 5.
       01 WS-RESULT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "O14A" USING WS-N, WS-RESULT.
           DISPLAY "MAIN RESULT=" WS-RESULT.
           STOP RUN.
       END PROGRAM O14MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. O14A RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N1 PIC 9(2).
       01 WS-R1 PIC 9(2) VALUE 0.
       01 WS-N2 PIC 9(2).
       01 WS-R2 PIC 9(2) VALUE 0.
       LINKAGE SECTION.
       01 LS-N      PIC 9(2).
       01 LS-RESULT PIC 9(2).
       PROCEDURE DIVISION USING LS-N, LS-RESULT.
       MAIN-PARA.
           IF LS-N < 2
               MOVE LS-N TO LS-RESULT
           ELSE
               COMPUTE WS-N1 = LS-N - 1
               CALL "O14B" USING WS-N1, WS-R1
               COMPUTE WS-N2 = LS-N - 2
               CALL "O14B" USING WS-N2, WS-R2
               COMPUTE LS-RESULT = WS-R1 + WS-R2
           END-IF.
           DISPLAY "A N=" LS-N " RESULT=" LS-RESULT.
           GOBACK.
       END PROGRAM O14A.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. O14B RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N1 PIC 9(2).
       01 WS-R1 PIC 9(2) VALUE 0.
       01 WS-N2 PIC 9(2).
       01 WS-R2 PIC 9(2) VALUE 0.
       LINKAGE SECTION.
       01 LS-N      PIC 9(2).
       01 LS-RESULT PIC 9(2).
       PROCEDURE DIVISION USING LS-N, LS-RESULT.
       MAIN-PARA.
           IF LS-N < 2
               MOVE LS-N TO LS-RESULT
           ELSE
               COMPUTE WS-N1 = LS-N - 1
               CALL "O14A" USING WS-N1, WS-R1
               COMPUTE WS-N2 = LS-N - 2
               CALL "O14A" USING WS-N2, WS-R2
               COMPUTE LS-RESULT = WS-R1 + WS-R2
           END-IF.
           DISPLAY "B N=" LS-N " RESULT=" LS-RESULT.
           GOBACK.
       END PROGRAM O14B.
