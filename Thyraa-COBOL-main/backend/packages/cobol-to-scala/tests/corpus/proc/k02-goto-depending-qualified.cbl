      * Adversarial (round 22): round-21 finding 3 fixed a SINGLE
      * unconditional qualified GO TO ("GO TO 1000-PARA OF 3000-THIRD.",
      * j11). This attacks the SAME qualifier combined with GO TO's own
      * multi-target DEPENDING ON form - three DIFFERENT qualified
      * targets (a colliding "1000-PARA" name in three different
      * sections) selected by a subscript, index-aligned per-target
      * qualifiers rather than a single one - plus the pre-existing
      * "selector out of range falls through" behavior (j03) on top of
      * qualification. Structured as a called subprogram (GOBACK per
      * branch) driven from a loop of CALLs with LS-SEL = 1..4, so each
      * branch cleanly returns without depending on any further
      * cross-section fallthrough (sidestepping the OTHER, unrelated,
      * already-documented "GO TO into a paragraph that must then keep
      * falling through" known gap entirely).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K02GODEPQ.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               CALL "K02GODEPQSUB" USING WS-I
           END-PERFORM.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. K02GODEPQSUB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LS-SEL PIC 9.
       PROCEDURE DIVISION USING LS-SEL.
       0000-MAIN SECTION.
       0000-START.
           DISPLAY "SEL=" LS-SEL.
           GO TO 1000-PARA OF 2000-SECOND,
                 1000-PARA OF 3000-THIRD,
                 1000-PARA OF 4000-FOURTH
                 DEPENDING ON LS-SEL.
           DISPLAY "NO-MATCH-FALLTHROUGH".
           GOBACK.
       1000-PARA.
           DISPLAY "WRONG-1000-IN-MAIN-SECTION".
           GOBACK.
       2000-SECOND SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-SECOND".
           GOBACK.
       3000-THIRD SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-THIRD".
           GOBACK.
       4000-FOURTH SECTION.
       1000-PARA.
           DISPLAY "CHOSEN-FOURTH".
           GOBACK.
       END PROGRAM K02GODEPQSUB.
       END PROGRAM K02GODEPQ.
