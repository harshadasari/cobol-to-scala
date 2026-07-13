      * Adversarial (round 21): PERFORM ... WITH TEST BEFORE and WITH
      * TEST AFTER, run back-to-back, where the table SUBSCRIPT used
      * inside the loop body (WS-J) is mutated via a nested CALL ...
      * USING BY REFERENCE writeback (not a plain in-line MOVE/ADD) on
      * every iteration - checks the TEST BEFORE/AFTER timing
      * difference (one fewer vs. one more body execution) still holds
      * when the subscript's own mutation is hidden behind a CALL
      * boundary rather than a visible statement in the loop body.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J06PERFSUBWB.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE PIC X(3) OCCURS 5 TIMES.
       01  WS-J PIC 9 VALUE 1.
       01  WS-I PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-TABLE(1).
           MOVE "BBB" TO WS-TABLE(2).
           MOVE "CCC" TO WS-TABLE(3).
           MOVE "DDD" TO WS-TABLE(4).
           MOVE "EEE" TO WS-TABLE(5).

           DISPLAY "-- TEST BEFORE --".
           MOVE 1 TO WS-J.
           PERFORM WITH TEST BEFORE VARYING WS-I FROM 1 BY 1
                   UNTIL WS-I > 3
               CALL "J06BUMPJ" USING BY REFERENCE WS-J
               DISPLAY "I=" WS-I " J=" WS-J " TABLE(J)=" WS-TABLE(WS-J)
           END-PERFORM.

           DISPLAY "-- TEST AFTER --".
           MOVE 1 TO WS-J.
           PERFORM WITH TEST AFTER VARYING WS-I FROM 1 BY 1
                   UNTIL WS-I > 3
               CALL "J06BUMPJ" USING BY REFERENCE WS-J
               DISPLAY "I=" WS-I " J=" WS-J " TABLE(J)=" WS-TABLE(WS-J)
           END-PERFORM.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. J06BUMPJ.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LS-J PIC 9.
       PROCEDURE DIVISION USING LS-J.
       MAIN-PARA.
           IF LS-J < 5
               ADD 1 TO LS-J
           END-IF.
           GOBACK.
       END PROGRAM J06BUMPJ.
       END PROGRAM J06PERFSUBWB.
