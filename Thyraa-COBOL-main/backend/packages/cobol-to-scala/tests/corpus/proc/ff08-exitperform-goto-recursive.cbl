      * ff08: A PERFORM ... UNTIL loop containing an early EXIT PERFORM,
      * COMBINED with a GO TO that jumps out of the CURRENT paragraph
      * entirely (to a paragraph in a different SECTION) right after the
      * loop - all inside a RECURSIVE program's own nested-local-def
      * paragraph. EXIT PERFORM uses scala.util.boundary.break() (round-
      * 29 finding ee14), and GO TO's target call now passes `_chain =
      * true` (dd05's post-merge fix) - this checks the two mechanisms
      * layered together in the SAME paragraph body don't collide (e.g.
      * the GO TO's own chained call accidentally being interpreted as
      * still "inside" the loop's boundary, or the boundary swallowing
      * the GO TO's control transfer).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF08MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "FF08SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF08SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       01  WS-I            PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       SECTION-A SECTION.
       PARA-A1.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           MOVE 1 TO WS-I.
           PERFORM UNTIL WS-I > 5
               DISPLAY "LOOP I=" WS-I " DEPTH=" LS-DEPTH
               IF WS-I = 2
                   GO TO PARA-B1
               END-IF
               ADD 1 TO WS-I
           END-PERFORM.
           DISPLAY "AFTER-LOOP-SHOULD-NOT-PRINT DEPTH=" LS-DEPTH.
       SECTION-B SECTION.
       PARA-B1.
           DISPLAY "IN-B1 DEPTH=" LS-DEPTH.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "FF08SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM FF08SUB.
       END PROGRAM FF08MAIN.
