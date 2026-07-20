      * pp03 (round 40): round-39 finding 2 (oo04) fixed a ref-mod WRITE
      * (LK-SLICE(1:2) = ...) onto a RECURSIVE program's own SCALAR LINKAGE
      * leaf (a compile crash: "Reassignment to val"). This probe combines
      * that with a GROUP-shaped LINKAGE parameter (not a bare scalar) - the
      * ref-mod write targets a LEAF field of a LINKAGE GROUP, so
      * targetCamelFor/RECURSIVE_LEAF_NAMES must recognize the flattened
      * per-leaf name (e.g. lkTag) as a recursive leaf too, not just a
      * top-level LINKAGE scalar.
      *
      * OUTCOME (HONEST): compiles cleanly (no "Reassignment to val"
      * crash - round-39 finding 2's assignExpr/RECURSIVE_LEAF_NAMES fix
      * generalizes correctly to a GROUP-flattened LINKAGE leaf name, not
      * just a bare scalar LINKAGE parameter). Runs up to the ref-mod
      * write itself, then throws the SAME pre-existing, documented
      * `scala.NotImplementedError` (the `???` honest-decline placeholder
      * for ref-mod WRITE - Known Gap #1) - matching oo04's own accepted
      * "compiles cleanly, declines honestly at runtime" bar exactly, not
      * a new/different failure mode.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP03MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-ITEM.
           05  WS-NUM PIC 9(2) VALUE 7.
           05  WS-TAG PIC X(6) VALUE "ABCDEF".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE TAG=[" WS-TAG "]".
           CALL "PP03SUB" USING BY REFERENCE WS-ITEM.
           DISPLAY "AFTER TAG=[" WS-TAG "]".
           STOP RUN.
       END PROGRAM PP03MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP03SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-ITEM.
           05  LK-NUM PIC 9(2).
           05  LK-TAG PIC X(6).
       PROCEDURE DIVISION USING LK-ITEM.
           DISPLAY "IN SUB TAG=[" LK-TAG "]".
           MOVE "ZZ" TO LK-TAG(2:2).
           GOBACK.
       END PROGRAM PP03SUB.
