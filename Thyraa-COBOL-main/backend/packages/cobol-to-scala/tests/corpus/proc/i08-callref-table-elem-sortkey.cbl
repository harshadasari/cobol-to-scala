       IDENTIFICATION DIVISION.
       PROGRAM-ID. I08CRSKMAIN.
      *
      * Adversarial (round 20): CALL ... USING BY REFERENCE of a SINGLE
      * subscripted table element (round-19 finding 3's fix, h12),
      * where that SAME element's value is used to feed an SD record's
      * field that is ALSO declared as the SORT ASCENDING KEY - checks
      * that the callee's mutation of the table element is correctly
      * written back BEFORE the value is read into the sort, so the
      * sort order reflects the CALLEE's write, not the caller's
      * pre-call value.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "I08SORTWK".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  S-KEY PIC 9(3).
           05  S-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-KEY PIC 9(3) OCCURS 3 TIMES.
           05  WS-VAL PIC X(5) OCCURS 3 TIMES.
       01  WS-IDX PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 030 TO WS-KEY(1). MOVE "AAA  " TO WS-VAL(1).
           MOVE 010 TO WS-KEY(2). MOVE "BBB  " TO WS-VAL(2).
           MOVE 020 TO WS-KEY(3). MOVE "CCC  " TO WS-VAL(3).
           DISPLAY "BEFORE-CALL KEY2=" WS-KEY(2).
           CALL "I08CRSKSUB" USING BY REFERENCE WS-KEY(2).
           DISPLAY "AFTER-CALL KEY2=" WS-KEY(2).
           SORT SORT-FILE ASCENDING KEY S-KEY
               INPUT PROCEDURE IS FEED-PARA
               OUTPUT PROCEDURE IS EMIT-PARA.
           STOP RUN.
       FEED-PARA.
           PERFORM VARYING WS-IDX FROM 1 BY 1 UNTIL WS-IDX > 3
               MOVE WS-KEY(WS-IDX) TO S-KEY
               MOVE WS-VAL(WS-IDX) TO S-VAL
               RELEASE SORT-REC
           END-PERFORM.
       EMIT-PARA.
           RETURN SORT-FILE AT END GO TO EMIT-DONE.
           DISPLAY "SORTED=" S-KEY " " S-VAL.
           GO TO EMIT-PARA.
       EMIT-DONE.
           EXIT.
       END PROGRAM I08CRSKMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. I08CRSKSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-KEY PIC 9(3).
       PROCEDURE DIVISION USING LK-KEY.
       SUB-PARA.
           DISPLAY "SUB-SAW=" LK-KEY.
           MOVE 005 TO LK-KEY.
           GOBACK.
       END PROGRAM I08CRSKSUB.
