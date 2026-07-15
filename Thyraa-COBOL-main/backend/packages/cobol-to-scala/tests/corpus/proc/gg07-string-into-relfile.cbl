      * gg07: fresh combination - a STRING result (built entirely at
      * runtime from two WORKING-STORAGE fields, not a literal) written
      * DIRECTLY into a RELATIVE-file record field, then read back after
      * a CLOSE/OPEN round trip. STRING and the round-25+ RELATIVE-file
      * fixed-width I/O model have never been exercised together in this
      * corpus - checks that the STRING target, once copied into the FD
      * record area, survives the file's own WRITE/READ codec path intact.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG07STRWR.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG07REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-TEXT    PIC X(12).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-PART1        PIC X(5) VALUE "HELLO".
       01  WS-PART2        PIC X(5) VALUE "WORLD".
       01  WS-PTR          PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE SPACES TO REC-TEXT.
           STRING WS-PART1 DELIMITED BY SIZE
                  "-" DELIMITED BY SIZE
                  WS-PART2 DELIMITED BY SIZE
               INTO REC-TEXT
           END-STRING.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS " TEXT=[" REC-TEXT "]".

           MOVE 2 TO REC-ID.
           MOVE SPACES TO REC-TEXT.
           MOVE 1 TO WS-PTR.
           STRING WS-PART2 DELIMITED BY SIZE
                  WS-PART1 DELIMITED BY SIZE
               INTO REC-TEXT
               WITH POINTER WS-PTR
           END-STRING.
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS " TEXT=[" REC-TEXT "]"
               " PTR=" WS-PTR.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID
               " TEXT=[" REC-TEXT "]".
           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " ID=" REC-ID
               " TEXT=[" REC-TEXT "]".
           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
