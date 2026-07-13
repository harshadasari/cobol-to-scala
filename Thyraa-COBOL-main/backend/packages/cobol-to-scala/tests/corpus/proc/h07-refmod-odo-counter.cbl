       IDENTIFICATION DIVISION.
       PROGRAM-ID. H07RMODOC.
      *
      * Adversarial (round 19): reference modification applied to the
      * COUNTER field of an OCCURS ... DEPENDING ON table (not the
      * table itself) - MOVE "3" TO WS-CNT(2:1), where WS-CNT is
      * PIC 9(2) and is the table's own ODO-driving counter. This
      * combination has never appeared together in any prior d/e/f/g
      * probe (round-16 e13/round-17 f10/f11 exercise ODO tables, but
      * never with a ref-mod'd write into the counter field itself).
      * Checks whether the ODO subscript-bound machinery reads the
      * counter value CORRECTLY after a ref-mod write reaches it
      * (honestly or not).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-CNT          PIC 9(2) VALUE 0.
           05  WS-ROW OCCURS 1 TO 5 TIMES DEPENDING ON WS-CNT.
               10  WS-VAL      PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE "AAA" TO WS-VAL(1).
           MOVE "BBB" TO WS-VAL(2).
           MOVE "CCC" TO WS-VAL(3).
           MOVE "03" TO WS-CNT(1:2).
           DISPLAY "CNT=" WS-CNT.
           DISPLAY "ROW1=" WS-VAL(1).
           DISPLAY "ROW2=" WS-VAL(2).
           DISPLAY "ROW3=" WS-VAL(3).
           STOP RUN.
       END PROGRAM H07RMODOC.
