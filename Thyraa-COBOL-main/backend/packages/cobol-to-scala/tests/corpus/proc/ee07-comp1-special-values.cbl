      * ee07: special COMP-1 float magnitudes (zero, very large, very
      * small/negative-large) round-tripped through a RELATIVE file -
      * deliberately chosen NOT to contain an embedded 0x0A byte in their
      * IEEE-754 bit pattern (unlike ee06's 3.25, which does - see that
      * program's own finding) so this isolates whether the round-28
      * float codec itself handles extreme magnitudes correctly, separate
      * from the line-based-record-corruption bug ee06 found.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE07COMP1SPECIAL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "EE07REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID       PIC 9(3).
           05  REC-F        COMP-1.
       WORKING-STORAGE SECTION.
       01  WS-RKEY        PIC 9(3) VALUE 0.
       01  WS-STATUS      PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO REC-ID.
           MOVE 0.0 TO REC-F.
           WRITE REL-REC.
           MOVE 2 TO REC-ID.
           MOVE 1.0E30 TO REC-F.
           WRITE REL-REC.
           MOVE 3 TO REC-ID.
           MOVE -1.0E30 TO REC-F.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           READ REL-FILE.
           DISPLAY "REC1 ID=" REC-ID " F=" REC-F.
           READ REL-FILE.
           DISPLAY "REC2 ID=" REC-ID " F=" REC-F.
           READ REL-FILE.
           DISPLAY "REC3 ID=" REC-ID " F=" REC-F.
           CLOSE REL-FILE.
           STOP RUN.
