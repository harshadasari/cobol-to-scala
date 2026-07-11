       IDENTIFICATION DIVISION.
       PROGRAM-ID. P05ODO.
      *
      * Phase 1 corpus: OCCURS ... DEPENDING ON, with the count
      * varied at runtime between three PERFORM VARYING passes.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNT            PIC 9(2) VALUE 0.
       01  WS-I                PIC 9(2).
       01  WS-SUM              PIC 9(5).
       01  WS-TABLE.
           05  WS-ENTRY        PIC 9(3) OCCURS 1 TO 10 TIMES
                                   DEPENDING ON WS-COUNT.
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 4 TO WS-COUNT
           MOVE 100 TO WS-ENTRY(1)
           MOVE 200 TO WS-ENTRY(2)
           MOVE 300 TO WS-ENTRY(3)
           MOVE 400 TO WS-ENTRY(4)
           PERFORM 1000-SUM-TABLE
           DISPLAY 'COUNT=' WS-COUNT
           DISPLAY 'SUM=' WS-SUM
      *
           MOVE 7 TO WS-COUNT
           MOVE 500 TO WS-ENTRY(5)
           MOVE 600 TO WS-ENTRY(6)
           MOVE 700 TO WS-ENTRY(7)
           PERFORM 1000-SUM-TABLE
           DISPLAY 'COUNT=' WS-COUNT
           DISPLAY 'SUM=' WS-SUM
      *
           MOVE 2 TO WS-COUNT
           PERFORM 1000-SUM-TABLE
           DISPLAY 'COUNT=' WS-COUNT
           DISPLAY 'SUM=' WS-SUM
           STOP RUN.
      *
       1000-SUM-TABLE.
           MOVE 0 TO WS-SUM
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-COUNT
               ADD WS-ENTRY(WS-I) TO WS-SUM
           END-PERFORM.
