      * ii04: round-32 finding 2 (hh02) added a content-fingerprint
      * (`someFileSig`) as a third disjunct in the occVar reload-
      * staleness check, closing the gap where round-31's own length-
      * only comparison could be defeated by a single length-preserving
      * rewrite from a DIFFERENT logical file sharing the same physical
      * path. This probes a THIRD logical file relaying through the SAME
      * physical path: FILE-A writes keys 1/2/3 (all occupied) and
      * closes; FILE-B then truncates and rewrites the same path with
      * key 2 left a genuine gap (same record count, different pattern -
      * hh02's own shape); FILE-C then truncates AGAIN and rewrites all
      * three keys with yet another set of values (same record count,
      * gap re-filled). FILE-A then reopens I-O and reads all three keys
      * - the correct behavior is to see FILE-C's own final content (not
      * FILE-A's own stale original values, and not FILE-B's own
      * intermediate gap either), since FILE-A's own signature was only
      * ever captured against its OWN closing content, and the freshly
      * reloaded signature at reopen time must differ from it no matter
      * how many intervening rewrites happened.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II04RELAY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT FILE-A ASSIGN TO "II04SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-A
               FILE STATUS IS WS-STATUS-A.
           SELECT FILE-B ASSIGN TO "II04SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-B
               FILE STATUS IS WS-STATUS-B.
           SELECT FILE-C ASSIGN TO "II04SHARED.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY-C
               FILE STATUS IS WS-STATUS-C.
       DATA DIVISION.
       FILE SECTION.
       FD  FILE-A.
       01  REC-A.
           05  VAL-A       PIC 9(4).
       FD  FILE-B.
       01  REC-B.
           05  VAL-B       PIC 9(4).
       FD  FILE-C.
       01  REC-C.
           05  VAL-C       PIC 9(4).
       WORKING-STORAGE SECTION.
       01  WS-RKEY-A       PIC 9(3) VALUE 0.
       01  WS-RKEY-B       PIC 9(3) VALUE 0.
       01  WS-RKEY-C       PIC 9(3) VALUE 0.
       01  WS-STATUS-A     PIC XX.
       01  WS-STATUS-B     PIC XX.
       01  WS-STATUS-C     PIC XX.
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
           MOVE 3 TO WS-RKEY-B. MOVE 7000 TO VAL-B.
           WRITE REC-B INVALID KEY DISPLAY "B-W3 FAIL".
           DISPLAY "B-WRITE-GAP2 ST=" WS-STATUS-B.
           CLOSE FILE-B.

           OPEN OUTPUT FILE-C.
           MOVE 1 TO WS-RKEY-C. MOVE 8000 TO VAL-C.
           WRITE REC-C INVALID KEY DISPLAY "C-W1 FAIL".
           MOVE 2 TO WS-RKEY-C. MOVE 9000 TO VAL-C.
           WRITE REC-C INVALID KEY DISPLAY "C-W2 FAIL".
           MOVE 3 TO WS-RKEY-C. MOVE 6000 TO VAL-C.
           WRITE REC-C INVALID KEY DISPLAY "C-W3 FAIL".
           DISPLAY "C-WRITE-ALL3 ST=" WS-STATUS-C.
           CLOSE FILE-C.

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
