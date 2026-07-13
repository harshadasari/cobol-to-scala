      * Adversarial (round 22): INITIALIZE of a group whose OCCURS
      * DEPENDING ON table is CURRENTLY ZERO-length (WS-COUNT=0) at the
      * moment INITIALIZE runs - z04 (round-12) already checked
      * INITIALIZE's live-vs-max-storage reset scope for a NONZERO live
      * count; this checks whether a zero-length live count crashes (or
      * miscounts) the per-element reset loop, and that the sibling
      * fields (WS-COUNT itself, WS-HEADER) are still reset correctly
      * regardless. Afterwards the table is repopulated with a nonzero
      * count to confirm INITIALIZE-while-empty didn't leave the
      * underlying table storage unusable.
      * (Per z04's own note: a field declared AFTER an ODO table is
      * rejected by cobc outright, so - like z04 - nothing follows
      * WS-ITEMS in this record.)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K13INITZEROODO.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-REC.
           05 WS-COUNT  PIC 9 VALUE 0.
           05 WS-HEADER PIC X(5) VALUE "HEAD".
           05 WS-ITEMS OCCURS 0 TO 5 TIMES DEPENDING ON WS-COUNT.
               10 WS-ITEM-VAL PIC 9(3) VALUE 9.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE H=" WS-HEADER " N=" WS-COUNT.
           INITIALIZE WS-REC.
           DISPLAY "AFTER H=" WS-HEADER " N=" WS-COUNT.
           MOVE 3 TO WS-COUNT.
           MOVE 11 TO WS-ITEM-VAL(1).
           MOVE 22 TO WS-ITEM-VAL(2).
           MOVE 33 TO WS-ITEM-VAL(3).
           DISPLAY "POST ITEM1=" WS-ITEM-VAL(1)
               " ITEM2=" WS-ITEM-VAL(2)
               " ITEM3=" WS-ITEM-VAL(3).
           STOP RUN.
