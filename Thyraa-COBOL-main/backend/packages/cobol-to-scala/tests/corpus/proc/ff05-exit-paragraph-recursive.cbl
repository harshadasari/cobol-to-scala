      * ff05: EXIT PARAGRAPH used mid-paragraph, inside a RECURSIVE
      * program - the round-29 refuter's own report treated EXIT
      * PARAGRAPH/SECTION/PERFORM as a "trio" but only explicitly
      * confirmed SECTION (ee09) and PERFORM (ee14) with dedicated
      * probes; PARAGRAPH is only exercised implicitly (round-29's fix
      * table describes gating it on paragraphsContainExitOfType(...,
      * 'PARAGRAPH') using scala.util.boundary.break(), mirroring EXIT
      * PERFORM's mechanism) but no corpus program actually names an
      * EXIT PARAGRAPH probe. This checks that firing it partway through
      * one paragraph correctly falls through to the NEXT paragraph in
      * the same section (unlike EXIT SECTION, which must skip ahead to
      * the next SECTION instead) and that the recursive sub-call still
      * completes correctly.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF05MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "FF05SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF05SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       SECTION-A SECTION.
       PARA-A1.
           DISPLAY "A1 DEPTH=" LS-DEPTH.
           IF LS-DEPTH = 1
               EXIT PARAGRAPH
           END-IF.
           DISPLAY "A1-TAIL DEPTH=" LS-DEPTH.
       PARA-A2.
           DISPLAY "A2 DEPTH=" LS-DEPTH.
       SECTION-B SECTION.
       PARA-B1.
           DISPLAY "B1 DEPTH=" LS-DEPTH.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "FF05SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM FF05SUB.
       END PROGRAM FF05MAIN.
