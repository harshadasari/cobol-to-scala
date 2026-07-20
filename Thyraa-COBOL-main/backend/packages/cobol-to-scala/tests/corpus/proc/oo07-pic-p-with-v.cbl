      * oo07 (round 39): round-38 finding 4 (nn09) fixed PIC P-only
      * scaling (no V at all). Per the round-39 brief, this probe tries P
      * COMBINED with an explicit V in the same PICTURE. Verified
      * empirically against 5 different arrangements (P before digits
      * then V, P after digits then V, V then digits then P, etc.) - real
      * cobc rejects EVERY arrangement as a compile-time error ("P must
      * be at start or end of PICTURE string" / "V cannot follow a P
      * which is after the decimal point" / etc.) - P and V are always
      * mutually exclusive scaling notations in this GnuCOBOL, never a
      * valid combination. This is therefore a genuinely invalid-COBOL
      * probe (cobc itself never produces a runnable oracle for it,
      * matching the jj03/cc04/cc07 precedent for a program that is
      * permanently ineligible for oracleCompare()'s byte-diff) - kept to
      * document the actual compile-time rejection and to check whether
      * the engine's own parser silently accepts (and computes
      * unspecified/undefined metadata for) input real cobc always
      * refuses, rather than validating it.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO07PWITHV.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC SPPP9(2)V9(2) VALUE 12.34.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "A=" WS-A.
           STOP RUN.
