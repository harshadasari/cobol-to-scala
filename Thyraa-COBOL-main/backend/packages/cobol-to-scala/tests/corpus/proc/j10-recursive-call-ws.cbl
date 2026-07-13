      * Adversarial (round 21): a subprogram (PROGRAM-ID ... RECURSIVE)
      * that CALLs itself directly, three levels deep, checking whether
      * its own WORKING-STORAGE state is isolated per (re-)activation or
      * shared/corrupted across recursive re-entry. No prior corpus
      * program exercises a same-program recursive CALL at all. Verified
      * against installed GnuCOBOL first (reproducible across repeated
      * runs, not UB): despite the RECURSIVE attribute, this GnuCOBOL
      * build does NOT give each recursive activation isolated storage -
      * WS-N keeps counting up SHARED across all three levels (ENTER
      * DEPTH=03 shows WS-N=03, not a fresh 01), and even the BY-
      * REFERENCE LINKAGE parameter binding is affected: the level-2
      * frame's own "EXIT DEPTH=" print shows "03" (not "02") because
      * its LS-DEPTH is bound BY REFERENCE to level-2's own WS-NEXT
      * working-storage cell, which is the SAME memory the level-3 call
      * was also reading/writing through its own LS-DEPTH - i.e. this
      * cobc build's WORKING-STORAGE for a RECURSIVE program is
      * effectively static/shared, not stack-allocated per invocation.
      * This is the actual, reproducible ground truth to convert
      * against, whatever this generator's own CALL-as-Scala-method
      * model happens to do about WORKING-STORAGE sharing across a
      * recursive CALL of the same program.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J10RECMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-D PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "J10RECSUB" USING WS-D.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. J10RECSUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 0.
       01 WS-NEXT PIC 9(2).
       LINKAGE SECTION.
       01 LS-DEPTH PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           ADD 1 TO WS-N.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " WS-N=" WS-N.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               CALL "J10RECSUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " WS-N=" WS-N.
           GOBACK.
       END PROGRAM J10RECSUB.
       END PROGRAM J10RECMAIN.
