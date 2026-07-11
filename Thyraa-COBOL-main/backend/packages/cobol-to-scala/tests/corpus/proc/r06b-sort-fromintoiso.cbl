       IDENTIFICATION DIVISION.
       PROGRAM-ID. R06BISOL.
      *
      * Isolation follow-up for r06: single ASCENDING key only (no
      * mixed-direction multi-key, no COMP-3), to isolate whether
      * RELEASE ... FROM and RETURN ... INTO (whole-record auto-move)
      * work on their own, independent of the other r06 attack
      * surfaces.
      *
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "SORTWK1".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY        PIC 9(3).
           05  SORT-NAME       PIC X(4).
       WORKING-STORAGE SECTION.
       01  WS-I                PIC 9(2).
       01  WS-SRC-TABLE.
           05  WS-SRC-ENTRY    OCCURS 3 TIMES.
               10  WS-SRC-KEY  PIC 9(3).
               10  WS-SRC-NAME PIC X(4).
       01  WS-DST-TABLE.
           05  WS-DST-ENTRY    OCCURS 3 TIMES.
               10  WS-DST-KEY  PIC 9(3).
               10  WS-DST-NAME PIC X(4).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 300 TO WS-SRC-KEY(1)
           MOVE 'CCC1' TO WS-SRC-NAME(1)
           MOVE 100 TO WS-SRC-KEY(2)
           MOVE 'AAA1' TO WS-SRC-NAME(2)
           MOVE 200 TO WS-SRC-KEY(3)
           MOVE 'BBB1' TO WS-SRC-NAME(3)
      *
           SORT SORT-FILE ON ASCENDING KEY SORT-KEY
               INPUT PROCEDURE 1000-RELEASE-RECORDS
               OUTPUT PROCEDURE 2000-RETURN-RECORDS
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY 'ISO-SORTED=' WS-DST-KEY(WS-I) ' '
                   WS-DST-NAME(WS-I)
           END-PERFORM
           STOP RUN.
      *
       1000-RELEASE-RECORDS.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               RELEASE SORT-REC FROM WS-SRC-ENTRY(WS-I)
           END-PERFORM.
      *
       2000-RETURN-RECORDS.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               RETURN SORT-FILE INTO WS-DST-ENTRY(WS-I)
                   AT END
                       DISPLAY 'ISO-UNEXPECTED-EOF'
               END-RETURN
           END-PERFORM.
