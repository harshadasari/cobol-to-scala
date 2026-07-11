       IDENTIFICATION DIVISION.
       PROGRAM-ID. S06GRPFILL.
      * Round-5 attack: a group item with interspersed FILLER bytes,
      * round-tripped through a group-to-group MOVE. FILLER bytes are
      * unnamed but still occupy real storage width; a MOVE of the
      * whole group must carry them along unchanged (they are never
      * separately addressable so cobc's own behavior for the FILLER
      * bytes' content in the target group is compiler-verified here,
      * not assumed).
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
           DISPLAY "TARGET-GROUP=[" WS-TARGET "]".
           DISPLAY "TARGET-TAG=" WS-T-TAG " TARGET-VAL=" WS-T-VAL.
           STOP RUN.
