       IDENTIFICATION DIVISION.
       PROGRAM-ID. P14GODEP.
      *
      * Phase 2 corpus target: GO TO ... DEPENDING ON. The dispatch
      * paragraph and its case targets are all inside a single
      * PERFORM ... THRU range so that both the explicit GO TO exits
      * and the natural fall-through case are well-defined. An
      * out-of-range selector value falls through to the next
      * sentence (no match => no transfer), per COBOL-85 semantics.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SELECTOR         PIC 9(2).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 2 TO WS-SELECTOR
           PERFORM 1000-DISPATCH THRU 1900-DISPATCH-EXIT
           MOVE 1 TO WS-SELECTOR
           PERFORM 1000-DISPATCH THRU 1900-DISPATCH-EXIT
           MOVE 3 TO WS-SELECTOR
           PERFORM 1000-DISPATCH THRU 1900-DISPATCH-EXIT
           MOVE 9 TO WS-SELECTOR
           PERFORM 1000-DISPATCH THRU 1900-DISPATCH-EXIT
           STOP RUN.
      *
       1000-DISPATCH.
           GO TO 1100-CASE-ONE 1200-CASE-TWO 1300-CASE-THREE
               DEPENDING ON WS-SELECTOR.
           DISPLAY 'DISPATCH=OUT-OF-RANGE'.
           GO TO 1900-DISPATCH-EXIT.
      *
       1100-CASE-ONE.
           DISPLAY 'DISPATCH=CASE-ONE'.
           GO TO 1900-DISPATCH-EXIT.
      *
       1200-CASE-TWO.
           DISPLAY 'DISPATCH=CASE-TWO'.
           GO TO 1900-DISPATCH-EXIT.
      *
       1300-CASE-THREE.
           DISPLAY 'DISPATCH=CASE-THREE'.
      *
       1900-DISPATCH-EXIT.
           EXIT.
