       IDENTIFICATION DIVISION.
       PROGRAM-ID. I04NESTREPL.
      *
      * Adversarial (round 20): a copybook that itself COPYs another
      * copybook, with REPLACING applied at BOTH levels (u10 tests
      * nested COPY with no REPLACING at all; u09 tests REPLACING with
      * no nesting - this combines both, never exercised before).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY I04OUTERCPY REPLACING ==:OPFX:== BY ==REC1==.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 42 TO SUB1-VAL.
           DISPLAY "TAG=" REC1-TAG.
           DISPLAY "VAL=" SUB1-VAL.
           STOP RUN.
