       IDENTIFICATION DIVISION.
       PROGRAM-ID. P12SORT.
      *
      * Phase 2 corpus target: SORT verb with INPUT PROCEDURE /
      * OUTPUT PROCEDURE, sourcing from and returning into in-memory
      * tables (RELEASE/RETURN). The SD's ASSIGN name is a logical
      * work-file GnuCOBOL manages internally at runtime - no
      * external file needs to be provisioned to run this program.
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
           05  SORT-NAME       PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-I                PIC 9(2).
       01  WS-OUT-I            PIC 9(2) VALUE 0.
       01  WS-SORT-EOF         PIC X VALUE 'N'.
       01  WS-SRC-TABLE.
           05  WS-SRC-ENTRY    OCCURS 5 TIMES.
               10  WS-SRC-KEY  PIC 9(3).
               10  WS-SRC-NAME PIC X(10).
       01  WS-DST-TABLE.
           05  WS-DST-ENTRY    OCCURS 5 TIMES.
               10  WS-DST-KEY  PIC 9(3).
               10  WS-DST-NAME PIC X(10).
       PROCEDURE DIVISION.
       0000-MAIN.
           MOVE 300 TO WS-SRC-KEY(1)
           MOVE 'CCC' TO WS-SRC-NAME(1)
           MOVE 100 TO WS-SRC-KEY(2)
           MOVE 'AAA' TO WS-SRC-NAME(2)
           MOVE 500 TO WS-SRC-KEY(3)
           MOVE 'EEE' TO WS-SRC-NAME(3)
           MOVE 200 TO WS-SRC-KEY(4)
           MOVE 'BBB' TO WS-SRC-NAME(4)
           MOVE 400 TO WS-SRC-KEY(5)
           MOVE 'DDD' TO WS-SRC-NAME(5)
           SORT SORT-FILE ON ASCENDING KEY SORT-KEY
               INPUT PROCEDURE 1000-RELEASE-RECORDS
               OUTPUT PROCEDURE 2000-RETURN-RECORDS
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
               DISPLAY 'SORTED=' WS-DST-KEY(WS-I) ' ' WS-DST-NAME(WS-I)
           END-PERFORM
           STOP RUN.
      *
       1000-RELEASE-RECORDS.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 5
               MOVE WS-SRC-KEY(WS-I) TO SORT-KEY
               MOVE WS-SRC-NAME(WS-I) TO SORT-NAME
               RELEASE SORT-REC
           END-PERFORM.
      *
       2000-RETURN-RECORDS.
           PERFORM UNTIL WS-SORT-EOF = 'Y'
               RETURN SORT-FILE
                   AT END
                       MOVE 'Y' TO WS-SORT-EOF
                   NOT AT END
                       ADD 1 TO WS-OUT-I
                       MOVE SORT-KEY TO WS-DST-KEY(WS-OUT-I)
                       MOVE SORT-NAME TO WS-DST-NAME(WS-OUT-I)
               END-RETURN
           END-PERFORM.
