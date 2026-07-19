      * nn09 (round 38): PICTURE clause P-scaling positions (PIC 9(3)PPP -
      * trailing P, implied zeros to the right/scale UP; PIC PPP9(3) -
      * leading P, implied zeros to the left/scale DOWN) - no corpus
      * program exercises a genuine scaling-P PICTURE at all (P is not a
      * storage character - data-division-parser.js's own PIC-scan
      * comment notes it "occupies no storage" but no program has ever
      * MOVEd/COMPUTEd a real value through one to check the resulting
      * decimal scaling is actually honored at runtime, not just parsed).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN09PSCALE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SRC PIC S9(6) VALUE 123456.
       01  WS-SCALED-UP PIC S9(3)PPP.
       01  WS-SCALED-DOWN PIC SPPP9(3).
       01  WS-RESULT PIC S9(9) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-SRC TO WS-SCALED-UP.
           DISPLAY "SCALED-UP=" WS-SCALED-UP.
           COMPUTE WS-RESULT = WS-SCALED-UP + 0.
           DISPLAY "RESULT-UP=" WS-RESULT.

           MOVE WS-SRC TO WS-SCALED-DOWN.
           DISPLAY "SCALED-DOWN=" WS-SCALED-DOWN.
           COMPUTE WS-RESULT = WS-SCALED-DOWN * 1000000.
           DISPLAY "RESULT-DOWN=" WS-RESULT.
           STOP RUN.
