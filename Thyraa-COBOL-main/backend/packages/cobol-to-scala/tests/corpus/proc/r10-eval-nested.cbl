       IDENTIFICATION DIVISION.
       PROGRAM-ID. R10EVALNS.
      *
      * Adversarial: EVALUATE whose subject is an arithmetic
      * expression (not a bare identifier), with a nested EVALUATE
      * TRUE inside one of the WHEN branches; and a second EVALUATE
      * using multi-subject ALSO where BOTH ranges must match (plus
      * an ANY wildcard on one side).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A                PIC 9(3).
       01  WS-B                PIC 9(3).
       01  WS-RESULT           PIC X(16).
       01  WS-SCORE            PIC 9(3).
       01  WS-AGE              PIC 9(3).
       01  WS-BAND             PIC X(16).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 7 TO WS-A
           MOVE 5 TO WS-B
           PERFORM 1000-CLASSIFY
           DISPLAY 'A=' WS-A ' B=' WS-B ' RESULT=' WS-RESULT
      *
           MOVE 3 TO WS-A
           MOVE 3 TO WS-B
           PERFORM 1000-CLASSIFY
           DISPLAY 'A=' WS-A ' B=' WS-B ' RESULT=' WS-RESULT
      *
           MOVE 1 TO WS-A
           MOVE 20 TO WS-B
           PERFORM 1000-CLASSIFY
           DISPLAY 'A=' WS-A ' B=' WS-B ' RESULT=' WS-RESULT
      *
           MOVE 95 TO WS-SCORE
           MOVE 30 TO WS-AGE
           PERFORM 2000-BAND
           DISPLAY 'SCORE=' WS-SCORE ' AGE=' WS-AGE ' BAND=' WS-BAND
      *
           MOVE 95 TO WS-SCORE
           MOVE 70 TO WS-AGE
           PERFORM 2000-BAND
           DISPLAY 'SCORE=' WS-SCORE ' AGE=' WS-AGE ' BAND=' WS-BAND
      *
           MOVE 50 TO WS-SCORE
           MOVE 30 TO WS-AGE
           PERFORM 2000-BAND
           DISPLAY 'SCORE=' WS-SCORE ' AGE=' WS-AGE ' BAND=' WS-BAND
           STOP RUN.
      *
       1000-CLASSIFY.
           EVALUATE WS-A + WS-B
               WHEN 0 THRU 5
                   MOVE 'LOW' TO WS-RESULT
               WHEN 6 THRU 15
                   EVALUATE TRUE
                       WHEN WS-A > WS-B
                           MOVE 'MID-A-BIGGER' TO WS-RESULT
                       WHEN WS-A = WS-B
                           MOVE 'MID-EQUAL' TO WS-RESULT
                       WHEN OTHER
                           MOVE 'MID-B-BIGGER' TO WS-RESULT
                   END-EVALUATE
               WHEN OTHER
                   MOVE 'HIGH' TO WS-RESULT
           END-EVALUATE.
      *
       2000-BAND.
           EVALUATE WS-SCORE ALSO WS-AGE
               WHEN 90 THRU 100 ALSO 18 THRU 65
                   MOVE 'PRIME' TO WS-BAND
               WHEN 90 THRU 100 ALSO ANY
                   MOVE 'HIGH-OTHERAGE' TO WS-BAND
               WHEN OTHER
                   MOVE 'STANDARD' TO WS-BAND
           END-EVALUATE.
