       IDENTIFICATION DIVISION.
       PROGRAM-ID. P16PERFORM.
      *
      * Phase 2 corpus target (already partly supported): PERFORM
      * TIMES, UNTIL, VARYING (incl. two-level AFTER), and out-of-line
      * PERFORM ... THRU.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNTER          PIC 9(2) VALUE 0.
       01  WS-I                PIC 9(2).
       01  WS-J                PIC 9(2).
       01  WS-TIMES-SUM        PIC 9(3) VALUE 0.
       01  WS-UNTIL-SUM        PIC 9(3) VALUE 0.
       01  WS-VARYING-SUM      PIC 9(3) VALUE 0.
       01  WS-NESTED-SUM       PIC 9(4) VALUE 0.
       01  WS-THRU-SUM         PIC 9(4) VALUE 0.
       PROCEDURE DIVISION.
       0000-MAIN.
           PERFORM 3 TIMES
               ADD 1 TO WS-COUNTER
               ADD WS-COUNTER TO WS-TIMES-SUM
           END-PERFORM
      *
           MOVE 1 TO WS-I
           PERFORM UNTIL WS-I > 5
               ADD WS-I TO WS-UNTIL-SUM
               ADD 1 TO WS-I
           END-PERFORM
      *
           PERFORM VARYING WS-I FROM 1 BY 2 UNTIL WS-I > 10
               ADD WS-I TO WS-VARYING-SUM
           END-PERFORM
      *
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               AFTER WS-J FROM 1 BY 1 UNTIL WS-J > 2
               ADD 1 TO WS-NESTED-SUM
           END-PERFORM
      *
           PERFORM 2000-ADD-A THRU 2000-ADD-C
      *
           DISPLAY 'TIMES-SUM=' WS-TIMES-SUM
           DISPLAY 'UNTIL-SUM=' WS-UNTIL-SUM
           DISPLAY 'VARYING-SUM=' WS-VARYING-SUM
           DISPLAY 'NESTED-SUM=' WS-NESTED-SUM
           DISPLAY 'THRU-SUM=' WS-THRU-SUM
           STOP RUN.
      *
       2000-ADD-A.
           ADD 100 TO WS-THRU-SUM.
      *
       2000-ADD-B.
           ADD 200 TO WS-THRU-SUM.
      *
       2000-ADD-C.
           ADD 300 TO WS-THRU-SUM.
