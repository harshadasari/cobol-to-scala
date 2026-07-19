      * mm10 (round 37): fresh-territory probe - CALL identifier (dynamic
      * call by DATA-NAME, not a literal program-name) where the
      * identifier's own VALUE changes between two CALL statements in the
      * SAME paragraph - the first CALL WS-PROG-NAME resolves to MM10A
      * while WS-PROG-NAME holds "MM10A", then WS-PROG-NAME is
      * overwritten to "MM10B" and the SAME CALL WS-PROG-NAME statement
      * (executed a second, textually distinct time) must now resolve to
      * MM10B - confirms the generated dispatch reads WS-PROG-NAME's
      * CURRENT value at each call rather than caching/resolving it once.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM10MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-PROG-NAME PIC X(8).
       01  WS-ARG       PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "MM10A" TO WS-PROG-NAME.
           MOVE 1 TO WS-ARG.
           CALL WS-PROG-NAME USING WS-ARG.
           DISPLAY "AFTER FIRST CALL ARG=" WS-ARG.

           MOVE "MM10B" TO WS-PROG-NAME.
           MOVE 1 TO WS-ARG.
           CALL WS-PROG-NAME USING WS-ARG.
           DISPLAY "AFTER SECOND CALL ARG=" WS-ARG.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM10A.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-ARG PIC 9(3).
       PROCEDURE DIVISION USING LK-ARG.
       A-MAIN.
           DISPLAY "IN MM10A".
           ADD 100 TO LK-ARG.
       END PROGRAM MM10A.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM10B.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-ARG PIC 9(3).
       PROCEDURE DIVISION USING LK-ARG.
       B-MAIN.
           DISPLAY "IN MM10B".
           ADD 900 TO LK-ARG.
       END PROGRAM MM10B.

       END PROGRAM MM10MAIN.
