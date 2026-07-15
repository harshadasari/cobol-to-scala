      * gg01: round-30 finding 2 fixed occVar-persistence so a file's TRUE
      * first open in a run rebuilds occupied-tracking from disk content,
      * while a LATER reopen of the SAME logical file reuses the in-memory
      * occVar array verbatim (trusted as ground truth, since nothing else
      * could have touched the file's bytes - or so the fix's own reasoning
      * assumes). This probes whether that assumption actually holds: TWO
      * distinct SELECT/FD entries (FILE-A, FILE-B) are ASSIGN TO the SAME
      * physical filename. FILE-A writes and closes (1 record). FILE-B then
      * OPENs OUTPUT (truncating the shared physical file for real) and
      * writes a LARGER file with a gap (key 1, skip key 2, key 3), then
      * closes. FILE-A is then reopened I-O and reads key 3 - a position
      * that exists on the real (FILE-B-rewritten) disk content, but is
      * beyond the length of FILE-A's own STALE in-memory occVar array
      * (still sized/valued from its earlier, shorter 1-record session).
      * If the engine trusts stale occVar without reconciling it against
      * the freshly-reloaded bufVar's own (correct) length, this can
      * either crash (index out of bounds) or misreport the read.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG01STALE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "GG01SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-A
               FILE STATUS IS WS-STATUS-A.
           SELECT FILE-B ASSIGN TO "GG01SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-B
               FILE STATUS IS WS-STATUS-B.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05  VAL-A       PIC 9(4).
       FD  FILE-B.
       01  REC-B.
           05  VAL-B       PIC 9(4).
       WORKING-STORAGE SECTION.
       01  WS-RKEY-A       PIC 9(3) VALUE 0.
       01  WS-RKEY-B       PIC 9(3) VALUE 0.
       01  WS-STATUS-A     PIC XX.
       01  WS-STATUS-B     PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT FILE-A.
           CLOSE FILE-A.

           OPEN I-O FILE-A.
           MOVE 1 TO WS-RKEY-A.
           MOVE 1111 TO VAL-A.
           WRITE REC-A.
           DISPLAY "A-WRITE1 ST=" WS-STATUS-A.
           CLOSE FILE-A.

           OPEN OUTPUT FILE-B.
           MOVE 1 TO WS-RKEY-B.
           MOVE 5000 TO VAL-B.
           WRITE REC-B.
           DISPLAY "B-WRITE-KEY1 ST=" WS-STATUS-B.
           MOVE 3 TO WS-RKEY-B.
           MOVE 7000 TO VAL-B.
           WRITE REC-B.
           DISPLAY "B-WRITE-KEY3 ST=" WS-STATUS-B.
           CLOSE FILE-B.

           OPEN I-O FILE-A.
           MOVE 1 TO WS-RKEY-A.
           READ FILE-A.
           DISPLAY "A-READ-KEY1 ST=" WS-STATUS-A " VAL=" VAL-A.

           MOVE 2 TO WS-RKEY-A.
           READ FILE-A.
           DISPLAY "A-READ-KEY2 ST=" WS-STATUS-A.

           MOVE 3 TO WS-RKEY-A.
           READ FILE-A.
           DISPLAY "A-READ-KEY3 ST=" WS-STATUS-A " VAL=" VAL-A.
           CLOSE FILE-A.
           STOP RUN.
