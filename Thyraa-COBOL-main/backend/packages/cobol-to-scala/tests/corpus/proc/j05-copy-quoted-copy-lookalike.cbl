      * Adversarial (round 21): a copybook whose own (perfectly ordinary,
      * REPLACING-untouched) quoted VALUE literal happens to contain
      * text that reads exactly like a nested COPY statement ("SEE COPY
      * DONE." inside a PIC X(20) VALUE) - while the SAME program
      * legitimately has an UNRELATED top-level "COPY DONE." elsewhere
      * for a real, separate copybook named DONE. Real GnuCOBOL is
      * quote-aware in its own preprocessor: it treats the literal as
      * ordinary text and never re-triggers copybook expansion inside
      * a quoted string (verified directly: MSG=SEE COPY DONE. displays
      * intact, VAL=005, DECOY=OOPS - three independent, uncorrupted
      * values). This engine's copybook-resolver.js `COPY_PATTERN`
      * (parser/copybook-resolver.js) is a PURELY TEXTUAL regex with no
      * quote-context awareness at all, so it also matches "COPY DONE."
      * INSIDE the quoted literal on its recursive expand() pass over
      * the copybook body (confirmed directly via expandCopybooks(): the
      * quoted VALUE literal gets torn in half and the real DONE
      * copybook's own record layout gets spliced into the middle of
      * it). convertToScala() does NOT throw on this corrupted source -
      * it silently produces a compiling, running program whose
      * REC1-MSG value is truncated to just "SEE" (padded), a silent,
      * wrong value with no visible marker at all.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J05COPYQ.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       COPY OUTERCPY REPLACING ==:PFX:== BY ==REC1==.
       COPY DONE.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MSG=" REC1-MSG.
           DISPLAY "VAL=" SUB1-VAL.
           DISPLAY "DECOY=" DECOY-FIELD.
           STOP RUN.
