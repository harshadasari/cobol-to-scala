      * ff01: OCCURS DEPENDING ON (ODO) combined with a COMP-2 field
      * whose own IEEE-754 bytes genuinely contain an 0x0A byte, in the
      * SAME FD record - round-29 finding 5 (ee06) fixed the RELATIVE
      * file fixed-width byte-record model exactly for this embedded-
      * 0x0A-byte scenario, but its own guard (hasOccursDependingOn)
      * EXCLUDES any record containing an ODO child anywhere from the
      * new fixed-width registry, falling back to the OLD, still
      * line-delimited (Source.fromFile().getLines()) model for ANY
      * ODO-bearing RELATIVE file - including one that ALSO has an
      * embedded-0x0A-byte binary field elsewhere in the same record,
      * which is exactly the ORIGINAL ee06 bug shape. dd11/ee12 only
      * ever combined ODO with plain PIC X table elements (no binary
      * float field in the same record), so this exact combination -
      * ODO record layout + a real 0x0A data byte from a COMP-2 field -
      * has never been exercised.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF01ODONL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "FF01REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-COUNT   PIC 9(1).
           05  REC-VAL     COMP-2.
           05  REC-ITEM    PIC X(3) OCCURS 1 TO 3 TIMES
                               DEPENDING ON REC-COUNT.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 2 TO REC-COUNT.
           MOVE "AAA" TO REC-ITEM(1).
           MOVE "BBB" TO REC-ITEM(2).
           MOVE 3.25 TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 3 TO REC-COUNT.
           MOVE "CCC" TO REC-ITEM(1).
           MOVE "DDD" TO REC-ITEM(2).
           MOVE "EEE" TO REC-ITEM(3).
           MOVE 6.5 TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " COUNT=" REC-COUNT
               " VAL=" REC-VAL.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " COUNT=" REC-COUNT
               " VAL=" REC-VAL.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > REC-COUNT
               DISPLAY "  ITEM(" WS-I ")=" REC-ITEM(WS-I)
           END-PERFORM.

           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
