       IDENTIFICATION DIVISION.
       PROGRAM-ID. I14CALLCONTMAIN.
      *
      * Adversarial (round 20): CALL ... USING BY CONTENT of a SINGLE
      * subscripted table element (WS-VAL(2)) - contrasted with
      * round-19 finding 3's BY REFERENCE fix (h12). BY CONTENT must
      * pass a COPY: the callee's mutation of its own local parameter
      * must NEVER be written back into the caller's table element.
      * Checks that h12's new subscripted writeback path is correctly
      * gated on the BY REFERENCE passing mode, not applied
      * unconditionally to every subscripted CALL argument regardless
      * of mode.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-VAL PIC X(5) OCCURS 3 TIMES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAAA" TO WS-VAL(1).
           MOVE "BBBBB" TO WS-VAL(2).
           MOVE "CCCCC" TO WS-VAL(3).
           CALL "I14CALLCONTSUB" USING BY CONTENT WS-VAL(2).
           DISPLAY "ROW1=" WS-VAL(1).
           DISPLAY "ROW2=" WS-VAL(2).
           DISPLAY "ROW3=" WS-VAL(3).
           STOP RUN.
       END PROGRAM I14CALLCONTMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. I14CALLCONTSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-VAL PIC X(5).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-PARA.
           DISPLAY "SUB-SAW=" LK-VAL.
           MOVE "ZZZZZ" TO LK-VAL.
       END PROGRAM I14CALLCONTSUB.
