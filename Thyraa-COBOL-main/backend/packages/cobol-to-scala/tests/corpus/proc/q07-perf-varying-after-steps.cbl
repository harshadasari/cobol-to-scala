       IDENTIFICATION DIVISION.
       PROGRAM-ID. PERF01.
      *
      * Round-4 attack: PERFORM VARYING ... AFTER ... where the outer
      * and inner loop steps differ (and the outer step is negative),
      * plus PERFORM WITH TEST AFTER combined with a two-level VARYING
      * AFTER nest (post-condition timing applied to both levels).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-I                PIC S9(3).
       01  WS-J                PIC S9(3).
       01  WS-PAIR-COUNT       PIC 9(4) VALUE 0.
       01  WS-SUM              PIC S9(5) VALUE 0.
       01  WS-TA-I             PIC S9(3).
       01  WS-TA-J             PIC S9(3).
       01  WS-TA-PAIR-COUNT    PIC 9(4) VALUE 0.
       01  WS-TA-SUM           PIC S9(5) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
      *    Outer steps by +2 (descending would also be fine), inner
      *    steps by -3 - deliberately different, non-unit magnitudes.
           PERFORM VARYING WS-I FROM 1 BY 2 UNTIL WS-I > 5
               AFTER WS-J FROM 10 BY -3 UNTIL WS-J < 1
               DISPLAY 'I=' WS-I ' J=' WS-J
               ADD 1 TO WS-PAIR-COUNT
               ADD WS-I TO WS-SUM
               ADD WS-J TO WS-SUM
           END-PERFORM
           DISPLAY 'PAIR-COUNT=' WS-PAIR-COUNT
           DISPLAY 'SUM=' WS-SUM
           DISPLAY 'FINAL-I=' WS-I
           DISPLAY 'FINAL-J=' WS-J
      *
      *    WITH TEST AFTER combined with a two-level VARYING AFTER
      *    nest: post-condition timing for both loop levels.
           PERFORM WITH TEST AFTER VARYING WS-TA-I FROM 5 BY -2
                   UNTIL WS-TA-I < 1
                   AFTER WS-TA-J FROM 1 BY 3 UNTIL WS-TA-J > 7
               DISPLAY 'TA-I=' WS-TA-I ' TA-J=' WS-TA-J
               ADD 1 TO WS-TA-PAIR-COUNT
               ADD WS-TA-I TO WS-TA-SUM
               ADD WS-TA-J TO WS-TA-SUM
           END-PERFORM
           DISPLAY 'TA-PAIR-COUNT=' WS-TA-PAIR-COUNT
           DISPLAY 'TA-SUM=' WS-TA-SUM
           DISPLAY 'TA-FINAL-I=' WS-TA-I
           DISPLAY 'TA-FINAL-J=' WS-TA-J
      *
           STOP RUN.
