      * Adversarial (round 24): a RECURSIVE program's own LINKAGE parameter
      * used as a BY REFERENCE CALL argument to a DIFFERENT, ORDINARY
      * (non-recursive) subprogram, which mutates it - checking that the
      * writeback correctly propagates back THROUGH the recursive aliasing
      * layer (the getter/setter closure pair, round-21/23) and that the
      * now-updated value is visible immediately afterward, including being
      * usable as the argument for a FURTHER recursive self-CALL. Distinct
      * from every prior recursive corpus program: k04/l04 only ever CALL
      * another RECURSIVE-marked program; this one calls a genuinely
      * ordinary (non-RECURSIVE) sibling mid-activation.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M06MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M06SUB" USING WS-N.
           DISPLAY "MAIN N=" WS-N.
           STOP RUN.
       END PROGRAM M06MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M06SUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           IF LS-N > 0
               CALL "M06HELPER" USING LS-N
               DISPLAY "AFTER-HELPER N=" LS-N
               CALL "M06SUB" USING LS-N
           END-IF.
           DISPLAY "EXIT  N=" LS-N.
           GOBACK.
       END PROGRAM M06SUB.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M06HELPER.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-N PIC 9(2).
       PROCEDURE DIVISION USING LK-N.
       MAIN-PARA.
           SUBTRACT 1 FROM LK-N.
           GOBACK.
       END PROGRAM M06HELPER.
