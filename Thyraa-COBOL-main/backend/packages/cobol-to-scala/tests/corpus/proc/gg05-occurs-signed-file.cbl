      * gg05: round-30 finding 3's fixed-width zoned-overpunch codec path
      * for a plain signed DISPLAY RELATIVE-file field was only verified
      * for a SINGLE (non-subscripted) field per record (ff09/ff14). This
      * probes a FIXED (non-ODO) OCCURS table of signed DISPLAY elements,
      * addressed by subscript, written to and read back from a RELATIVE
      * file - a combination no corpus program exercises yet (searched:
      * no existing program combines OCCURS + a signed PICTURE + RELATIVE
      * organization).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG05OCCSGN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG05REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ITEM    PIC S9(3)V99 OCCURS 3 TIMES.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.34 TO REC-ITEM(1).
           MOVE -56.78 TO REC-ITEM(2).
           MOVE -1.00 TO REC-ITEM(3).
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO REC-ID.
           MOVE -0.01 TO REC-ITEM(1).
           MOVE 99.99 TO REC-ITEM(2).
           MOVE -99.99 TO REC-ITEM(3).
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " ID=" REC-ID.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
