      * ii05: round-32 finding 2's own briefing explicitly asks whether
      * the fingerprint mechanism is robust when a file is rewritten with
      * the SAME exact content - it should NOT force an unnecessary
      * rebuild-from-content (round-30/31's own "reuse occVar verbatim
      * when safe" behavior should still apply). FILE-A writes keys
      * 1/2/3, closes. FILE-B (same physical path) then writes the
      * IDENTICAL three values in the identical key order, closes -
      * genuinely indistinguishable bytes on disk from FILE-A's own
      * close, even though a DIFFERENT logical file produced them. FILE-A
      * then reopens I-O and reads all three keys back - correct
      * behavior (via either reuse or a content-identical rebuild) is
      * unchanged: all three keys occupied with the same values.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II05SAME.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "II05SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-A
               FILE STATUS IS WS-STATUS-A.
           SELECT FILE-B ASSIGN TO "II05SHARED.DAT"
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
           MOVE 1 TO WS-RKEY-A. MOVE 1111 TO VAL-A.
           WRITE REC-A INVALID KEY DISPLAY "A-W1 FAIL".
           MOVE 2 TO WS-RKEY-A. MOVE 2222 TO VAL-A.
           WRITE REC-A INVALID KEY DISPLAY "A-W2 FAIL".
           MOVE 3 TO WS-RKEY-A. MOVE 3333 TO VAL-A.
           WRITE REC-A INVALID KEY DISPLAY "A-W3 FAIL".
           DISPLAY "A-WRITE-ALL3 ST=" WS-STATUS-A.
           CLOSE FILE-A.

           OPEN OUTPUT FILE-B.
           MOVE 1 TO WS-RKEY-B. MOVE 1111 TO VAL-B.
           WRITE REC-B INVALID KEY DISPLAY "B-W1 FAIL".
           MOVE 2 TO WS-RKEY-B. MOVE 2222 TO VAL-B.
           WRITE REC-B INVALID KEY DISPLAY "B-W2 FAIL".
           MOVE 3 TO WS-RKEY-B. MOVE 3333 TO VAL-B.
           WRITE REC-B INVALID KEY DISPLAY "B-W3 FAIL".
           DISPLAY "B-WRITE-SAME3 ST=" WS-STATUS-B.
           CLOSE FILE-B.

           OPEN I-O FILE-A.
           MOVE 1 TO WS-RKEY-A.
           READ FILE-A
               INVALID KEY DISPLAY "A-READ-KEY1 INVALID ST=" WS-STATUS-A
               NOT INVALID KEY
                   DISPLAY "A-READ-KEY1 ST=" WS-STATUS-A " VAL=" VAL-A
           END-READ.

           MOVE 2 TO WS-RKEY-A.
           READ FILE-A
               INVALID KEY DISPLAY "A-READ-KEY2 INVALID ST=" WS-STATUS-A
               NOT INVALID KEY
                   DISPLAY "A-READ-KEY2 ST=" WS-STATUS-A " VAL=" VAL-A
           END-READ.

           MOVE 3 TO WS-RKEY-A.
           READ FILE-A
               INVALID KEY DISPLAY "A-READ-KEY3 INVALID ST=" WS-STATUS-A
               NOT INVALID KEY
                   DISPLAY "A-READ-KEY3 ST=" WS-STATUS-A " VAL=" VAL-A
           END-READ.
           CLOSE FILE-A.
           STOP RUN.
