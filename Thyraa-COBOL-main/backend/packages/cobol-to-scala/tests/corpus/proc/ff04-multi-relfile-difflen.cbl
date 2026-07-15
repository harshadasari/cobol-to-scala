      * ff04: Two DIFFERENT RELATIVE files, with DIFFERENT FD record
      * lengths, open SIMULTANEOUSLY and interleaved - round-29's
      * relativeRecordLengthRegistry is keyed per FD file name, but this
      * probes whether the per-file record-length lookup is actually
      * correctly threaded through every call site when TWO such
      * registrations are live at once (every pre-existing corpus
      * program touching this new model uses exactly one RELATIVE file
      * at a time).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF04TWOFIL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-SMALL ASSIGN TO "FF04SM.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY1
               FILE STATUS IS WS-STATUS1.
           SELECT REL-BIG ASSIGN TO "FF04BG.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY2
               FILE STATUS IS WS-STATUS2.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-SMALL.
       01  SMALL-REC.
           05  SM-ID       PIC 9(2).
           05  SM-VAL      PIC X(3).
       FD  REL-BIG.
       01  BIG-REC.
           05  BG-ID       PIC 9(2).
           05  BG-NAME     PIC X(20).
           05  BG-AMT      COMP-3 PIC S9(7)V99.
       WORKING-STORAGE SECTION.
       01  WS-RKEY1        PIC 9(3) VALUE 0.
       01  WS-STATUS1      PIC XX.
       01  WS-RKEY2        PIC 9(3) VALUE 0.
       01  WS-STATUS2      PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-SMALL.
           OPEN OUTPUT REL-BIG.

           MOVE 1 TO SM-ID.
           MOVE "abc" TO SM-VAL.
           WRITE SMALL-REC.
           DISPLAY "SMALL-WRITE1 ST=" WS-STATUS1.

           MOVE 1 TO BG-ID.
           MOVE "FIRST BIG RECORD" TO BG-NAME.
           MOVE 12345.67 TO BG-AMT.
           WRITE BIG-REC.
           DISPLAY "BIG-WRITE1 ST=" WS-STATUS2.

           MOVE 2 TO SM-ID.
           MOVE "xyz" TO SM-VAL.
           WRITE SMALL-REC.
           DISPLAY "SMALL-WRITE2 ST=" WS-STATUS1.

           MOVE 2 TO BG-ID.
           MOVE "SECOND BIG RECORD" TO BG-NAME.
           MOVE -999.50 TO BG-AMT.
           WRITE BIG-REC.
           DISPLAY "BIG-WRITE2 ST=" WS-STATUS2.

           CLOSE REL-SMALL.
           CLOSE REL-BIG.

           OPEN INPUT REL-SMALL.
           OPEN INPUT REL-BIG.

           READ REL-SMALL.
           DISPLAY "SMALL READ ID=" SM-ID " VAL=" SM-VAL.
           READ REL-BIG.
           DISPLAY "BIG READ ID=" BG-ID " NAME=" BG-NAME
               " AMT=" BG-AMT.
           READ REL-SMALL.
           DISPLAY "SMALL READ ID=" SM-ID " VAL=" SM-VAL.
           READ REL-BIG.
           DISPLAY "BIG READ ID=" BG-ID " NAME=" BG-NAME
               " AMT=" BG-AMT.

           CLOSE REL-SMALL.
           CLOSE REL-BIG.
           STOP RUN.
