      * ii13: round-32's table-of-groups byte-layout fix (hh03/hh04/hh12)
      * was only verified against WRITE and sequential READ. This probes
      * the combination with DELETE (round-27's own occVar-gap
      * machinery) and a subsequent WRITE back into the freed slot: a
      * RELATIVE file of table-of-groups records (signed ROW-QTY + plain
      * ROW-TAG per row, RANDOM access) writes three keyed records,
      * DELETEs the middle one (leaving a genuine occVar gap in a
      * byte-mode record), then WRITEs a brand NEW table-of-groups
      * record into that same freed key - probing whether the
      * DELETE-then-refill cycle preserves the byte-mode codec's own
      * correct offsets/gap-fill bytes for this record shape.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II13TBLDEL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "II13REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-ROW     OCCURS 2 TIMES.
               10  ROW-QTY     PIC S9(3).
               10  ROW-TAG     PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-I            PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE 1 TO REC-ID.
           MOVE -12 TO ROW-QTY(1). MOVE "AAA" TO ROW-TAG(1).
           MOVE 34 TO ROW-QTY(2). MOVE "BBB" TO ROW-TAG(2).
           WRITE REL-REC INVALID KEY DISPLAY "W1 FAIL".

           MOVE 2 TO WS-RKEY.
           MOVE 2 TO REC-ID.
           MOVE -1 TO ROW-QTY(1). MOVE "CCC" TO ROW-TAG(1).
           MOVE 99 TO ROW-QTY(2). MOVE "DDD" TO ROW-TAG(2).
           WRITE REL-REC INVALID KEY DISPLAY "W2 FAIL".

           MOVE 3 TO WS-RKEY.
           MOVE 3 TO REC-ID.
           MOVE -50 TO ROW-QTY(1). MOVE "EEE" TO ROW-TAG(1).
           MOVE 7 TO ROW-QTY(2). MOVE "FFF" TO ROW-TAG(2).
           WRITE REL-REC INVALID KEY DISPLAY "W3 FAIL".
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 2 TO WS-RKEY.
           DELETE REL-FILE INVALID KEY DISPLAY "DEL2 FAIL".
           DISPLAY "DELETE2 ST=" WS-STATUS.

           MOVE 2 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ2-AFTER-DEL INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ2-AFTER-DEL FOUND (WRONG)"
           END-READ.

           MOVE 2 TO WS-RKEY.
           MOVE 9 TO REC-ID.
           MOVE -77 TO ROW-QTY(1). MOVE "XXX" TO ROW-TAG(1).
           MOVE 88 TO ROW-QTY(2). MOVE "YYY" TO ROW-TAG(2).
           WRITE REL-REC INVALID KEY DISPLAY "W2NEW FAIL".
           DISPLAY "WRITE2-NEW ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
               MOVE WS-I TO WS-RKEY
               READ REL-FILE
                   INVALID KEY
                       DISPLAY "READ" WS-I " INVALID ST=" WS-STATUS
                   NOT INVALID KEY
                       DISPLAY "READ" WS-I " ST=" WS-STATUS
                           " ID=" REC-ID
                       DISPLAY "  QTY(1)=" ROW-QTY(1)
                           " TAG(1)=" ROW-TAG(1)
                       DISPLAY "  QTY(2)=" ROW-QTY(2)
                           " TAG(2)=" ROW-TAG(2)
               END-READ
           END-PERFORM.
           CLOSE REL-FILE.
           STOP RUN.
