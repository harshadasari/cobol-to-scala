      * cc03: START with NO matching record at all (KEY IS GREATER
      * THAN a value larger than every record in the file), then a
      * subsequent sequential READ NEXT - does FILE STATUS/behavior
      * match cobc's "positioned past end of file" semantics? Unlike
      * bb09 (an entirely EMPTY file), this file has real records but
      * the START key is chosen to exceed all of them.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC03STNM.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "RELFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID    PIC 9(3).
           05  REC-VAL   PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY       PIC 9(4).
       01  WS-STATUS     PIC X(2).
       PROCEDURE DIVISION.
       MAIN-LOGIC.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL.
           WRITE REL-REC.
           MOVE 2 TO WS-RKEY.
           MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL.
           WRITE REL-REC.
           MOVE 3 TO WS-RKEY.
           MOVE 3 TO REC-ID.
           MOVE "CCCCC" TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
      * Key 99 is greater than every record's key (max is 3) - START
      * must fail with no candidate.
           MOVE 99 TO WS-RKEY.
           START REL-FILE KEY IS GREATER THAN WS-RKEY
               INVALID KEY
                   DISPLAY "START INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "START OK ST=" WS-STATUS
           END-START.

      * File is positioned "past end" after a failed START - a
      * subsequent sequential READ NEXT should behave like AT END
      * (cobc-specific: does it report AT END, or leave the record
      * area/FILE STATUS untouched, or something else?).
           MOVE SPACES TO REC-VAL.
           MOVE 0 TO REC-ID.
           READ REL-FILE NEXT RECORD
               AT END
                   DISPLAY "READNEXT1 AT END ST=" WS-STATUS
               NOT AT END
                   DISPLAY "READNEXT1 ID=" REC-ID " VAL=" REC-VAL
                       " ST=" WS-STATUS
           END-READ.

           READ REL-FILE NEXT RECORD
               AT END
                   DISPLAY "READNEXT2 AT END ST=" WS-STATUS
               NOT AT END
                   DISPLAY "READNEXT2 ID=" REC-ID " VAL=" REC-VAL
                       " ST=" WS-STATUS
           END-READ.

           CLOSE REL-FILE.
           STOP RUN.
