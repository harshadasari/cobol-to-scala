      * dd08: The round-27 occupied-tracking array (occVar, finding 3/4)
      * exercised across a CLOSE + re-OPEN I-O cycle, RANDOM access.
      * Round-27's own comment says generateOpen's pushBufferLoadLines
      * "rebuilds occVar on every reload from the just-loaded bufVar's
      * own content" - but no prior corpus program actually closes and
      * reopens a RANDOM-access RELATIVE file with a GAP (a
      * never-written slot) already in it, so this specific reload path
      * (as opposed to occVar's initial construction on first OPEN) has
      * never been oracle-verified. Writes keys 1 and 3 (leaving key 2 a
      * gap), CLOSEs, re-OPENs I-O, confirms key 2 still correctly
      * reports "not found" (occVar reloaded as unoccupied, not stale/
      * leaked as occupied), WRITEs key 2 for real, CLOSEs, re-OPENs a
      * THIRD time, and confirms all three keys now read back correctly
      * (occVar reloaded as occupied this time).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD08OCCREOPEN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "DD08REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-ID    PIC 9(3).
           05  REC-VAL   PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY       PIC 9(4).
       01  WS-STATUS     PIC X(2).
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY. MOVE 1 TO REC-ID. MOVE "ONE  " TO REC-VAL.
           WRITE REL-REC INVALID KEY DISPLAY "W1 FAIL".
           MOVE 3 TO WS-RKEY. MOVE 3 TO REC-ID. MOVE "THREE" TO REC-VAL.
           WRITE REL-REC INVALID KEY DISPLAY "W3 FAIL".
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 2 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY DISPLAY "READ2-GAP INVALID ST=" WS-STATUS
               NOT INVALID KEY DISPLAY "READ2-GAP FOUND ST=" WS-STATUS
           END-READ.
           MOVE 2 TO WS-RKEY. MOVE 2 TO REC-ID. MOVE "TWO  " TO REC-VAL.
           WRITE REL-REC
               INVALID KEY DISPLAY "W2 FAIL ST=" WS-STATUS
               NOT INVALID KEY DISPLAY "W2 OK ST=" WS-STATUS
           END-WRITE.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY DISPLAY "READ1-AFTER INVALID"
               NOT INVALID KEY
                   DISPLAY "READ1-AFTER ID=" REC-ID " VAL=" REC-VAL
           END-READ.
           MOVE 2 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY DISPLAY "READ2-AFTER INVALID"
               NOT INVALID KEY
                   DISPLAY "READ2-AFTER ID=" REC-ID " VAL=" REC-VAL
           END-READ.
           MOVE 3 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY DISPLAY "READ3-AFTER INVALID"
               NOT INVALID KEY
                   DISPLAY "READ3-AFTER ID=" REC-ID " VAL=" REC-VAL
           END-READ.
      * Re-WRITE key 2 again now that it IS occupied - must be a
      * duplicate-key failure (status 22), confirming occVar reloaded
      * as TRUE for key 2, not left stuck at its post-reload-gap value.
           MOVE 2 TO WS-RKEY. MOVE 2 TO REC-ID. MOVE "DUPE!" TO REC-VAL.
           WRITE REL-REC
               INVALID KEY DISPLAY "W2-DUP INVALID ST=" WS-STATUS
               NOT INVALID KEY DISPLAY "W2-DUP OK ST=" WS-STATUS
           END-WRITE.
           CLOSE REL-FILE.
           STOP RUN.
