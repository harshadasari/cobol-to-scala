       IDENTIFICATION DIVISION.
       PROGRAM-ID. R06SRTMK.
      *
      * Adversarial: multi-key SORT (primary ASCENDING on a COMP-3
      * key, secondary DESCENDING on a DISPLAY-usage key needed to
      * break ties), plus RELEASE ... FROM and RETURN ... INTO
      * (whole-record auto-move forms, instead of manual field-by-
      * field MOVE as in the baseline corpus p12-sort.cbl).
      *
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "SORTWK1".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-DEPT       PIC 9(3) COMP-3.
           05  SORT-SCORE      PIC 9(3).
           05  SORT-NAME       PIC X(2).
       WORKING-STORAGE SECTION.
       01  WS-I                PIC 9(2).
       01  WS-SRC-TABLE.
           05  WS-SRC-ENTRY    OCCURS 6 TIMES.
               10  WS-SRC-DEPT  PIC 9(3) COMP-3.
               10  WS-SRC-SCORE PIC 9(3).
               10  WS-SRC-NAME  PIC X(2).
       01  WS-DST-TABLE.
           05  WS-DST-ENTRY    OCCURS 6 TIMES.
               10  WS-DST-DEPT  PIC 9(3) COMP-3.
               10  WS-DST-SCORE PIC 9(3).
               10  WS-DST-NAME  PIC X(2).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 20 TO WS-SRC-DEPT(1)
           MOVE 50 TO WS-SRC-SCORE(1)
           MOVE 'X1' TO WS-SRC-NAME(1)
           MOVE 10 TO WS-SRC-DEPT(2)
           MOVE 70 TO WS-SRC-SCORE(2)
           MOVE 'Y1' TO WS-SRC-NAME(2)
           MOVE 20 TO WS-SRC-DEPT(3)
           MOVE 90 TO WS-SRC-SCORE(3)
           MOVE 'X2' TO WS-SRC-NAME(3)
           MOVE 10 TO WS-SRC-DEPT(4)
           MOVE 60 TO WS-SRC-SCORE(4)
           MOVE 'Y2' TO WS-SRC-NAME(4)
           MOVE 30 TO WS-SRC-DEPT(5)
           MOVE 40 TO WS-SRC-SCORE(5)
           MOVE 'Z1' TO WS-SRC-NAME(5)
           MOVE 20 TO WS-SRC-DEPT(6)
           MOVE 80 TO WS-SRC-SCORE(6)
           MOVE 'X3' TO WS-SRC-NAME(6)
      *
           SORT SORT-FILE
               ON ASCENDING KEY SORT-DEPT
               ON DESCENDING KEY SORT-SCORE
               INPUT PROCEDURE 1000-RELEASE-RECORDS
               OUTPUT PROCEDURE 2000-RETURN-RECORDS
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 6
               DISPLAY 'MK-SORTED=' WS-DST-DEPT(WS-I) ' '
                   WS-DST-SCORE(WS-I) ' ' WS-DST-NAME(WS-I)
           END-PERFORM
           STOP RUN.
      *
       1000-RELEASE-RECORDS.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 6
               RELEASE SORT-REC FROM WS-SRC-ENTRY(WS-I)
           END-PERFORM.
      *
       2000-RETURN-RECORDS.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 6
               RETURN SORT-FILE INTO WS-DST-ENTRY(WS-I)
                   AT END
                       DISPLAY 'MK-UNEXPECTED-EOF'
               END-RETURN
           END-PERFORM.
