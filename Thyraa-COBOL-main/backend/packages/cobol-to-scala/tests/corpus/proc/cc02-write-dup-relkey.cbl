      * cc02: WRITE (RANDOM access, explicit RELATIVE KEY) to a key
      * that ALREADY has a record - a duplicate-key WRITE. Real COBOL
      * must raise INVALID KEY (status 22 - duplicate key) and leave
      * the existing record untouched; WRITE must never silently
      * overwrite (that's REWRITE's job). Probes whether round-26's
      * "positive key always succeeds" WRITE model over-generalized.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC02WDUP.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "RELFILE.DAT"
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
       MAIN-LOGIC.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE 1 TO REC-ID.
           MOVE "FIRST" TO REC-VAL.
           WRITE REL-REC
               INVALID KEY
                   DISPLAY "WRITE1 INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "WRITE1 OK ST=" WS-STATUS
           END-WRITE.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
      * Second WRITE to the SAME key 1 - a duplicate. Must fail.
           MOVE 1 TO WS-RKEY.
           MOVE 1 TO REC-ID.
           MOVE "DUPE!" TO REC-VAL.
           WRITE REL-REC
               INVALID KEY
                   DISPLAY "WRITEDUP INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "WRITEDUP OK ST=" WS-STATUS
           END-WRITE.

      * Read key 1 back - must still be the ORIGINAL record.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READBACK INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READBACK ID=" REC-ID " VAL=" REC-VAL
           END-READ.

           CLOSE REL-FILE.
           STOP RUN.
