       IDENTIFICATION DIVISION.
       PROGRAM-ID. R07PERFN.
      *
      * Adversarial: PERFORM VARYING ... BY -1 (descending loop), and
      * PERFORM WITH TEST AFTER (post-condition loop - body runs at
      * least once even if the UNTIL condition is already true before
      * the first iteration), including WITH TEST AFTER combined with
      * VARYING.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I                PIC S9(3).
       01  WS-DESC-SUM         PIC 9(4) VALUE 0.
       01  WS-DESC-COUNT       PIC 9(3) VALUE 0.
       01  WS-TESTAFTER-SUM    PIC 9(3) VALUE 0.
       01  WS-TESTAFTER-COUNT  PIC 9(2) VALUE 0.
       01  WS-VARY-AFTER-SUM   PIC 9(3) VALUE 0.
       01  WS-VARY-AFTER-COUNT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
      *    Descending PERFORM VARYING: 10,9,8,...,1 (10 iterations).
           PERFORM VARYING WS-I FROM 10 BY -1 UNTIL WS-I < 1
               ADD WS-I TO WS-DESC-SUM
               ADD 1 TO WS-DESC-COUNT
           END-PERFORM
      *
      *    WITH TEST AFTER, condition already true before first pass:
      *    body must still run exactly once (post-condition semantics).
           MOVE 99 TO WS-I
           PERFORM WITH TEST AFTER UNTIL WS-I > 5
               ADD 1 TO WS-TESTAFTER-SUM
               ADD 1 TO WS-TESTAFTER-COUNT
               ADD 1 TO WS-I
           END-PERFORM
      *
      *    WITH TEST AFTER combined with VARYING: increments THEN
      *    tests, so the loop runs one extra time versus WITH TEST
      *    BEFORE for the same bounds.
           PERFORM WITH TEST AFTER VARYING WS-I FROM 1 BY 1
                   UNTIL WS-I > 3
               ADD WS-I TO WS-VARY-AFTER-SUM
               ADD 1 TO WS-VARY-AFTER-COUNT
           END-PERFORM
      *
           DISPLAY 'DESC-SUM=' WS-DESC-SUM
           DISPLAY 'DESC-COUNT=' WS-DESC-COUNT
           DISPLAY 'TESTAFTER-SUM=' WS-TESTAFTER-SUM
           DISPLAY 'TESTAFTER-COUNT=' WS-TESTAFTER-COUNT
           DISPLAY 'VARY-AFTER-SUM=' WS-VARY-AFTER-SUM
           DISPLAY 'VARY-AFTER-COUNT=' WS-VARY-AFTER-COUNT
           DISPLAY 'FINAL-I=' WS-I
           STOP RUN.
