       IDENTIFICATION DIVISION.
       PROGRAM-ID. R08THRUGO.
      *
      * Adversarial: PERFORM A THRU C where the middle paragraph B
      * contains a GO TO back to A, still inside the active PERFORM's
      * range. Per COBOL-85 this is well-defined in-line control flow
      * (not a perform re-entry) - execution keeps looping through
      * A/B until B's guard condition stops the GO TO, then falls
      * through B into C, and only THEN does control return to the
      * statement after the PERFORM (falling off the end of the last
      * paragraph in the THRU range). A transpiler that turns
      * PERFORM A THRU C into "call A(); call B(); call C()" (each
      * exactly once, ignoring an internal GO TO) will diverge here.
      * Bounded by WS-LOOP-COUNT so this terminates either way.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-LOOP-COUNT       PIC 9(2) VALUE 0.
       01  WS-TOTAL            PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 1000-A THRU 1000-C
           DISPLAY 'LOOP-COUNT=' WS-LOOP-COUNT
           DISPLAY 'TOTAL=' WS-TOTAL
           STOP RUN.
      *
       1000-A.
           ADD 1 TO WS-LOOP-COUNT
           ADD 10 TO WS-TOTAL.
      *
       1000-B.
           ADD 1 TO WS-TOTAL
           IF WS-LOOP-COUNT < 4
               GO TO 1000-A
           END-IF.
      *
       1000-C.
           ADD 100 TO WS-TOTAL.
