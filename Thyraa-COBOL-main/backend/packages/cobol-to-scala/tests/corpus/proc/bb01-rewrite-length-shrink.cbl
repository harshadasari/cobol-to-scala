      * Adversarial (round 26): round-25's OPEN I-O/REWRITE buffer model
      * (file-io-gen.js) stores each record as a plain text LINE, and
      * REWRITE's own rendered text is passed through .stripTrailing()
      * before overwriting that line (expression-gen.js's
      * generateRewriteStatement). If a REWRITE shrinks the record's own
      * rendered width (its last field becomes entirely blank, so
      * stripTrailing() removes those trailing space bytes rather than
      * writing them out), the in-memory buffer line for that record
      * becomes SHORTER than every other record's own line and shorter
      * than the FD's declared fixed record length. This checks whether
      * a later re-READ of that same (now-short) line still parses back
      * correctly (case-class-gen.js's parse() slices bytes by fixed
      * offset/length - a short line could starve a later field of bytes)
      * and whether a NEIGHBORING record (never rewritten) is left alone.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB01SHRINK.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB01FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID   PIC 9(3).
           05 REC-MID  PIC X(5).
           05 REC-TAIL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID.
           MOVE "MMMMM" TO REC-MID.
           MOVE "TTTTT" TO REC-TAIL.
           WRITE SOME-REC.
           MOVE 2 TO REC-ID.
           MOVE "NNNNN" TO REC-MID.
           MOVE "UUUUU" TO REC-TAIL.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           READ SOME-FILE.
           MOVE SPACES TO REC-TAIL.
           REWRITE SOME-REC.
           DISPLAY "AFTER-REWRITE STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "REC1 MID=[" REC-MID "] TAIL=[" REC-TAIL "]".
           READ SOME-FILE.
           DISPLAY "REC2 MID=[" REC-MID "] TAIL=[" REC-TAIL "]".
           CLOSE SOME-FILE.
           STOP RUN.
