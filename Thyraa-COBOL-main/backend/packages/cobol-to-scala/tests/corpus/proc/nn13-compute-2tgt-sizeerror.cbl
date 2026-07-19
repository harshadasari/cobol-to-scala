      * nn13 (round 38): COMPUTE with TWO result targets of different
      * declared widths in the SAME statement, ON SIZE ERROR - one target
      * (WS-SMALL, PIC S9(1)) overflows the shared computed value, the
      * other (WS-BIG, PIC S9(5)) does not. Real COBOL checks/stores each
      * result target INDEPENDENTLY - the narrow target should be left
      * UNCHANGED (size error, no store) while the wide target should
      * still receive its correctly computed value (no error for it),
      * with the ON SIZE ERROR imperative firing once overall since at
      * least one target overflowed. No prior corpus COMPUTE/ON SIZE
      * ERROR program uses more than one result target at all.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. NN13MULTITGT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SMALL PIC S9(1) VALUE 0.
       01  WS-BIG PIC S9(5) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-SMALL WS-BIG = 12345 + 100
               ON SIZE ERROR
                   DISPLAY "SIZE-ERROR SMALL=" WS-SMALL " BIG=" WS-BIG
               NOT ON SIZE ERROR
                   DISPLAY "NO-ERROR SMALL=" WS-SMALL " BIG=" WS-BIG
           END-COMPUTE.
           STOP RUN.
