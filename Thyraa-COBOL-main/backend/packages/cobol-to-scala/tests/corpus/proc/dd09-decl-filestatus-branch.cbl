      * dd09: A single DECLARATIVES USE AFTER STANDARD ERROR PROCEDURE
      * handler, registered on a RANDOM-access RELATIVE file, that
      * branches its OWN behavior via EVALUATE on the specific FILE
      * STATUS value it receives. Every triggering statement here
      * deliberately has NO INVALID KEY/AT END clause of its own (round-
      * 10's own established rule: an explicit clause suppresses the
      * implicit DECLARATIVES procedure - so relying on the implicit
      * path requires omitting it), to isolate whether this generator's
      * keyed WRITE/READ/DELETE codegen (generateKeyedWriteStatement/
      * generateKeyedReadStatement/generateKeyedDeleteStatement) invokes
      * a registered DECLARATIVES handler at all for a KEYED failure -
      * round-26/27 only ever wired declarativeHandlerFor into OPEN's
      * failure path, a bare READ's end-of-file path, and REWRITE/
      * DELETE's own SEQUENTIAL-access failure path; the keyed
      * (RANDOM/DYNAMIC) codegen paths were never audited for this.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD09DECLBRANCH.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "DD09REL.DAT"
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
       DECLARATIVES.
       REL-FILE-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON REL-FILE.
       REL-FILE-HANDLER.
           EVALUATE WS-STATUS
               WHEN "22" DISPLAY "HANDLER: DUP-KEY ST=" WS-STATUS
               WHEN "23" DISPLAY "HANDLER: NOT-FOUND ST=" WS-STATUS
               WHEN "24" DISPLAY "HANDLER: BOUNDARY ST=" WS-STATUS
               WHEN "43" DISPLAY "HANDLER: NO-CURRENT-REC ST=" WS-STATUS
               WHEN OTHER DISPLAY "HANDLER: OTHER ST=" WS-STATUS
           END-EVALUATE.
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-PARA-START.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY. MOVE 1 TO REC-ID. MOVE "ONE  " TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "AFTER-W1 ST=" WS-STATUS.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
      * (1) Duplicate-key WRITE - no INVALID KEY clause: real cobc must
      * fire the DECLARATIVES handler with ST=22.
           MOVE 1 TO WS-RKEY. MOVE 1 TO REC-ID. MOVE "DUPE!" TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "AFTER-DUP-WRITE ST=" WS-STATUS.

      * (2) Keyed READ of a never-written gap - no INVALID KEY clause:
      * real cobc must fire the handler with ST=23.
           MOVE 9 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "AFTER-GAP-READ ST=" WS-STATUS " ID=" REC-ID.

      * (3) Boundary-violating WRITE (non-positive key) - no INVALID
      * KEY clause: real cobc must fire the handler with ST=24.
           MOVE 0 TO WS-RKEY. MOVE 0 TO REC-ID. MOVE "ZERO " TO REC-VAL.
           WRITE REL-REC.
           DISPLAY "AFTER-BOUNDARY-WRITE ST=" WS-STATUS.

      * (4) A REWRITE with no prior successful READ - no INVALID KEY
      * clause: real cobc must fire the handler with ST=43 (round-26
      * finding 1 territory, but SEQUENTIAL-guard-driven, not keyed).
           MOVE 5 TO WS-RKEY. MOVE 5 TO REC-ID. MOVE "STALE" TO REC-VAL.
           REWRITE REL-REC.
           DISPLAY "AFTER-STALE-REWRITE ST=" WS-STATUS.

           CLOSE REL-FILE.
           STOP RUN.
