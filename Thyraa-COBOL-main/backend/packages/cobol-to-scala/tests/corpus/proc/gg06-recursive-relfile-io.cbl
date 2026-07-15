      * gg06: fresh combination - a RECURSIVE program (ff05-ff08 already
      * exercise RECURSIVE control flow: EXIT PARAGRAPH/SECTION/PERFORM,
      * GOTO/GOBACK, deep STOP RUN) doing its OWN RELATIVE-file I/O across
      * recursive re-entry, never combined before. The file is OPENed
      * OUTPUT only on the outermost (LS-DEPTH=1) activation; EVERY
      * activation (including nested ones, before the recursive CALL
      * returns) WRITEs its own record to the SAME shared file at a key
      * matching its own depth. Real COBOL file state (FD/file handles)
      * is NOT part of a RECURSIVE program's per-activation storage - it
      * is process-global, shared across every recursion level - so this
      * checks whether the engine's own file-handle variables (bufVar/
      * occVar/etc., module-level per generateFileHandleDeclarations) are
      * correctly shared the same way across nested recursive activations,
      * rather than accidentally reset or duplicated per call.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG06MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "GG06SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. GG06SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "GG06REL.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REC-DEPTH   PIC 9(2).
           05  REC-VAL     PIC 9(4).
       WORKING-STORAGE SECTION.
       01  WS-RKEY         PIC 9(3) VALUE 0.
       01  WS-STATUS       PIC XX.
       01  WS-NEXT-DEPTH   PIC 9(2).
       01  WS-I            PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           IF LS-DEPTH = 1
               OPEN OUTPUT REL-FILE
           END-IF.

           MOVE LS-DEPTH TO WS-RKEY.
           MOVE LS-DEPTH TO REC-DEPTH.
           COMPUTE REC-VAL = 1000 + LS-DEPTH.
           WRITE REL-REC.
           DISPLAY "WRITE DEPTH=" LS-DEPTH " ST=" WS-STATUS.

           IF LS-DEPTH < 3
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "GG06SUB" USING WS-NEXT-DEPTH
           END-IF.

           IF LS-DEPTH = 1
               CLOSE REL-FILE
               OPEN INPUT REL-FILE
               PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > 3
                   READ REL-FILE
                   DISPLAY "READ ST=" WS-STATUS " DEPTH=" REC-DEPTH
                       " VAL=" REC-VAL
               END-PERFORM
               CLOSE REL-FILE
           END-IF.

           DISPLAY "RETURN DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM GG06SUB.
       END PROGRAM GG06MAIN.
