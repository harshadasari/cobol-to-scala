      * ff02: RELATIVE file whose FD record length is an ODD byte count
      * (7 bytes: PIC X(1) + PIC X(3) + PIC X(3)) - stresses round-29's
      * new fixed-width byte-chunking model (relativeRecordLengthRegistry/
      * fixedWidthLoadLines, generator/file-io-gen.js) with a record
      * width that is not a multiple of 2/4/8, in case any part of the
      * chunking/slicing math implicitly assumes an even or power-of-two
      * width. Three records are written, then the file is closed and
      * reopened fresh (a true disk round trip, not just I-O in the same
      * run) and read back sequentially.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF02ODDLEN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "FF02REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-TAG     PIC X(1).
           05  REC-A       PIC X(3).
           05  REC-B       PIC X(3).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE "1" TO REC-TAG.
           MOVE "AAA" TO REC-A.
           MOVE "111" TO REC-B.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE "2" TO REC-TAG.
           MOVE "BBB" TO REC-A.
           MOVE "222" TO REC-B.
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.

           MOVE "3" TO REC-TAG.
           MOVE "CCC" TO REC-A.
           MOVE "333" TO REC-B.
           WRITE REL-REC.
           DISPLAY "WRITE3 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ ST=" WS-STATUS " TAG=" REC-TAG
               " A=" REC-A " B=" REC-B.
           READ REL-FILE.
           DISPLAY "READ ST=" WS-STATUS " TAG=" REC-TAG
               " A=" REC-A " B=" REC-B.
           READ REL-FILE.
           DISPLAY "READ ST=" WS-STATUS " TAG=" REC-TAG
               " A=" REC-A " B=" REC-B.
           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
