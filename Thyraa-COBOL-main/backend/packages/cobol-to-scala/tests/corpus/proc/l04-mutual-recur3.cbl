      * Adversarial (round 23): round-22's k04 confirmed mutual
      * recursion works for a 2-PROGRAM cycle (A calls B calls A), but
      * deliberately avoided any BY-REFERENCE writeback through the
      * LINKAGE parameter to isolate the recursive-entry codegen path
      * alone. This tests a 3-PROGRAM cycle (A calls B calls C calls A)
      * AND layers back in the writeback-aliasing check k04 skipped: the
      * deepest activation (A, re-entered at N=0) mutates its own
      * LS-N, and each unwinding level reads that mutation back through
      * its own WS-NEXT (the very variable it passed BY REFERENCE to
      * the next program in the cycle) and folds it into its OWN LS-N
      * before returning - so a correct engine must both (a) support a
      * 3-way call cycle across three DIFFERENT RECURSIVE programs and
      * (b) keep each activation's own BY-REFERENCE aliasing distinct
      * per program in that cycle, not just per self-recursive call.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L04MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(3) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "L04PROGA" USING WS-N.
           DISPLAY "MAIN N AFTER=" WS-N.
           STOP RUN.
       END PROGRAM L04MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L04PROGA RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(3).
       LINKAGE SECTION.
       01 LS-N PIC 9(3).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "A ENTER N=" LS-N.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "L04PROGB" USING WS-NEXT
               COMPUTE LS-N = WS-NEXT + 100
           ELSE
               MOVE 77 TO LS-N
           END-IF.
           DISPLAY "A EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM L04PROGA.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L04PROGB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(3).
       LINKAGE SECTION.
       01 LS-N PIC 9(3).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "B ENTER N=" LS-N.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "L04PROGC" USING WS-NEXT
               COMPUTE LS-N = WS-NEXT + 200
           ELSE
               MOVE 77 TO LS-N
           END-IF.
           DISPLAY "B EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM L04PROGB.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L04PROGC RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT PIC 9(3).
       LINKAGE SECTION.
       01 LS-N PIC 9(3).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "C ENTER N=" LS-N.
           IF LS-N > 0
               COMPUTE WS-NEXT = LS-N - 1
               CALL "L04PROGA" USING WS-NEXT
               COMPUTE LS-N = WS-NEXT + 300
           ELSE
               MOVE 77 TO LS-N
           END-IF.
           DISPLAY "C EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM L04PROGC.
