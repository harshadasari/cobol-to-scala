       IDENTIFICATION DIVISION.
       PROGRAM-ID. S06BFILMV.
      * Isolation follow-up to s06: same group-with-FILLER MOVE, but
      * avoid DISPLAYing the raw group itself (a separate, already-
      * confirmed gap) so the FILLER-bearing group-to-group MOVE's own
      * correctness can be checked in isolation via its elementary
      * (addressable) children only.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SOURCE.
           05  WS-S-TAG        PIC X(3) VALUE "TAG".
           05  FILLER          PIC X(2) VALUE "--".
           05  WS-S-VAL        PIC 9(4) VALUE 5678.
           05  FILLER          PIC X(2) VALUE "==".
       01  WS-TARGET.
           05  WS-T-TAG        PIC X(3).
           05  FILLER          PIC X(2).
           05  WS-T-VAL        PIC 9(4).
           05  FILLER          PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE WS-SOURCE TO WS-TARGET.
           DISPLAY "TARGET-TAG=" WS-T-TAG " TARGET-VAL=" WS-T-VAL.
           STOP RUN.
