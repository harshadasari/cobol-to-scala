      * Adversarial (round 24): every prior ODO-counter-write corpus program
      * writes the counter via a plain MOVE (x11) or UNSTRING ... COUNT IN
      * (f11) - never via COMPUTE or an arithmetic ... GIVING statement. This
      * checks the OCCURS DEPENDING ON counter written through COMPUTE and
      * through SUBTRACT ... GIVING (both routing through the generic
      * arithmetic-target codegen, not a MOVE-specific path), then
      * immediately re-references the table at the new live count to
      * confirm the table's own bound genuinely tracks the freshly computed
      * value rather than some stale/cached copy of the counter.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M09ODOGIVING.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-BASE PIC 9(2) VALUE 5.
       01 WS-TABLE.
           05 WS-COUNT PIC 9(2).
           05 WS-ROW OCCURS 1 TO 5 TIMES
               DEPENDING ON WS-COUNT
               PIC X(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAAA" TO WS-ROW(1).
           MOVE "BBBB" TO WS-ROW(2).
           MOVE "CCCC" TO WS-ROW(3).
           MOVE "DDDD" TO WS-ROW(4).
           COMPUTE WS-COUNT = WS-BASE - 2.
           DISPLAY "COUNT=" WS-COUNT.
           DISPLAY "ROW3=" WS-ROW(3).
           SUBTRACT 1 FROM WS-BASE GIVING WS-COUNT.
           DISPLAY "COUNT=" WS-COUNT.
           DISPLAY "ROW4=" WS-ROW(4).
           STOP RUN.
