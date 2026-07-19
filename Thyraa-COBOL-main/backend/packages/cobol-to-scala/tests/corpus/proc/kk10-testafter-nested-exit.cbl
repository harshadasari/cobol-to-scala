      * kk10 (round 35): PERFORM ... WITH TEST AFTER (a do-while loop -
      * condition checked AFTER the body, so it always runs at least once)
      * NESTED two levels deep, with EXIT PERFORM inside the INNER
      * TEST-AFTER loop only - confirms EXIT PERFORM terminates just the
      * inner loop (not the outer one), and that the outer TEST-AFTER
      * loop's own post-body condition check still runs normally on the
      * very next outer iteration after the inner loop exits early.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK10TESTAFTEREXIT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-OUTER PIC 9(2) VALUE 0.
       01  WS-INNER PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM WITH TEST AFTER VARYING WS-OUTER FROM 1 BY 1
               UNTIL WS-OUTER >= 3
               DISPLAY "OUTER=" WS-OUTER
               MOVE 0 TO WS-INNER
               PERFORM WITH TEST AFTER VARYING WS-INNER FROM 1 BY 1
                   UNTIL WS-INNER >= 5
                   DISPLAY "  INNER=" WS-INNER
                   IF WS-INNER = 2
                       EXIT PERFORM
                   END-IF
               END-PERFORM
               DISPLAY "  INNER-AFTER=" WS-INNER
           END-PERFORM.
           DISPLAY "OUTER-AFTER=" WS-OUTER.
           STOP RUN.
