      * Round-12 probe z04: INITIALIZE of an UNSUBSCRIPTED record/group that
      * CONTAINS an OCCURS ... DEPENDING ON table - does the reset cover only
      * the CURRENT (live) occurrence count, or the table's full physical/max
      * storage (elements beyond the current count too)? Also checks whether
      * the DEPENDING-ON counter field itself (a sibling, not part of the
      * table) gets reset to its own NUMERIC default (zero) by the same
      * INITIALIZE of the enclosing group.
      *
      * (Note: a record with fields declared AFTER an ODO table is rejected
      * by cobc outright - "'WS-ELEM' cannot have OCCURS DEPENDING because of
      * 'WS-TRAILER'" - confirmed with a standalone probe before writing this
      * file, so that specific mission variant is not COBOL-legal under this
      * compiler and is not attempted here.)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z04INITODO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-REC.
           05  WS-COUNT     PIC 9 VALUE 3.
           05  WS-ELEM      PIC 9(2) OCCURS 1 TO 5 TIMES
                            DEPENDING ON WS-COUNT.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 5 TO WS-COUNT.
           MOVE 11 TO WS-ELEM(1).
           MOVE 22 TO WS-ELEM(2).
           MOVE 33 TO WS-ELEM(3).
           MOVE 44 TO WS-ELEM(4).
           MOVE 55 TO WS-ELEM(5).
           MOVE 3 TO WS-COUNT.

           INITIALIZE WS-REC.

           DISPLAY "COUNT-AFTER-INIT=" WS-COUNT.
           MOVE 5 TO WS-COUNT.
           DISPLAY "ELEM(1)=" WS-ELEM(1).
           DISPLAY "ELEM(2)=" WS-ELEM(2).
           DISPLAY "ELEM(3)=" WS-ELEM(3).
           DISPLAY "ELEM(4)-BEYOND-LIVE-COUNT-AT-INIT=" WS-ELEM(4).
           DISPLAY "ELEM(5)-BEYOND-LIVE-COUNT-AT-INIT=" WS-ELEM(5).
           STOP RUN.
