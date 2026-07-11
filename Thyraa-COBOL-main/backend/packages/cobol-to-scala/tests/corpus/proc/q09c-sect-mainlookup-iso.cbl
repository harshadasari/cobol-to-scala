       IDENTIFICATION DIVISION.
       PROGRAM-ID. SECT01C.
      *
      * Isolation follow-up to sect01: entire PROCEDURE DIVISION
      * organized under SECTIONs with no top-level (section-less)
      * paragraph at all - does the @main entry point still find the
      * true first paragraph to call? Unique paragraph names
      * everywhere, no PERFORM-of-section mixed in (pure fall-through).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DUMMY            PIC X(1) VALUE 'A'.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-ENTRY.
           DISPLAY 'START'.
       1000-NEXT SECTION.
       1000-ONE.
           DISPLAY 'NEXT-ONE'.
       1000-TWO.
           DISPLAY 'NEXT-TWO'.
           STOP RUN.
