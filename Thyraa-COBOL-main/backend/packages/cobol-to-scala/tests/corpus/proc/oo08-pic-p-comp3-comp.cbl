      * oo08 (round 39): round-38 finding 4 (nn09) fixed PIC P scaling for
      * a plain DISPLAY (unsigned/COMP-none) item. This probe pressure-
      * tests the SAME leading/trailing-P scale-down/scale-up shapes on
      * COMP-3 (packed decimal) and COMP (binary) items instead - usages
      * round 38 never tried - to see whether the fixed PIC-scan metadata
      * is actually wired through the COMP-3/COMP storage-representation
      * codegen paths too, or only through the DISPLAY path nn09 covered.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO08PCOMP.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-UP PIC S9(3)PPP COMP-3 VALUE 123000.
       01  WS-DOWN PIC SPPP9(3) COMP-3 VALUE 0.000123.
       01  WS-UP-COMP PIC S9(3)PPP COMP VALUE 123000.
       01  WS-DISP-UP PIC S9(6) VALUE 0.
       01  WS-DISP-DOWN PIC S9V9(6) VALUE 0.
       01  WS-DISP-UPC PIC S9(6) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "UP=" WS-UP.
           DISPLAY "DOWN=" WS-DOWN.
           MOVE WS-UP TO WS-DISP-UP.
           DISPLAY "DISP-UP=" WS-DISP-UP.
           MOVE WS-DOWN TO WS-DISP-DOWN.
           DISPLAY "DISP-DOWN=" WS-DISP-DOWN.
           MOVE WS-UP-COMP TO WS-DISP-UPC.
           DISPLAY "DISP-UPC=" WS-DISP-UPC.
           STOP RUN.
