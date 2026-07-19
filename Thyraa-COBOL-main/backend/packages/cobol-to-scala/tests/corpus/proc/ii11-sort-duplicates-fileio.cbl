      * ii11: `SORT ... WITH DUPLICATES IN ORDER` (parsed into
      * statement.duplicates but never read anywhere by generateSort/
      * sortCascadeLines - confirmed via direct source inspection) has
      * never been combined with rounds-25-32's RELATIVE-file fixed-
      * width I/O machinery. Since sortCascadeLines already uses
      * ArrayBuffer.sortInPlaceWith (a stable sort, verified by its own
      * doc comment) ties are already preserved in RELEASE order
      * regardless of whether DUPLICATES is honored - a direct GnuCOBOL
      * probe (outside this corpus) confirmed cobc's own SORT is ALSO
      * stable for duplicate keys with or without the clause, so this is
      * expected to already match. This probes the full combination for
      * real: an INPUT PROCEDURE reading duplicate-keyed records straight
      * out of a RELATIVE file (RELEASE-ing each), SORT ASCENDING KEY
      * WITH DUPLICATES IN ORDER, an OUTPUT PROCEDURE writing the sorted
      * results into a SECOND RELATIVE file (RANDOM access, keyed WRITE),
      * then reading that second file back to confirm final on-disk
      * order/content.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II11SRTDUP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "II11SORT.DAT".
           SELECT IN-FILE ASSIGN TO "II11IN.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-IN-RKEY.
           SELECT OUT-FILE ASSIGN TO "II11OUT.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-OUT-RKEY.
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY   PIC 9(2).
           05  SORT-TAG   PIC X(3).
       FD  IN-FILE.
       01  IN-REC.
           05  IN-KEY     PIC 9(2).
           05  IN-TAG     PIC X(3).
       FD  OUT-FILE.
       01  OUT-REC.
           05  OUT-KEY    PIC 9(2).
           05  OUT-TAG    PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-IN-RKEY     PIC 9(3) VALUE 0.
       01  WS-OUT-RKEY    PIC 9(3) VALUE 0.
       01  WS-I           PIC 9(2).
       01  WS-EOF         PIC 9 VALUE 0.
       01  WS-TABLE.
           05  WS-ROW OCCURS 6 TIMES.
               10 WS-KEY PIC 9(2).
               10 WS-TAG PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 5 TO WS-KEY(1). MOVE "AAA" TO WS-TAG(1).
           MOVE 3 TO WS-KEY(2). MOVE "BBB" TO WS-TAG(2).
           MOVE 5 TO WS-KEY(3). MOVE "CCC" TO WS-TAG(3).
           MOVE 3 TO WS-KEY(4). MOVE "DDD" TO WS-TAG(4).
           MOVE 5 TO WS-KEY(5). MOVE "EEE" TO WS-TAG(5).
           MOVE 3 TO WS-KEY(6). MOVE "FFF" TO WS-TAG(6).

           OPEN OUTPUT IN-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 6
               MOVE WS-KEY(WS-I) TO IN-KEY
               MOVE WS-TAG(WS-I) TO IN-TAG
               WRITE IN-REC
           END-PERFORM.
           CLOSE IN-FILE.

           SORT SORT-FILE
               ASCENDING KEY SORT-KEY
               WITH DUPLICATES IN ORDER
               INPUT PROCEDURE IS RELEASE-RECS
               OUTPUT PROCEDURE IS WRITE-OUT.

           OPEN INPUT OUT-FILE.
           MOVE 0 TO WS-EOF.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 6
               MOVE WS-I TO WS-OUT-RKEY
               READ OUT-FILE
                   INVALID KEY DISPLAY "OUT-READ-INVALID AT " WS-I
                   NOT INVALID KEY
                       DISPLAY "OUT KEY=" OUT-KEY " TAG=" OUT-TAG
               END-READ
           END-PERFORM.
           CLOSE OUT-FILE.
           STOP RUN.
       RELEASE-RECS.
           OPEN INPUT IN-FILE.
           MOVE 0 TO WS-EOF.
           PERFORM UNTIL WS-EOF = 1
               READ IN-FILE
                   AT END MOVE 1 TO WS-EOF
                   NOT AT END
                       MOVE IN-KEY TO SORT-KEY
                       MOVE IN-TAG TO SORT-TAG
                       RELEASE SORT-REC
               END-READ
           END-PERFORM.
           CLOSE IN-FILE.
       WRITE-OUT.
           OPEN OUTPUT OUT-FILE.
           MOVE 0 TO WS-OUT-RKEY.
           MOVE 0 TO WS-EOF.
           PERFORM UNTIL WS-EOF = 1
               RETURN SORT-FILE
                   AT END MOVE 1 TO WS-EOF
                   NOT AT END
                       ADD 1 TO WS-OUT-RKEY
                       MOVE SORT-KEY TO OUT-KEY
                       MOVE SORT-TAG TO OUT-TAG
                       WRITE OUT-REC
               END-RETURN
           END-PERFORM.
           CLOSE OUT-FILE.
