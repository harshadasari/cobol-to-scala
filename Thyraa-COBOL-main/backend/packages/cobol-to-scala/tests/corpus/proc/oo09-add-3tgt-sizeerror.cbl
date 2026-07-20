      * oo09 (round 39): round-38 finding 5 (nn13) fixed multi-target
      * COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE ON SIZE ERROR to gate each
      * target's OWN store on only that target's own overflow check,
      * rather than an all-or-nothing decision across every target. nn13
      * only tried 2 targets via COMPUTE. This probe uses ADD with 3
      * targets, each with a DIFFERENT overflow pattern: WS-SMALL1
      * overflows, WS-OK does not, WS-SMALL2 overflows by a different
      * margin - to confirm the per-target gating actually generalizes to
      * 3+ targets and to the ADD statement (not just COMPUTE).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO09ADD3TGT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SMALL1 PIC S9(1) VALUE 0.
       01  WS-OK PIC S9(5) VALUE 100.
       01  WS-SMALL2 PIC S9(2) VALUE 50.
       PROCEDURE DIVISION.
       MAIN-PARA.
           ADD 500 TO WS-SMALL1 WS-OK WS-SMALL2
               ON SIZE ERROR
                   DISPLAY "SIZE-ERROR"
           END-ADD.
           DISPLAY "SMALL1=" WS-SMALL1.
           DISPLAY "OK=" WS-OK.
           DISPLAY "SMALL2=" WS-SMALL2.
           STOP RUN.
