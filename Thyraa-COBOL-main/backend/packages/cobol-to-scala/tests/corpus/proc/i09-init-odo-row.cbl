       IDENTIFICATION DIVISION.
       PROGRAM-ID. I09INITODOROW.
      *
      * Adversarial (round 20): INITIALIZE of a SINGLE SUBSCRIPTED ROW
      * (WS-ROW(1)) within an OCCURS ... DEPENDING ON table - not the
      * whole table, and not a non-ODO group (e11 exercises INITIALIZE
      * of a whole non-ODO group). Confirmed against installed
      * GnuCOBOL: INITIALIZE resets only the ONE named row to its
      * elementary-PICTURE defaults (spaces/zero, ignoring each child's
      * own VALUE clause), leaves every other row completely
      * untouched, and does so independent of the ODO counter's own
      * current/live value.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-COUNT PIC 9(2) VALUE 2.
           05  WS-ROW OCCURS 1 TO 5 TIMES
                   DEPENDING ON WS-COUNT.
               10  R-CODE PIC X(2) VALUE "ZZ".
               10  R-NUM  PIC 9(3) VALUE 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AA" TO R-CODE(1). MOVE 111 TO R-NUM(1).
           MOVE "BB" TO R-CODE(2). MOVE 222 TO R-NUM(2).
           MOVE "CC" TO R-CODE(3). MOVE 333 TO R-NUM(3).
           MOVE "DD" TO R-CODE(4). MOVE 444 TO R-NUM(4).
           MOVE "EE" TO R-CODE(5). MOVE 555 TO R-NUM(5).
           INITIALIZE WS-ROW(1).
           MOVE 5 TO WS-COUNT.
           DISPLAY "R1=" R-CODE(1) " " R-NUM(1).
           DISPLAY "R2=" R-CODE(2) " " R-NUM(2).
           DISPLAY "R3=" R-CODE(3) " " R-NUM(3).
           DISPLAY "R4=" R-CODE(4) " " R-NUM(4).
           DISPLAY "R5=" R-CODE(5) " " R-NUM(5).
           STOP RUN.
