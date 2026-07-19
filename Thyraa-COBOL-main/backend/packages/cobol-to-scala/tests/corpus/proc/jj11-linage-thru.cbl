      * jj11: fresh interaction test between two independently-fixed
      * features - round-33's LINAGE WITH FOOTING AT fix and round-19's
      * PERFORM ... THRU nested-def wrapper convention
      * (generatePerformThruMethod/renderNestedFallthroughDefs). Uses
      * the SAME FOOTING/pageSize values as ii01 (5/3, deliberately
      * NOT the round-34 formula-bug-revealing values) so any mismatch
      * here is attributable to the THRU-wrapper interaction itself,
      * not to the separately-reported formula bug. The WRITE/AT
      * END-OF-PAGE statement lives in the MIDDLE paragraph of a
      * PERFORM ... THRU range, to check whether the LINAGE line-
      * counter state threads correctly through the THRU wrapper's own
      * nested-def paragraph bodies.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ11THRU.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "JJ11PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 5 LINES
           WITH FOOTING AT 3.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT PRINT-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 8
               PERFORM STEP-ONE THRU STEP-THREE
           END-PERFORM.
           CLOSE PRINT-FILE.
           STOP RUN.
       STEP-ONE.
           MOVE "LINE" TO PRINT-REC.
       STEP-TWO.
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP AT I=" WS-I
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP AT I=" WS-I
           END-WRITE.
       STEP-THREE.
           DISPLAY "STEP3 I=" WS-I.
