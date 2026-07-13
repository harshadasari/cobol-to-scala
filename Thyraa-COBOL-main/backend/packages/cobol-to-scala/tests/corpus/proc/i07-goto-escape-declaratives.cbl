       IDENTIFICATION DIVISION.
       PROGRAM-ID. I07GOTOESCDECL.
      *
      * Adversarial (round 20): round-19 finding 2 (h11)'s GO TO-
      * escaping-a-PERFORM-THRU-range honest decline, combined with an
      * ACTIVE DECLARATIVES error handler earlier in the SAME program
      * (triggered by a genuine OPEN failure on an unrelated file).
      * Checks whether the presence of DECLARATIVES/SECTIONS changes
      * paragraph/section bookkeeping enough to affect the escape
      * annotation (a crash or different symptom would be new; the
      * same documented TODO-marked honest decline would not be).
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "I07NOSUCHFILE"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       FILE-ERR-PARA.
           DISPLAY "FILE-ERROR-HANDLER".
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN INPUT SOME-FILE.
           DISPLAY "AFTER-OPEN".
           PERFORM STEP-ONE THRU STEP-THREE.
           DISPLAY "MAIN-DONE".
           STOP RUN.
       STEP-ONE.
           DISPLAY "STEP-ONE".
           GO TO STEP-TWO-B.
       STEP-TWO-A.
           DISPLAY "STEP-TWO-A".
      * falls through to STEP-THREE (still inside the THRU range)
       STEP-THREE.
           DISPLAY "STEP-THREE".
           GO TO STEP-FOUR.
       STEP-TWO-B.
           DISPLAY "STEP-TWO-B (outside THRU range)".
           GO TO STEP-FOUR.
       STEP-FOUR.
           DISPLAY "STEP-FOUR".
