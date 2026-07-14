      * cc10: a combination not exercised by any prior round - SORT
      * (INPUT PROCEDURE/OUTPUT PROCEDURE) inside a RECURSIVE
      * program, so each recursive activation performs its own
      * independent SORT (with DIFFERENT data per depth level).
      * Probes whether the SD/SORT machinery's own internal state
      * (release/return cursors, and the INPUT/OUTPUT PROCEDURE
      * wrapper methods themselves) stays correctly isolated per
      * activation, the same way plain WORKING-STORAGE fields are
      * already confirmed to behave (rounds 21-25), or whether
      * round-25 finding 3's own "PERFORM ... THRU wrapper is always
      * a single shared top-level method, even inside a RECURSIVE
      * program's nested-paragraph convention" bug (fixed for
      * PERFORM-THRU specifically) has an unfixed analogue in SORT's
      * own INPUT/OUTPUT PROCEDURE wrapper generation.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "CC10SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC10SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SORT-FILE ASSIGN TO "CC10SORTWK".
       DATA DIVISION.
       FILE SECTION.
       SD  SORT-FILE.
       01  SORT-REC.
           05  SORT-KEY    PIC 9(2).
           05  SORT-TAG    PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           SORT SORT-FILE ASCENDING KEY SORT-KEY
               INPUT PROCEDURE FILL-SORT
               OUTPUT PROCEDURE SHOW-SORT.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "CC10SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       FILL-SORT.
           COMPUTE SORT-KEY = 9 - LS-DEPTH.
           MOVE "AAA" TO SORT-TAG.
           RELEASE SORT-REC.
           MOVE LS-DEPTH TO SORT-KEY.
           MOVE "BBB" TO SORT-TAG.
           RELEASE SORT-REC.
       SHOW-SORT.
           RETURN SORT-FILE AT END
               DISPLAY "SORT-EMPTY-1 DEPTH=" LS-DEPTH.
           DISPLAY "SORTED1 DEPTH=" LS-DEPTH " KEY=" SORT-KEY
               " TAG=" SORT-TAG.
           RETURN SORT-FILE AT END
               DISPLAY "SORT-EMPTY-2 DEPTH=" LS-DEPTH.
           DISPLAY "SORTED2 DEPTH=" LS-DEPTH " KEY=" SORT-KEY
               " TAG=" SORT-TAG.
       END PROGRAM CC10SUB.
       END PROGRAM CC10MAIN.
