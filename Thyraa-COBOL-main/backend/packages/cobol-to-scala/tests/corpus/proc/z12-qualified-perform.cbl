      * Round-12 probe z12: two SECTIONS each declare a paragraph with the
      * SAME bare name (PARA-ONE), and MAIN-PARA uses an explicit qualified
      * reference (PERFORM PARA-ONE OF SECTION-B) to disambiguate which one
      * runs - real COBOL requires this qualification (an unqualified
      * PERFORM PARA-ONE would be genuinely ambiguous/illegal), so this is
      * the *legal* shape of the scenario the README's "Known gaps" section
      * already documents as an unfixed limitation for the *bare* (would-be-
      * ambiguous) case.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z12QUAL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "START".
           PERFORM PARA-ONE OF SECTION-B.
           DISPLAY "END".
           STOP RUN.

       SECTION-A SECTION.
       PARA-ONE.
           DISPLAY "IN-SECTION-A-PARA-ONE".

       SECTION-B SECTION.
       PARA-ONE.
           DISPLAY "IN-SECTION-B-PARA-ONE".
