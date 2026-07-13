      * Adversarial (round 21): an EXPLICITLY qualified GO TO ("GO TO
      * 1000-PARA OF 3000-THIRD.") to disambiguate a paragraph name that
      * collides across three different SECTIONs. The README's own
      * "Known gaps" section (round-4 finding 8 entry) says PERFORM's
      * OF/IN qualifier was fully wired up (round-12/round-14 - see
      * z12/b3) but explicitly states "GO TO's own qualification is
      * unaffected by either fix ... and by extending GO TO's own
      * parsing/codegen the same way PERFORM was, if a future program
      * needs it" - i.e. this exact shape was flagged as unaddressed
      * but never actually tried against the generator before. Verified
      * against installed GnuCOBOL first: this is ordinary, valid,
      * unambiguous COBOL (three same-named paragraphs, each in its own
      * section, target picked by the qualifier) - cobc's own oracle
      * correctly runs the THIRD section's own 1000-PARA only.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J11GOTOOF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-X PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-START.
           DISPLAY "START".
           GO TO 1000-PARA OF 3000-THIRD.
       1000-PARA.
           DISPLAY "WRONG-1000-IN-MAIN-SECTION".
           STOP RUN.
       2000-SECOND SECTION.
       1000-PARA.
           DISPLAY "WRONG-1000-IN-SECOND-SECTION".
           STOP RUN.
       3000-THIRD SECTION.
       1000-PARA.
           DISPLAY "CORRECT-1000-IN-THIRD-SECTION".
           STOP RUN.
