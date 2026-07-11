       IDENTIFICATION DIVISION.
       PROGRAM-ID. SECT01.
      *
      * Round-4 attack: PERFORM of a SECTION name (not a paragraph -
      * must run every paragraph inside that section, in order, then
      * return control right after the PERFORM statement), and natural
      * section fall-through (reaching the end of one section's last
      * paragraph with no PERFORM/GO TO must continue automatically
      * into the very next section's first paragraph, exactly like
      * paragraph fall-through).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DUMMY            PIC X(1) VALUE 'A'.
       PROCEDURE DIVISION.
       0000-MAIN SECTION.
       0000-ENTRY.
           DISPLAY 'START'.
      *    Falls through (no PERFORM/GO TO) into 1000-FALLTHRU SECTION.
       1000-FALLTHRU SECTION.
       1000-PARA-A.
           DISPLAY 'FALLTHRU-PARA-A'.
       1000-PARA-B.
           DISPLAY 'FALLTHRU-PARA-B'.
      *    Falls through into 2000-SECOND SECTION.
       2000-SECOND SECTION.
       2000-PARA-A.
           DISPLAY 'SECOND-PARA-A'.
       2000-PARA-B.
           DISPLAY 'SECOND-PARA-B'.
           PERFORM 3000-THIRD
           DISPLAY 'AFTER-PERFORM-OF-THIRD-SECTION'.
           STOP RUN.
      *    3000-THIRD is only ever reached via the explicit PERFORM
      *    above - falling off its own last paragraph must RETURN to
      *    that PERFORM's caller, NOT continue into 4000-UNREACHED.
       3000-THIRD SECTION.
       3000-PARA-A.
           DISPLAY 'THIRD-PARA-A'.
       3000-PARA-B.
           DISPLAY 'THIRD-PARA-B'.
       4000-UNREACHED SECTION.
       4000-PARA-A.
           DISPLAY 'SHOULD-NOT-APPEAR'.
