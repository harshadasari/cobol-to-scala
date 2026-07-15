      * gg03: round-30 finding 3 fixed the WRITE/READ encoding asymmetry
      * for a plain signed DISPLAY (zoned-decimal) field in a RELATIVE
      * file record, verified only against the DEFAULT trailing-overpunch
      * sign convention (ff14, no SIGN clause at all). This probes the
      * SIGN IS LEADING clause (overpunch on the FIRST digit instead of
      * the last) combined with the SAME RELATIVE-file WRITE/READ path,
      * for positive, negative, and zero values.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG03SIGNL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG03REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID      PIC 9(2).
           05  REC-VAL     PIC S9(3)V99 SIGN IS LEADING.
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 12.34 TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "WRITE1 ST=" WS-STATUS.

           MOVE 2 TO REC-ID.
           MOVE -56.78 TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "WRITE2 ST=" WS-STATUS.

           MOVE 3 TO REC-ID.
           MOVE 0 TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "WRITE3 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "READ1 ST=" WS-STATUS " ID=" REC-ID " VAL=" REC-VAL.
           READ REL-FILE.
           DISPLAY "READ2 ST=" WS-STATUS " ID=" REC-ID " VAL=" REC-VAL.
           READ REL-FILE.
           DISPLAY "READ3 ST=" WS-STATUS " ID=" REC-ID " VAL=" REC-VAL.
           READ REL-FILE
               AT END DISPLAY "AT-END ST=" WS-STATUS
           END-READ.
           CLOSE REL-FILE.
           STOP RUN.
