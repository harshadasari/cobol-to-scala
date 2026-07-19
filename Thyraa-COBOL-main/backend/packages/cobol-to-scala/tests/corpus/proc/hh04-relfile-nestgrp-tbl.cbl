      * hh04: the other half of the round-30/31 (gg05) extension this
      * round targets - not a table of GROUPS (hh03), but a NON-repeating
      * nested GROUP that itself CONTAINS an OCCURS table of signed
      * DISPLAY elements (the table is one level deeper than the 01
      * record, unlike gg05's own direct 05-level table).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH04NESTTBL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "HH04REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-DETAIL.
               10  DET-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.34 TO DET-ITEM(1).
           MOVE -56.78 TO DET-ITEM(2).
           MOVE -1.00 TO DET-ITEM(3).
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO REC-ID.
           MOVE -0.01 TO DET-ITEM(1).
           MOVE 99.99 TO DET-ITEM(2).
           MOVE -99.99 TO DET-ITEM(3).
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "  ITEM(" WS-I ")=" DET-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "  ITEM(" WS-I ")=" DET-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
