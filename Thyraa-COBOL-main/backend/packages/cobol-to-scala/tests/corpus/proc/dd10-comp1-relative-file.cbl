      * dd10: COMP-1 (Float) and COMP-2 (Double) fields, as GROUP
      * children of an FD record, written to and read back from a
      * RELATIVE file via WRITE/REWRITE/READ - a genuinely new
      * combination: round-8's u02/u02b only ever verified COMP-1/
      * COMP-2 DISPLAY/arithmetic in WORKING-STORAGE, never a real byte-
      * level file-record round trip (writeRecordPlan's byte-mode path,
      * round-10) through an actual RELATIVE file.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD10FLOATFILE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "DD10REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID     PIC 9(3).
           05  REC-F1     COMP-1.
           05  REC-F2     COMP-2.
       WORKING-STORAGE SECTION.
       01  WS-RKEY        PIC 9(3) VALUE 0.
       01  WS-STATUS      PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 3.5 TO REC-F1.
           MOVE 2.25 TO REC-F2.
           WRITE REL-REC.
           MOVE 2 TO REC-ID.
           MOVE -7.125 TO REC-F1.
           MOVE 100.5 TO REC-F2.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           READ REL-FILE.
           DISPLAY "REC1 ID=" REC-ID " F1=" REC-F1 " F2=" REC-F2.
           COMPUTE REC-F1 = REC-F1 + 1.0.
           REWRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "REREAD1 ID=" REC-ID " F1=" REC-F1 " F2=" REC-F2.
           READ REL-FILE.
           DISPLAY "REREAD2 ID=" REC-ID " F1=" REC-F1 " F2=" REC-F2.
           CLOSE REL-FILE.
           STOP RUN.
