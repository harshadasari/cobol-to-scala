      * pp01 (round 40): round-39 finding 1 (oo03) fixed a subscripted
      * GROUP-table row (2 leaves: VAL/TAG) BY REFERENCE into a RECURSIVE
      * callee. This probe pressure-tests a DEEPER nesting: a 3-level GROUP
      * (WS-ITEM contains WS-SUB which contains two leaves) so
      * flattenGroupLeaves must walk two levels of nested GROUP, not just
      * one, to find all the real leaves. NOTE: per round-39 finding 1's own
      * documented residual (this exact installed GnuCOBOL build corrupts
      * ANY bare numeric literal passed as a CALL...USING argument to a
      * blank value, orthogonal to this finding's own root cause), the
      * DEPTH argument is passed via a named WORKING-STORAGE/LINKAGE
      * variable at every call site instead of a bare literal, to avoid
      * that unrelated toolchain quirk entirely.
      *
      * OUTCOME (HONEST - byte-match): confirms round-39 finding 1's
      * per-leaf getter/setter mechanism (isSubscriptedNamedGroup,
      * generator/expression-gen.js) generalizes correctly to a 3-level
      * nested GROUP (flattenGroupLeaves walks both nesting levels), not
      * just the 2-level shape oo03 originally exercised.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP01MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ITEM OCCURS 2 TIMES.
               10  WS-ITEM-ID PIC 9(2).
               10  WS-SUB.
                   15  WS-SUB-A PIC 9(3).
                   15  WS-SUB-B PIC X(3).
       01  WS-DEPTH PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 1 TO WS-ITEM-ID(1).
           MOVE 100 TO WS-SUB-A(1).
           MOVE "AAA" TO WS-SUB-B(1).
           MOVE 2 TO WS-ITEM-ID(2).
           MOVE 200 TO WS-SUB-A(2).
           MOVE "BBB" TO WS-SUB-B(2).
           DISPLAY "BEFORE ID2=" WS-ITEM-ID(2) " A2=" WS-SUB-A(2)
               " B2=" WS-SUB-B(2).
           CALL "PP01SUB" USING BY REFERENCE WS-ITEM(2) WS-DEPTH.
           DISPLAY "AFTER ID2=" WS-ITEM-ID(2) " A2=" WS-SUB-A(2)
               " B2=" WS-SUB-B(2).
           STOP RUN.
       END PROGRAM PP01MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP01SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-ZERO PIC 9 VALUE 0.
       LINKAGE SECTION.
       01  LK-ITEM.
           05  LK-ID PIC 9(2).
           05  LK-SUB.
               10  LK-SUB-A PIC 9(3).
               10  LK-SUB-B PIC X(3).
       01  LK-DEPTH PIC 9.
       PROCEDURE DIVISION USING LK-ITEM LK-DEPTH.
           DISPLAY "IN SUB DEPTH=" LK-DEPTH " A=" LK-SUB-A.
           ADD LK-DEPTH TO LK-SUB-A.
           IF LK-DEPTH > 0
               CALL "PP01SUB" USING BY REFERENCE LK-ITEM WS-ZERO
           END-IF.
           IF LK-DEPTH = 2
               MOVE "ZZZ" TO LK-SUB-B
           END-IF.
           GOBACK.
       END PROGRAM PP01SUB.
