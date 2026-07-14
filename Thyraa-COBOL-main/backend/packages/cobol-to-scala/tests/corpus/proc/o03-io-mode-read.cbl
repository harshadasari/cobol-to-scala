      * Adversarial (round 25): no corpus program (any round) has ever OPENed
      * a file in I-O mode at all - every prior file-I/O program uses only
      * INPUT/OUTPUT/EXTEND. This is the most basic possible I-O-mode probe:
      * write two records, close, reopen I-O, READ the first record and
      * DISPLAY it right away (before anything else touches the file) - just
      * confirming a plain READ after OPEN I-O returns real content, the way
      * it must for REWRITE/DELETE (o01/o02) to ever have a real record to
      * act on in the first place.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O03IOREAD.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "O03FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL.
           WRITE SOME-REC.
           MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           DISPLAY "IOREAD1 ST=" WS-STATUS " ID=" REC-ID
               " VAL=" REC-VAL.
           READ SOME-FILE.
           DISPLAY "IOREAD2 ST=" WS-STATUS " ID=" REC-ID
               " VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.
