      * Adversarial (round 24): l12 only ever verified a self-write RECURSIVE
      * LINKAGE parameter to 3-4 levels of depth. This extends the identical
      * shape (SUBTRACT 1 FROM LS-N then CALL self USING LS-N) to 6 levels,
      * checking for any accumulation/drift bug across many levels rather
      * than only the "outermost vs innermost" 2-3 level case rounds 21-23
      * exercised - e.g. a getter/setter closure captured by reference vs.
      * by value that happens to work for a shallow chain but drifts once
      * more than a couple of stack frames are involved.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M07MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 6.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M07SUB" USING WS-N.
           DISPLAY "MAIN N=" WS-N.
           STOP RUN.
       END PROGRAM M07MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M07SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-CNT PIC 9(2) VALUE 0.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           ADD 1 TO WS-CNT.
           DISPLAY "ENTER N=" LS-N " CNT=" WS-CNT.
           IF LS-N > 0
               SUBTRACT 1 FROM LS-N
               CALL "M07SUB" USING LS-N
           END-IF.
           DISPLAY "EXIT  N=" LS-N " CNT=" WS-CNT.
           GOBACK.
       END PROGRAM M07SUB.
