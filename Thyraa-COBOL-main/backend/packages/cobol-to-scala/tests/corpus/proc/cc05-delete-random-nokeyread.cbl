      * cc05: DELETE in RANDOM access mode using the RELATIVE KEY
      * DIRECTLY, with NO prior READ at all. Real COBOL: for
      * RANDOM/DYNAMIC access, DELETE addresses the record identified
      * by the file's CURRENT RELATIVE KEY value directly - no prior
      * READ is required (unlike SEQUENTIAL access, where DELETE
      * always targets "whatever was just READ"). Round-26 finding 2
      * added RELATIVE-KEY addressing to READ/REWRITE/WRITE but
      * (investigation found) never touched generateDeleteStatement -
      * it still unconditionally requires hasCurrentVar (a prior
      * READ), regardless of access mode.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. CC05DELR.
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
           MOVE "AAAAA" TO REC-VAL.
           WRITE REL-REC.
           MOVE 2 TO WS-RKEY.
           MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL.
           WRITE REL-REC.
           MOVE 3 TO WS-RKEY.
           MOVE 3 TO REC-ID.
           MOVE "CCCCC" TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
      * DELETE record 2 directly by RELATIVE KEY - NO prior READ.
      * (Only the INVALID KEY clause is used here, deliberately - a
      * separate probe, cc06, isolates DELETE's own NOT INVALID KEY
      * clause parsing as its own finding.)
           MOVE 2 TO WS-RKEY.
           DELETE REL-FILE RECORD
               INVALID KEY
                   DISPLAY "DELETE2 INVALID ST=" WS-STATUS
           END-DELETE.
           DISPLAY "DELETE2 STATUS=" WS-STATUS.

      * Verify record 1 and 3 survive, record 2 is gone.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ1 INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ1 ID=" REC-ID " VAL=" REC-VAL
           END-READ.

           MOVE 3 TO WS-RKEY.
           READ REL-FILE
               INVALID KEY
                   DISPLAY "READ3 INVALID ST=" WS-STATUS
               NOT INVALID KEY
                   DISPLAY "READ3 ID=" REC-ID " VAL=" REC-VAL
           END-READ.

           CLOSE REL-FILE.
           STOP RUN.
