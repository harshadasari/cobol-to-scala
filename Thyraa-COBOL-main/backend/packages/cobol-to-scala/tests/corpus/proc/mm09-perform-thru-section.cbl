      * mm09 (round 37): fresh-territory probe - PERFORM ... THRU whose
      * range spans ACROSS a SECTION boundary: PARA-A2 (the last
      * paragraph of SECTION-A) THRU PARA-B1 (the first paragraph of
      * SECTION-B). Real COBOL executes paragraphs in physical/textual
      * sequence for a THRU range regardless of section boundaries -
      * confirms the engine's PERFORM-THRU resolution walks straight past
      * a SECTION header rather than stopping at (or getting confused by)
      * it, and that falling out the far end of PARA-B1 correctly returns
      * control to MAIN-PARA rather than continuing on into PARA-B2.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM09.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-LOG PIC X(40) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "MAIN START".
           PERFORM PARA-A2 THRU PARA-B1.
           DISPLAY "MAIN END".
           STOP RUN.

       SECTION-A SECTION.
       PARA-A1.
           DISPLAY "A1 (SKIPPED BY THRU RANGE)".

       PARA-A2.
           DISPLAY "A2".

       SECTION-B SECTION.
       PARA-B1.
           DISPLAY "B1".

       PARA-B2.
           DISPLAY "B2 (SKIPPED, OUTSIDE THRU RANGE)".
