       IDENTIFICATION DIVISION.
       PROGRAM-ID. P17EVAL.
      *
      * Phase 2 corpus target (already partly supported): EVALUATE
      * with THRU ranges, OTHER, and multi-subject ALSO (incl. ANY).
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SCORE            PIC 9(3).
       01  WS-GRADE            PIC X(1).
       01  WS-ACCT-TYPE        PIC X(1).
       01  WS-ACCT-STATUS      PIC X(6).
       01  WS-ACTION           PIC X(10).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 95 TO WS-SCORE
           PERFORM 1000-GRADE
           DISPLAY 'SCORE=' WS-SCORE ' GRADE=' WS-GRADE
      *
           MOVE 85 TO WS-SCORE
           PERFORM 1000-GRADE
           DISPLAY 'SCORE=' WS-SCORE ' GRADE=' WS-GRADE
      *
           MOVE 72 TO WS-SCORE
           PERFORM 1000-GRADE
           DISPLAY 'SCORE=' WS-SCORE ' GRADE=' WS-GRADE
      *
           MOVE 40 TO WS-SCORE
           PERFORM 1000-GRADE
           DISPLAY 'SCORE=' WS-SCORE ' GRADE=' WS-GRADE
      *
           MOVE 'R' TO WS-ACCT-TYPE
           MOVE 'ACTIVE' TO WS-ACCT-STATUS
           PERFORM 2000-CLASSIFY
           DISPLAY 'TYPE=' WS-ACCT-TYPE ' STATUS=' WS-ACCT-STATUS
               ' ACTION=' WS-ACTION
      *
           MOVE 'R' TO WS-ACCT-TYPE
           MOVE 'CLOSED' TO WS-ACCT-STATUS
           PERFORM 2000-CLASSIFY
           DISPLAY 'TYPE=' WS-ACCT-TYPE ' STATUS=' WS-ACCT-STATUS
               ' ACTION=' WS-ACTION
      *
           MOVE 'C' TO WS-ACCT-TYPE
           MOVE 'ACTIVE' TO WS-ACCT-STATUS
           PERFORM 2000-CLASSIFY
           DISPLAY 'TYPE=' WS-ACCT-TYPE ' STATUS=' WS-ACCT-STATUS
               ' ACTION=' WS-ACTION
      *
           MOVE 'X' TO WS-ACCT-TYPE
           MOVE 'ACTIVE' TO WS-ACCT-STATUS
           PERFORM 2000-CLASSIFY
           DISPLAY 'TYPE=' WS-ACCT-TYPE ' STATUS=' WS-ACCT-STATUS
               ' ACTION=' WS-ACTION
           STOP RUN.
      *
       1000-GRADE.
           EVALUATE WS-SCORE
               WHEN 90 THRU 100
                   MOVE 'A' TO WS-GRADE
               WHEN 80 THRU 89
                   MOVE 'B' TO WS-GRADE
               WHEN 70 THRU 79
                   MOVE 'C' TO WS-GRADE
               WHEN OTHER
                   MOVE 'F' TO WS-GRADE
           END-EVALUATE.
      *
       2000-CLASSIFY.
           EVALUATE WS-ACCT-TYPE ALSO WS-ACCT-STATUS
               WHEN 'R' ALSO 'ACTIVE'
                   MOVE 'DISCOUNT' TO WS-ACTION
               WHEN 'R' ALSO 'CLOSED'
                   MOVE 'ARCHIVE' TO WS-ACTION
               WHEN 'C' ALSO ANY
                   MOVE 'REVIEW' TO WS-ACTION
               WHEN OTHER
                   MOVE 'NONE' TO WS-ACTION
           END-EVALUATE.
