       IDENTIFICATION DIVISION.
       PROGRAM-ID. SECT01B.
      *
      * Isolation follow-up to sect01: PERFORM of a SECTION name only
      * (entry paragraph kept top-level, unique paragraph names
      * everywhere, no other section corner mixed in).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-DUMMY            PIC X(1) VALUE 'A'.
       PROCEDURE DIVISION.
       0000-MAIN.
           DISPLAY 'START'
           PERFORM 2000-A-SECTION
           DISPLAY 'AFTER-PERFORM'
           STOP RUN.
       2000-A-SECTION SECTION.
       2000-ONE.
           DISPLAY 'SEC-ONE'.
       2000-TWO.
           DISPLAY 'SEC-TWO'.
