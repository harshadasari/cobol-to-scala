       IDENTIFICATION DIVISION.
       PROGRAM-ID. S02BNOCOL.
      * Isolation follow-up to s02: PERFORM ... THRU spans the same
      * two SECTIONs, but this time with NO colliding bare paragraph
      * names, to confirm the failure is specifically the ambiguous-
      * name collision inside generatePerformThruMethod's nested-def
      * generation (not THRU-across-sections in general).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DUMMY            PIC X(1) VALUE 'A'.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-ENTRY.
           DISPLAY "ENTRY".
           PERFORM 1000-FIRST THRU 2000-SECOND.
           DISPLAY "AFTER-THRU".
           STOP RUN.
       1000-SECTION-A SECTION.
       1000-FIRST.
           DISPLAY "1000-FIRST".
       1000-THIRD.
           DISPLAY "1000-THIRD".
       2000-SECTION-B SECTION.
       2000-FOURTH.
           DISPLAY "2000-FOURTH".
       2000-SECOND.
           DISPLAY "2000-SECOND".
       3000-UNREACHED SECTION.
       3000-PARA-A.
           DISPLAY "SHOULD-NOT-APPEAR".
