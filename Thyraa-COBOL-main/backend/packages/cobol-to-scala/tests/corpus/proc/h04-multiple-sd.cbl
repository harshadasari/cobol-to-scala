       IDENTIFICATION DIVISION.
       PROGRAM-ID. H04MULTISD.
      *
      * Adversarial (round 19): TWO separate SD (sort file)
      * descriptions in one program, each independently SORTed with
      * its own INPUT/OUTPUT PROCEDURE pair. No prior corpus program
      * (rounds 1-18) declares more than one SD - checks whether the
      * SD/sort-file registry (buildSortFileRegistry) keys correctly
      * per-file rather than assuming a single global sort buffer.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE-A ASSIGN TO "SORTWKA".
           SELECT SORT-FILE-B ASSIGN TO "SORTWKB".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE-A.
       01  SORT-REC-A.
           05  SA-KEY          PIC 9(3).
           05  SA-NAME         PIC X(4).
       SD  SORT-FILE-B.
       01  SORT-REC-B.
           05  SB-KEY          PIC 9(3).
           05  SB-NAME         PIC X(4).
       WORKING-STORAGE SECTION.
       01  WS-I                PIC 9(2).
       01  WS-OUT-I            PIC 9(2) VALUE 0.
       01  WS-EOF-A            PIC X VALUE 'N'.
       01  WS-EOF-B            PIC X VALUE 'N'.
       01  WS-SRC-A.
           05  WS-SRC-A-ENTRY   OCCURS 3 TIMES.
               10  WS-SRC-A-KEY  PIC 9(3).
               10  WS-SRC-A-NAME PIC X(4).
       01  WS-SRC-B.
           05  WS-SRC-B-ENTRY   OCCURS 3 TIMES.
               10  WS-SRC-B-KEY  PIC 9(3).
               10  WS-SRC-B-NAME PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 300 TO WS-SRC-A-KEY(1)
           MOVE 'AA1' TO WS-SRC-A-NAME(1)
           MOVE 100 TO WS-SRC-A-KEY(2)
           MOVE 'AA2' TO WS-SRC-A-NAME(2)
           MOVE 200 TO WS-SRC-A-KEY(3)
           MOVE 'AA3' TO WS-SRC-A-NAME(3)

           MOVE 900 TO WS-SRC-B-KEY(1)
           MOVE 'BB1' TO WS-SRC-B-NAME(1)
           MOVE 700 TO WS-SRC-B-KEY(2)
           MOVE 'BB2' TO WS-SRC-B-NAME(2)
           MOVE 800 TO WS-SRC-B-KEY(3)
           MOVE 'BB3' TO WS-SRC-B-NAME(3)

           SORT SORT-FILE-A ASCENDING KEY SA-KEY
               INPUT PROCEDURE 1000-RELEASE-A
               OUTPUT PROCEDURE 2000-RETURN-A

           SORT SORT-FILE-B DESCENDING KEY SB-KEY
               INPUT PROCEDURE 3000-RELEASE-B
               OUTPUT PROCEDURE 4000-RETURN-B

           STOP RUN.
      *
       1000-RELEASE-A.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               MOVE WS-SRC-A-KEY(WS-I) TO SA-KEY
               MOVE WS-SRC-A-NAME(WS-I) TO SA-NAME
               RELEASE SORT-REC-A
           END-PERFORM.
      *
       2000-RETURN-A.
           MOVE 'N' TO WS-EOF-A
           PERFORM UNTIL WS-EOF-A = 'Y'
               RETURN SORT-FILE-A
                   AT END
                       MOVE 'Y' TO WS-EOF-A
                   NOT AT END
                       DISPLAY 'A-SORTED=' SA-KEY ' ' SA-NAME
               END-RETURN
           END-PERFORM.
      *
       3000-RELEASE-B.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               MOVE WS-SRC-B-KEY(WS-I) TO SB-KEY
               MOVE WS-SRC-B-NAME(WS-I) TO SB-NAME
               RELEASE SORT-REC-B
           END-PERFORM.
      *
       4000-RETURN-B.
           MOVE 'N' TO WS-EOF-B
           PERFORM UNTIL WS-EOF-B = 'Y'
               RETURN SORT-FILE-B
                   AT END
                       MOVE 'Y' TO WS-EOF-B
                   NOT AT END
                       DISPLAY 'B-SORTED=' SB-KEY ' ' SB-NAME
               END-RETURN
           END-PERFORM.
       END PROGRAM H04MULTISD.
