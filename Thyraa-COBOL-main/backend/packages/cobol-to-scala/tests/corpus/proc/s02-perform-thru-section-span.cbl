       IDENTIFICATION DIVISION.
       PROGRAM-ID. S02THRUSEC.
      * Round-5 attack: PERFORM ... THRU where the start paragraph is
      * in one SECTION and the end paragraph is in a *different*,
      * later SECTION - THRU spanning a section boundary. Prior
      * rounds' THRU corpus (p14/r08) never combined THRU with
      * SECTION headers at all.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DUMMY            PIC X(1) VALUE 'A'.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-ENTRY.
           DISPLAY "ENTRY".
           PERFORM 1000-PARA-A THRU 2000-PARA-B.
           DISPLAY "AFTER-THRU".
           STOP RUN.
       1000-SECTION-A SECTION.
       1000-PARA-A.
           DISPLAY "1000-PARA-A".
       1000-PARA-C.
           DISPLAY "1000-PARA-C".
       2000-SECTION-B SECTION.
       2000-PARA-A.
           DISPLAY "2000-PARA-A".
       2000-PARA-B.
           DISPLAY "2000-PARA-B".
       3000-UNREACHED SECTION.
       3000-PARA-A.
           DISPLAY "SHOULD-NOT-APPEAR".
