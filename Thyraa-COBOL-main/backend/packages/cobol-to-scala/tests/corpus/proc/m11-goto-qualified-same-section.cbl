      * Adversarial (round 24): round-21 finding 3 fully supports a GO TO
      * whose sole target is OF/IN-qualified, but every corpus program
      * exercising that (j11, k02, l02) qualifies with a DIFFERENT section
      * than the one the GO TO itself lives in. This checks the trivial/
      * no-op case: `GO TO PARA-B OF MAIN-SECTION` issued FROM inside
      * MAIN-SECTION itself - legal COBOL (qualification is always allowed,
      * even when not strictly required for disambiguation) - verifying the
      * qualified-target resolver doesn't stumble over "qualifier equals my
      * own enclosing section" as a degenerate/self-referential case.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M11GOTOSELFQUAL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-SECTION SECTION.
       PARA-A.
           DISPLAY "IN-PARA-A".
           GO TO PARA-B OF MAIN-SECTION.
       PARA-B.
           DISPLAY "IN-PARA-B".
           STOP RUN.
