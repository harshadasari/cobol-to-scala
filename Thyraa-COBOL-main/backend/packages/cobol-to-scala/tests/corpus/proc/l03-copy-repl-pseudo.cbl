      * Adversarial (round 23): round-22 finding 3 fixed the copybook
      * REPLACING clause's own termination scan (findStatementEnd,
      * parser/copybook-resolver.js) for a pseudo-text (==...==)
      * REPLACING pair whose BY-text is itself a QUOTED literal
      * containing an embedded escaped period (k03). This tests COBOL's
      * OTHER standard REPLACING operand shape: a pseudo-text
      * REPLACING pair where NEITHER the operand NOR the BY-text is a
      * quoted literal at all - a multi-WORD pseudo-text clause
      * ("PIC X(6) VALUE SPACES", no quotes anywhere) substituted in
      * for a single placeholder token ("PICTYPE"), the ordinary
      * "replace a whole clause via pseudo-text" idiom real COBOL
      * copybooks use for parameterizing a PICTURE/VALUE clause -
      * distinct from k03/j05's own narrower "identifier-prefix
      * substitution" use of pseudo-text delimiters, and containing no
      * quote characters anywhere for findStatementEnd's quote-aware
      * scan to track.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L03PSEUDO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY LCPY03 REPLACING ==PICTYPE== BY ==PIC X(6) VALUE SPACES==.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE=[" L03-FLD "] TAG=" L03-TAG.
           MOVE "HI" TO L03-FLD.
           DISPLAY "AFTER=[" L03-FLD "] TAG=" L03-TAG.
           STOP RUN.
