       IDENTIFICATION DIVISION.
       PROGRAM-ID. EVAL01.
      *
      * Round-4 attack: EVALUATE ... ALSO ... ALSO with three subjects,
      * and WHEN clauses using THRU ranges on the (non-first) ALSO
      * positions, including exact boundary values.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A                PIC 9(2).
       01  WS-B                PIC 9(2).
       01  WS-C                PIC X(1).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 3 TO WS-A
           MOVE 15 TO WS-B
           MOVE 'X' TO WS-C
           PERFORM 1000-EVAL
           DISPLAY 'T1=' WS-A ',' WS-B ',' WS-C
      *
           MOVE 8 TO WS-A
           MOVE 4 TO WS-B
           MOVE 'Y' TO WS-C
           PERFORM 1000-EVAL
           DISPLAY 'T2=' WS-A ',' WS-B ',' WS-C
      *
           MOVE 3 TO WS-A
           MOVE 15 TO WS-B
           MOVE 'Z' TO WS-C
           PERFORM 1000-EVAL
           DISPLAY 'T3=' WS-A ',' WS-B ',' WS-C
      *
           MOVE 5 TO WS-A
           MOVE 10 TO WS-B
           MOVE 'X' TO WS-C
           PERFORM 1000-EVAL
           DISPLAY 'T4=' WS-A ',' WS-B ',' WS-C
      *
           MOVE 6 TO WS-A
           MOVE 9 TO WS-B
           MOVE 'Y' TO WS-C
           PERFORM 1000-EVAL
           DISPLAY 'T5=' WS-A ',' WS-B ',' WS-C
      *
           MOVE 11 TO WS-A
           MOVE 1 TO WS-B
           MOVE 'X' TO WS-C
           PERFORM 1000-EVAL
           DISPLAY 'T6=' WS-A ',' WS-B ',' WS-C
      *
           STOP RUN.
      *
       1000-EVAL.
           EVALUATE WS-A ALSO WS-B ALSO WS-C
               WHEN 1 THRU 5 ALSO 10 THRU 20 ALSO 'X'
                   DISPLAY 'RESULT=CASE-1'
               WHEN 6 THRU 10 ALSO 1 THRU 9 ALSO 'Y'
                   DISPLAY 'RESULT=CASE-2'
               WHEN OTHER
                   DISPLAY 'RESULT=OTHER'
           END-EVALUATE.
