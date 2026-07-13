      * Adversarial (round 22): round-21 finding 1 (j05) fixed
      * copybook-resolver.js's COPY-lookalike detection so it never
      * fires inside a copybook's OWN pre-existing quoted literal.
      * copybook-resolver.js's expand() applies REPLACING pairs to a
      * copybook's body BEFORE re-scanning that body for quotes/nested
      * COPY statements (applyReplacing happens first, then
      * expand(body, ...) - see its own source). This checks that
      * composition for real: a REPLACING pair whose OWN replacement
      * (BY) text is itself a quoted literal containing an ESCAPED
      * embedded quote (the COBOL doubled-quote convention) - and, that
      * literal's own text happens to read exactly like a COPY
      * statement ("COPY DONE.", j05's own lookalike), so it only
      * becomes "safe" text at all once substitution has actually
      * happened. Also checks that a completely separate, ordinary
      * quoted decoy literal physically AFTER the substituted token in
      * the SAME copybook body is still recognized correctly - i.e. the
      * quote/comment scan of the post-substitution text isn't thrown
      * off by whatever quote characters the substitution itself
      * introduced. A real, unrelated top-level "COPY DONE." (fetching
      * DECOY-REC/DECOY-FIELD) sits alongside, exactly like j05.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K03QREPL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY OUTERCPY REPLACING ==:PFX:== BY ==REC1==
                     ==:QVAL:== BY =="IT""S COPY DONE."==.
       COPY DONE.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MSG=" REC1-MSG.
           DISPLAY "DECOY-IN-CPY=" REC1-DECOY.
           DISPLAY "DECOY=" DECOY-FIELD.
           STOP RUN.
