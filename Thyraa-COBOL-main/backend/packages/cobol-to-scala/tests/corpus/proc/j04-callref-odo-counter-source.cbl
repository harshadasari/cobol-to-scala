      * Adversarial (round 21): a CALL ... USING BY REFERENCE writeback
      * into a table element (WS-SLOT(3)) whose value is then copied
      * into a DIFFERENT table's OCCURS ... DEPENDING ON driver
      * (WS-CNT), growing that second table's live element count.
      * cobc requires an ODO's own DEPENDING ON operand to be an
      * unsubscripted data-name (verified: "OCCURS ... DEPENDING ON
      * WS-CNT(2)" is rejected outright, "PICTURE clause required" /
      * syntax error) - so the ODO driver itself can never directly BE
      * a table element, but a table element can still legitimately
      * SOURCE the value that then flows into the driver, and that
      * value is what a subprogram writes back into via BY REFERENCE.
      * Checks CALL BY REFERENCE writeback into an ordinary table
      * element (already covered standalone since round-19 h12) still
      * composes correctly when that element's value goes on to resize
      * a completely different OCCURS DEPENDING ON table.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J04ODOREF.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SLOT PIC 9(2) OCCURS 3 TIMES VALUE 0.
       01 WS-CNT PIC 9(2) VALUE 2.
       01 WS-TABLE.
           05 WS-ITEM OCCURS 1 TO 5 TIMES
               DEPENDING ON WS-CNT
               PIC X(3).
       01 WS-I PIC 9(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-ITEM(1).
           MOVE "BBB" TO WS-ITEM(2).
           MOVE 2 TO WS-SLOT(3).
           DISPLAY "SLOT3-BEFORE=" WS-SLOT(3).
           CALL "J04ODOSUB" USING WS-SLOT(3).
           DISPLAY "SLOT3-AFTER=" WS-SLOT(3).
           MOVE WS-SLOT(3) TO WS-CNT.
           MOVE "CCC" TO WS-ITEM(3).
           MOVE "DDD" TO WS-ITEM(4).
           DISPLAY "CNT=" WS-CNT.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-CNT
               DISPLAY "ITEM(" WS-I ")=" WS-ITEM(WS-I)
           END-PERFORM.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. J04ODOSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-VAL PIC 9(2).
       PROCEDURE DIVISION USING LS-VAL.
       MAIN-PARA.
           DISPLAY "SUB-SEES=" LS-VAL.
           MOVE 4 TO LS-VAL.
           GOBACK.
       END PROGRAM J04ODOSUB.
       END PROGRAM J04ODOREF.
