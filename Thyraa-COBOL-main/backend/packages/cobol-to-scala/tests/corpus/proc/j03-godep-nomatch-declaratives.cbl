      * Adversarial (round 21): a GO TO ... DEPENDING ON dispatch whose
      * selector matches NONE of the branches (falls through to the
      * ordinary next-sentence no-op, per p14's own already-covered
      * shape) - but this time in a program that ALSO has a
      * DECLARATIVES section registered elsewhere (an OPEN-failure
      * error handler on a file that genuinely doesn't exist on disk).
      * Neither ingredient alone is new (p14 covers the fallthrough,
      * b4/d10/aa01 etc. cover DECLARATIVES) - this checks the two
      * mechanisms' bookkeeping (paragraph/section collection,
      * DECLARATIVES-vs-ordinary dispatch tables) don't trip over each
      * other when combined in the same PROCEDURE DIVISION, the way
      * round-20's own i06 showed MERGE+DECLARATIVES could.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J03GODEPDECL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE ASSIGN TO "J03MISSING.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  IN-FILE.
       01  IN-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-SELECTOR PIC 9(2).
       PROCEDURE DIVISION.
       DECLARATIVES.
       IN-FILE-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON IN-FILE.
       IN-FILE-ERR-PARA.
           DISPLAY "DECLARATIVES-FIRED".
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       0000-MAIN.
           MOVE 9 TO WS-SELECTOR.
           PERFORM 1000-DISPATCH THRU 1900-DISPATCH-EXIT.
           OPEN INPUT IN-FILE.
           DISPLAY "AFTER-OPEN".
           STOP RUN.
       1000-DISPATCH.
           GO TO 1100-CASE-ONE 1200-CASE-TWO
               DEPENDING ON WS-SELECTOR.
           DISPLAY "DISPATCH=NO-MATCH".
           GO TO 1900-DISPATCH-EXIT.
       1100-CASE-ONE.
           DISPLAY "DISPATCH=CASE-ONE".
           GO TO 1900-DISPATCH-EXIT.
       1200-CASE-TWO.
           DISPLAY "DISPATCH=CASE-TWO".
       1900-DISPATCH-EXIT.
           EXIT.
