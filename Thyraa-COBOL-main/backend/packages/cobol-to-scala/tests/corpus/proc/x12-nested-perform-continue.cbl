      * Round-10 probe x12: two independent statement-form attacks bundled
      * into one program. (1) EXIT PERFORM from the innermost of a 3-deep
      * nested inline PERFORM VARYING - only the round-3 finding-1 boundary
      * scoping should unwind, leaving the two outer loops running to
      * completion. (2) CONTINUE as the *sole* statement of both an IF's
      * THEN branch and an IF's ELSE branch (no other statement alongside
      * it in that branch), which round-7 finding 6's empty-branch audit
      * (n01/u07) should already render as an explicit no-op rather than
      * falling through into the wrong branch.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. X12NEST.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I PIC 9(2).
       01 WS-J PIC 9(2).
       01 WS-K PIC 9(2).
       01 WS-HITS PIC 9(3) VALUE 0.
       01 WS-X PIC 9(2) VALUE 5.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 3
                   PERFORM VARYING WS-K FROM 1 BY 1 UNTIL WS-K > 3
                       ADD 1 TO WS-HITS
                       IF WS-K = 2
                           EXIT PERFORM
                       END-IF
                   END-PERFORM
               END-PERFORM
           END-PERFORM.
           DISPLAY "HITS=" WS-HITS " I=" WS-I " J=" WS-J " K=" WS-K.
           IF WS-X > 3
               CONTINUE
           ELSE
               DISPLAY "SMALL"
           END-IF.
           DISPLAY "AFTER-IF X=" WS-X.
           IF WS-X > 100
               DISPLAY "HUGE"
           ELSE
               CONTINUE
           END-IF.
           DISPLAY "DONE".
           STOP RUN.
