      * oo06 (round 39): further FILE STATUS lifecycle pressure-test -
      * OPEN INPUT then attempt a WRITE (wrong open mode, file IS open
      * but not for output). Real cobc: status 48 (not open for
      * OUTPUT/EXTEND/I-O). Also tries a REWRITE in the same wrong-mode
      * (INPUT) state (status 49 - not open for I-O; DELETE is dropped -
      * real cobc rejects DELETE on a LINE SEQUENTIAL file at COMPILE
      * time regardless of open mode, confirmed empirically, so it can't
      * be combined with this probe's other checks), and a READ
      * afterward to confirm the file is still perfectly usable for its
      * own opened mode.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO06WRONGMODE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "OO06FILE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-STATUS PIC XX VALUE "00".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           WRITE SOME-REC FROM "REC-ONE".
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           DISPLAY "OPEN-INPUT STATUS=" WS-STATUS.

           WRITE SOME-REC FROM "REC-TWO".
           DISPLAY "WRITE-WHILE-INPUT STATUS=" WS-STATUS.

           REWRITE SOME-REC FROM "REC-THR".
           DISPLAY "REWRITE-WHILE-INPUT STATUS=" WS-STATUS.

           READ SOME-FILE.
           DISPLAY "READ-STILL-WORKS STATUS=" WS-STATUS
               " REC=[" SOME-REC "]".

           CLOSE SOME-FILE.
           STOP RUN.
