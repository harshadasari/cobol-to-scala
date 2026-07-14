      * Adversarial (round 23): round-22 finding 2 fixed GO TO t1 OF
      * s1, t2 OF s2, ... DEPENDING ON sel's own multi-target comma
      * parsing (k02) - but k02 only exercised the DEPENDING ON
      * selector (LS-SEL) as a CALLed subprogram's own LINKAGE
      * parameter, never a plain WORKING-STORAGE variable in the same
      * (single, non-CALLed) program. This tests the identical
      * qualified-multi-target shape with the selector as an ordinary
      * WORKING-STORAGE item, WS-SEL, in the MAIN program's own
      * top-level PROCEDURE DIVISION - no CALL/LINKAGE/GOBACK involved
      * at all - to confirm the parser fix (consuming commas in the
      * target list) is not somehow dependent on the selector being a
      * LINKAGE parameter, and that the selector identifier itself
      * (WS-SEL) never gets misinterpreted as a spurious paragraph name
      * colliding with the real WS-SEL data item - the exact collision
      * shape k02's own finding text describes, but for a
      * WORKING-STORAGE variable rather than a LINKAGE one.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L02GODEPWS.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SEL PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-START.
           DISPLAY "SEL=" WS-SEL.
           GO TO 1000-PARA OF 2000-SECOND,
                 1000-PARA OF 3000-THIRD,
                 1000-PARA OF 4000-FOURTH
                 DEPENDING ON WS-SEL.
           DISPLAY "NO-MATCH-FALLTHROUGH".
           STOP RUN.
       1000-PARA.
           DISPLAY "WRONG-1000-IN-MAIN-SECTION".
           STOP RUN.
       2000-SECOND SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-SECOND".
           STOP RUN.
       3000-THIRD SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-THIRD".
           STOP RUN.
       4000-FOURTH SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-FOURTH".
           STOP RUN.
