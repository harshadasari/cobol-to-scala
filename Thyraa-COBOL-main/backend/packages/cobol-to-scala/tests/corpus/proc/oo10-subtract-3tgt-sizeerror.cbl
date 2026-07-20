      * oo10 (round 39): companion to oo09 - same round-38 finding 5
      * per-target ON SIZE ERROR gating, but via SUBTRACT with 3 targets
      * (nn13 only tried COMPUTE). WS-SMALL1 underflows negative (below
      * its unsigned capacity... note: unsigned PIC, subtracting past
      * zero is itself an overflow condition for an unsigned target),
      * WS-OK does not overflow, WS-SMALL2 overflows on the high side.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO10SUB3TGT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SMALL1 PIC 9(1) VALUE 3.
       01  WS-OK PIC S9(5) VALUE 500.
       01  WS-SMALL2 PIC S9(2) VALUE -50.
       PROCEDURE DIVISION.
       MAIN-PARA.
           SUBTRACT 100 FROM WS-SMALL1 WS-OK WS-SMALL2
               ON SIZE ERROR
                   DISPLAY "SIZE-ERROR"
           END-SUBTRACT.
           DISPLAY "SMALL1=" WS-SMALL1.
           DISPLAY "OK=" WS-OK.
           DISPLAY "SMALL2=" WS-SMALL2.
           STOP RUN.
