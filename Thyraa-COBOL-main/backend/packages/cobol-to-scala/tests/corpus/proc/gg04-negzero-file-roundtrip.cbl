      * gg04: round-30 finding 3 fixed WRITE/READ symmetry for a plain
      * signed DISPLAY (zoned-decimal) RELATIVE-file field, verified only
      * for ordinary positive/negative non-zero values (ff09/ff14). This
      * probes a value that is (or truncates to) NEGATIVE ZERO - distinct
      * from round-30's ff12, which only tested COMPUTE (real cobc decimal
      * arithmetic normalizes an arithmetic negative-zero RESULT to plain
      * unsigned 0, per ff12) - here the negative-zero-magnitude value
      * comes from a plain MOVE truncating away a small negative fraction
      * into a narrower PICTURE, immediately BEFORE the field is written to
      * a RELATIVE file and read back, checking whether the WRITE/READ
      * round trip (the zoned-overpunch codec path) preserves whatever
      * sign real cobc's own MOVE-truncation happens to leave behind.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG04NEGZ.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG04REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-VAL     PIC S9(3)V99.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-SOURCE       PIC S9(3)V999 VALUE -0.0005.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "SOURCE-IN-MEMORY=" WS-SOURCE.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE WS-SOURCE TO REC-VAL.
           DISPLAY "MOVED-IN-MEMORY=" REC-VAL.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO REC-ID.
           MOVE 0 TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID " VAL=" REC-VAL.
           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " ID=" REC-ID " VAL=" REC-VAL.
           CLOSE REL-FILE.
           STOP RUN.
