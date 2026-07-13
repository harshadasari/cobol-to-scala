       IDENTIFICATION DIVISION.
       PROGRAM-ID. H06RMINIT.
      *
      * Adversarial (round 19): reference modification (Known Gap #1)
      * used as an INITIALIZE target - INITIALIZE WS-SRC(3:4) - a spot
      * no prior round's ref-mod probe (d12/e04/e05/e06/f01/f03/f04/f05/
      * g01/g02/g03) has exercised. Checks whether generateInitialize
      * crashes (a NEW operand-position hard-compile bug, like round-16/
      * 17's relational-comparison/CALL-argument findings) or degrades
      * honestly, and whether it corrupts anything OUTSIDE the ref-mod
      * window (the surrounding, non-ref-mod'd bytes of WS-SRC).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC              PIC X(10) VALUE "ABCDEFGHIJ".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE=" WS-SRC.
           INITIALIZE WS-SRC(3:4).
           DISPLAY "AFTER=" WS-SRC.
           STOP RUN.
       END PROGRAM H06RMINIT.
