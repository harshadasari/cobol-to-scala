      * Adversarial (round 21): an OUTER SORT with an INPUT PROCEDURE /
      * OUTPUT PROCEDURE, whose OUTPUT PROCEDURE calls a SEPARATE
      * subprogram that runs its OWN, independent SORT (own SD, own
      * work file) MID-STREAM (while the outer SORT's own RETURN loop
      * is still open) - and again, a second time, AFTER the outer SORT
      * has fully finished. Checks GnuCOBOL's/this generator's SORT
      * runtime support handles two independent SD/sort-work areas that
      * are active (one still open) across a CALL boundary, not just
      * sequential unrelated SORTs.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J09NESTSORT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "J09SORTWK".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  S-KEY PIC 9(3).
           05  S-VAL PIC X(4).
       WORKING-STORAGE SECTION.
       01  WS-I PIC 9(2) VALUE 0.
       01  WS-DATA-TABLE.
           05  WS-DATA-ITEM OCCURS 4 TIMES.
               10  WS-D-KEY PIC 9(3).
               10  WS-D-VAL PIC X(4).
       01  WS-INNER-DONE PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 030 TO WS-D-KEY(1). MOVE "CCC " TO WS-D-VAL(1).
           MOVE 010 TO WS-D-KEY(2). MOVE "AAA " TO WS-D-VAL(2).
           MOVE 040 TO WS-D-KEY(3). MOVE "DDD " TO WS-D-VAL(3).
           MOVE 020 TO WS-D-KEY(4). MOVE "BBB " TO WS-D-VAL(4).

           SORT SORT-FILE ASCENDING KEY S-KEY
               INPUT PROCEDURE IS FEED-PARA
               OUTPUT PROCEDURE IS EMIT-PARA.

           DISPLAY "AFTER-OUTER-SORT".
           CALL "J09INNERSORT".
           DISPLAY "AFTER-CALL-TO-INNER".
           STOP RUN.

       FEED-PARA.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 4
               MOVE WS-D-KEY(WS-I) TO S-KEY
               MOVE WS-D-VAL(WS-I) TO S-VAL
               RELEASE SORT-REC
           END-PERFORM.

       EMIT-PARA.
           MOVE "N" TO WS-INNER-DONE.
           PERFORM UNTIL WS-INNER-DONE = "Y"
               RETURN SORT-FILE AT END MOVE "Y" TO WS-INNER-DONE
               NOT AT END
                   DISPLAY "OUTER-SORTED=" S-KEY " " S-VAL
                   IF S-KEY = 020
                       DISPLAY "OUTER-SORT-CALLING-INNER-MIDSTREAM"
                       CALL "J09INNERSORT"
                   END-IF
           END-PERFORM.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. J09INNERSORT.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INNER-SORT-FILE ASSIGN TO "J09INNERWK".
       DATA DIVISION.
       FILE SECTION.
       SD  INNER-SORT-FILE.
       01  INNER-SORT-REC.
           05  IS-KEY PIC 9(3).
       WORKING-STORAGE SECTION.
       01  WS-J PIC 9(2) VALUE 0.
       01  WS-VALS.
           05  WS-VAL-ITEM PIC 9(3) OCCURS 3 TIMES.
       01  WS-DONE PIC X VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 300 TO WS-VAL-ITEM(1).
           MOVE 100 TO WS-VAL-ITEM(2).
           MOVE 200 TO WS-VAL-ITEM(3).
           SORT INNER-SORT-FILE ASCENDING KEY IS-KEY
               INPUT PROCEDURE IS INNER-FEED
               OUTPUT PROCEDURE IS INNER-EMIT.
           GOBACK.
       INNER-FEED.
           PERFORM VARYING WS-J FROM 1 BY 1 UNTIL WS-J > 3
               MOVE WS-VAL-ITEM(WS-J) TO IS-KEY
               RELEASE INNER-SORT-REC
           END-PERFORM.
       INNER-EMIT.
           MOVE "N" TO WS-DONE.
           PERFORM UNTIL WS-DONE = "Y"
               RETURN INNER-SORT-FILE AT END MOVE "Y" TO WS-DONE
               NOT AT END
                   DISPLAY "INNER-SORTED=" IS-KEY
           END-PERFORM.
       END PROGRAM J09INNERSORT.
       END PROGRAM J09NESTSORT.
