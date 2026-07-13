       IDENTIFICATION DIVISION.
       PROGRAM-ID. H02EMPTY.
      *
      * Adversarial (round 19): the most minimal legal COBOL program
      * shape - PROCEDURE DIVISION containing exactly one statement
      * (STOP RUN) and NO paragraph/section name at all, NO WORKING-
      * STORAGE SECTION, NO DATA DIVISION even. Round-18 finding 1
      * (g14) fixed the paragraph-less-PROCEDURE-DIVISION parser bug
      * using a two-statement, two-program repro; this narrower single-
      * statement, single-program probe confirms that fix generalizes
      * down to the absolute smallest case instead of only the shape
      * g14 happened to exercise.
       PROCEDURE DIVISION.
           STOP RUN.
