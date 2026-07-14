      * Adversarial (round 23): every PERFORM ... VARYING ... AFTER
      * corpus program to date uses a FIXED inner-loop limit (a
      * literal or a constant WORKING-STORAGE bound never touched by
      * the outer index) - a rectangular iteration space. This uses a
      * TRIANGULAR/staggered space instead: the inner index's own
      * UNTIL condition (WS-J > WS-I) depends on the OUTER index's
      * CURRENT value, so the inner loop's own trip count changes on
      * every outer iteration (1, then 2, then 3, then 4 inner passes).
      * A correct engine must re-evaluate the inner UNTIL condition
      * against the outer variable's live, per-iteration value, not a
      * value snapshotted once before the outer loop starts.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L06PERFTRI.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I PIC 9.
       01 WS-J PIC 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               AFTER WS-J FROM 1 BY 1 UNTIL WS-J > WS-I
                   DISPLAY "I=" WS-I " J=" WS-J
           END-PERFORM.
           DISPLAY "DONE I=" WS-I " J=" WS-J.
           STOP RUN.
