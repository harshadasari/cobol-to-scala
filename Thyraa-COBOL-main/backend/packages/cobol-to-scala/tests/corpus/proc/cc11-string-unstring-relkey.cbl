      * cc11: STRING/UNSTRING combined with round-26's RELATIVE KEY
      * random-access file machinery - a field built by STRING is
      * used as the RELATIVE KEY for a keyed WRITE, and a field READ
      * back (keyed) is then split apart by UNSTRING. Neither STRING/
      * UNSTRING nor keyed RELATIVE-file access has been tested in
      * combination before (STRING/UNSTRING corpus programs never
      * touch file I/O; the RELATIVE-KEY corpus programs (bb09-bb14,
      * cc01-cc05) never touch STRING/UNSTRING).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC11STUN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "RELFILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID    PIC 9(3).
           05  REC-VAL   PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-RKEY       PIC 9(4).
       01  WS-STATUS     PIC X(2).
       01  WS-PART1      PIC X(3) VALUE "042".
       01  WS-PART2      PIC X(3) VALUE "TWO".
       01  WS-KEYSTR     PIC X(4).
       01  WS-OUT-A      PIC X(3).
       01  WS-OUT-B      PIC X(3).
       PROCEDURE DIVISION.
       MAIN-LOGIC.
      * Build the RELATIVE KEY value itself via STRING - key 42.
           STRING WS-PART1 DELIMITED BY SIZE
               INTO WS-KEYSTR.
           MOVE WS-KEYSTR TO WS-RKEY.

           OPEN OUTPUT REL-FILE.
           MOVE 42 TO REC-ID.
           STRING WS-PART1 DELIMITED BY SIZE
               WS-PART2 DELIMITED BY SIZE
               INTO REC-VAL.
           WRITE REL-REC
               INVALID KEY DISPLAY "WRITE INVALID"
               NOT INVALID KEY DISPLAY "WRITE OK ST=" WS-STATUS
           END-WRITE.
           CLOSE REL-FILE.

      * Random READ back by the SAME STRING-built key.
           OPEN I-O REL-FILE.
           MOVE WS-KEYSTR TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ ID=" REC-ID " VAL=" REC-VAL
           END-READ.

      * UNSTRING the READ-back value apart again.
           UNSTRING REC-VAL DELIMITED BY "TWO"
               INTO WS-OUT-A WS-OUT-B.
           DISPLAY "UNSTRING A=[" WS-OUT-A "] B=[" WS-OUT-B "]".

           CLOSE REL-FILE.
           STOP RUN.
