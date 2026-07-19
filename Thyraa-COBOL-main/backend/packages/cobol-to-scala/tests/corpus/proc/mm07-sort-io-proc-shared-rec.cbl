      * mm07 (round 37): fresh-territory probe - SORT with BOTH an INPUT
      * PROCEDURE and an OUTPUT PROCEDURE, where the two procedures
      * reference the SAME sort file's own SD record in DIFFERENT ways:
      * the INPUT PROCEDURE builds/RELEASEs SORT-REC through its primary
      * field names (SORT-KEY/SORT-NAME), while the OUTPUT PROCEDURE reads
      * the sorted records back with RETURN and additionally views the
      * SAME record through a REDEFINES (SORT-REC-ALT, a single flat
      * PIC X(7) over the whole record) to DISPLAY its raw combined text
      * alongside the individually-typed fields.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM07.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-WORK ASSIGN TO "MM07SRT".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-WORK.
       01  SORT-REC.
           05  SORT-KEY  PIC 9(2).
           05  SORT-NAME PIC X(5).
       01  SORT-REC-ALT REDEFINES SORT-REC PIC X(7).
       WORKING-STORAGE SECTION.
       01  WS-IDX      PIC 9(1).
       01  WS-SRC-TABLE.
           05  WS-SRC-ENTRY OCCURS 4 TIMES.
               10  WS-SRC-KEY  PIC 9(2).
               10  WS-SRC-NAME PIC X(5).
       01  WS-EOF      PIC X(1) VALUE "N".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 30 TO WS-SRC-KEY(1).
           MOVE "EE" TO WS-SRC-NAME(1).
           MOVE 10 TO WS-SRC-KEY(2).
           MOVE "AA" TO WS-SRC-NAME(2).
           MOVE 20 TO WS-SRC-KEY(3).
           MOVE "CC" TO WS-SRC-NAME(3).
           MOVE 15 TO WS-SRC-KEY(4).
           MOVE "BB" TO WS-SRC-NAME(4).

           SORT SORT-WORK ON ASCENDING KEY SORT-KEY
               INPUT PROCEDURE IS BUILD-RECORDS
               OUTPUT PROCEDURE IS EMIT-RECORDS.

           DISPLAY "DONE".
           STOP RUN.

       BUILD-RECORDS.
           PERFORM VARYING WS-IDX FROM 1 BY 1 UNTIL WS-IDX > 4
               MOVE WS-SRC-KEY(WS-IDX) TO SORT-KEY
               MOVE WS-SRC-NAME(WS-IDX) TO SORT-NAME
               RELEASE SORT-REC
           END-PERFORM.

       EMIT-RECORDS.
           PERFORM UNTIL WS-EOF = "Y"
               RETURN SORT-WORK
                   AT END
                       MOVE "Y" TO WS-EOF
                   NOT AT END
                       DISPLAY "KEY=" SORT-KEY " NAME=" SORT-NAME
                           " RAW=[" SORT-REC-ALT "]"
               END-RETURN
           END-PERFORM.
