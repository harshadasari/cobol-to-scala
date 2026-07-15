      * gg15: minimal isolation of a bug gg14 stumbled onto by accident -
      * NOT the occVar-reopen angle gg14's own doc comment describes, but
      * a genuine parser clause-ordering bug in `parseReadStatement`
      * (parser/procedure-parser.js): READ's grammar has TWO independent
      * "NOT ..." clauses - `NOT AT END` and `NOT INVALID KEY` - parsed by
      * TWO separate `if (ctx.matchValue('NOT'))` checks in sequence (the
      * AT END one first). When a keyed READ uses ONLY `NOT INVALID KEY`
      * (no `AT END` clause AND no `INVALID KEY` clause precedes it - both
      * perfectly legal COBOL, and the ONLY combination every pre-existing
      * corpus program - cc06, gg09 - never tries, since they all pair
      * INVALID KEY with NOT INVALID KEY together), the FIRST `if
      * (ctx.matchValue('NOT'))` (meant for `NOT AT END`) greedily
      * consumes the "NOT" token belonging to "NOT INVALID KEY" instead,
      * then fails to match "AT"/"END" (next tokens are "INVALID"/"KEY")
      * and calls `parseStatementBlock` from the WRONG position - the
      * genuine NOT INVALID KEY clause body is swallowed and never
      * reaches `stmt.notInvalidKey` at all, silently dropping its DISPLAY
      * with no error, marker, or crash of any kind.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG15NIKO.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG15REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-VAL     PIC X(5).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           MOVE "AAAAA" TO REC-VAL.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN INPUT REL-FILE.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE
               NOT INVALID KEY
                   DISPLAY "FOUND-KEY1 VAL=" REC-VAL
           END-READ.
           DISPLAY "AFTER-READ1 ST=" WS-STATUS.

           MOVE 9 TO WS-RKEY.
           READ REL-FILE
               NOT INVALID KEY
                   DISPLAY "FOUND-KEY9 VAL=" REC-VAL
           END-READ.
           DISPLAY "AFTER-READ9 ST=" WS-STATUS.
           CLOSE REL-FILE.
           STOP RUN.
