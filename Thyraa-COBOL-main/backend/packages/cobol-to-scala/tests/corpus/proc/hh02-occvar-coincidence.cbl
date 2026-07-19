      * hh02: round-31 finding 1 (gg01) fixed occVar-reuse-after-reopen to
      * compare the freshly-reloaded bufVar's own length against the
      * persisted occVar's own length, rebuilding from content whenever
      * they DIFFER (a different logical file, sharing the SAME physical
      * path, having changed the file's shape out from under this one).
      * This probes the coincidence gg01 itself doesn't cover: what if a
      * DIFFERENT logical file rewrites the SAME physical path with a
      * DIFFERENT occupied-slot pattern, but happens to leave the SAME
      * record COUNT (so the length check alone can't tell)? FILE-A
      * writes keys 1/2/3 (all three occupied), closes. FILE-B then
      * truncates the SAME physical file and writes only keys 1 and 3
      * (auto-extending to 3 slots, but leaving key 2 a genuine gap) -
      * same final record count (3) as FILE-A's own stale in-memory
      * occVar, but a genuinely DIFFERENT occupied pattern. FILE-A then
      * reopens and reads key 2 - real cobc (reading straight off the
      * REAL, FILE-B-rewritten disk content) must report "not found"
      * (status 23); if the engine trusts its own stale, same-LENGTH
      * occVar array as ground truth purely because the lengths agree,
      * it will wrongly report key 2 as occupied instead.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH02COINC.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "HH02SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-A
               FILE STATUS IS WS-STATUS-A.
           SELECT FILE-B ASSIGN TO "HH02SHARED.DAT"
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
           MOVE 1 TO WS-RKEY-B. MOVE 5000 TO VAL-B.
           WRITE REC-B INVALID KEY DISPLAY "B-W1 FAIL".
           DISPLAY "B-WRITE-KEY1 ST=" WS-STATUS-B.
           MOVE 3 TO WS-RKEY-B. MOVE 7000 TO VAL-B.
           WRITE REC-B INVALID KEY DISPLAY "B-W3 FAIL".
           DISPLAY "B-WRITE-KEY3 ST=" WS-STATUS-B.
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
