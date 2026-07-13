       IDENTIFICATION DIVISION.
       PROGRAM-ID. H11ETGDEP.
      *
      * Adversarial (round 19): EVALUATE TRUE with a WHEN branch that
      * does a PERFORM ... THRU (a paragraph range), and one of those
      * paragraphs inside the range does a GO TO ... DEPENDING ON that
      * jumps to a DIFFERENT paragraph outside the THRU range - all
      * three nested together. Round-16 finding 4 (e10) fixed EVALUATE
      * ALSO + PERFORM THRU nesting; round-14/f14/g11 exercise GO TO
      * DEPENDING ON alone or crossing sections - but no prior probe
      * nests all three constructs inside one another simultaneously.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE             PIC X(1) VALUE "B".
       01  WS-BRANCH           PIC 9(1) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE TRUE
               WHEN WS-CODE = "A"
                   DISPLAY "CASE-A"
               WHEN WS-CODE = "B"
                   PERFORM STEP-ONE THRU STEP-THREE
               WHEN OTHER
                   DISPLAY "CASE-OTHER"
           END-EVALUATE.
           DISPLAY "MAIN-DONE".
           STOP RUN.
      *
       STEP-ONE.
           DISPLAY "STEP-ONE".
           GO TO STEP-TWO-A STEP-TWO-B DEPENDING ON WS-BRANCH.
      *
       STEP-TWO-A.
           DISPLAY "STEP-TWO-A".
      * falls through to STEP-THREE (still inside the THRU range)
       STEP-THREE.
           DISPLAY "STEP-THREE".
           GO TO STEP-FOUR.
      *
       STEP-TWO-B.
           DISPLAY "STEP-TWO-B (outside THRU range)".
           GO TO STEP-FOUR.
      *
       STEP-FOUR.
           DISPLAY "STEP-FOUR".
       END PROGRAM H11ETGDEP.
