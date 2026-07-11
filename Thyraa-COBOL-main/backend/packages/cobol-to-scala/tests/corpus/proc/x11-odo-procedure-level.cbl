      * Round-10 probe x11: OCCURS DEPENDING ON at PROCEDURE level.
      * Attacks: PERFORM VARYING driven by the *live* ODO counter, where
      * the loop body itself grows the counter mid-loop (so later
      * iterations see a larger bound than the loop started with), plus
      * a separate probe: shrinking the counter and then reading an
      * index beyond the new (smaller) count, which cobc allows (no
      * runtime bounds check without -fec=ec-bound-subscript) and simply
      * returns whatever byte pattern is still sitting in that slot.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. X11ODO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-COUNT PIC 9(2) VALUE 3.
       01 WS-TABLE.
           05 WS-ITEM OCCURS 1 TO 5 TIMES
               DEPENDING ON WS-COUNT
               PIC 9(3).
       01 WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 111 TO WS-ITEM(1).
           MOVE 222 TO WS-ITEM(2).
           MOVE 333 TO WS-ITEM(3).
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-COUNT
               DISPLAY "ITEM(" WS-I ")=" WS-ITEM(WS-I)
               IF WS-I = 2
                   MOVE 5 TO WS-COUNT
                   MOVE 444 TO WS-ITEM(4)
                   MOVE 555 TO WS-ITEM(5)
               END-IF
           END-PERFORM.
           DISPLAY "FINAL COUNT=" WS-COUNT.
           MOVE 2 TO WS-COUNT.
           DISPLAY "ITEM(4) AFTER SHRINK=" WS-ITEM(4).
           STOP RUN.
