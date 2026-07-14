      * Adversarial (round 24): PERFORM ... THRU where the FROM and TO
      * paragraph names are the SAME paragraph - a degenerate, single-
      * paragraph THRU range. Legal COBOL (THRU doesn't require the two
      * names to differ), never exercised by any prior corpus program
      * (every existing THRU program - r08, x08, p14, b3, etc. - spans at
      * least two distinct paragraphs). Checks that generatePerformThruMethod
      * (or whichever THRU code path is chosen for a one-paragraph range)
      * doesn't double-run/skip the sole paragraph's own body.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M12PERFTHRUSAME.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-CNT PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE".
           PERFORM SOLO-PARA THRU SOLO-PARA.
           DISPLAY "AFTER CNT=" WS-CNT.
           STOP RUN.
       SOLO-PARA.
           ADD 1 TO WS-CNT.
           DISPLAY "IN-SOLO CNT=" WS-CNT.
