      * pp02 (round 40): round-39 finding 1 (oo03) added a per-leaf getter/
      * setter closure pair for a subscripted GROUP-table row BY REFERENCE
      * into a RECURSIVE callee. Round-36 finding 1 (ll01) fixed a DIFFERENT
      * bug (duplicate BY-CONTENT snapshot-var names) for two textually
      * distinct CALL sites in one paragraph. This probe combines both: the
      * SAME subscripted GROUP row passed BY REFERENCE to TWO different CALL
      * sites (same paragraph), to check the per-leaf closures from finding 1
      * don't collide the way the pre-round-36 snapshot vars did.
      *
      * OUTCOME (DISHONEST - but NOT the hypothesis above; the per-leaf
      * closures themselves never collide). Direct AST inspection found
      * `parseCallStatement` (parser/procedure-parser.js) silently drops
      * the SECOND USING operand (the bare numeric literal "1"/"2" for
      * LK-TOKEN) from `stmt.using` entirely - only the first operand
      * (WS-ITEM(2)) is recorded. Root cause: the USING-loop's own
      * continuation `while` condition (just inside `if
      * (ctx.matchValue('USING'))`) lists TokenType.IDENTIFIER,
      * STRING_LITERAL, BY/REFERENCE/CONTENT/VALUE, OMITTED, and COMMA -
      * but NOT TokenType.NUMERIC_LITERAL - so the loop exits the instant
      * it sees a bare numeric literal operand, leaving it (and the
      * statement's own terminating period) completely unconsumed. See
      * pp02b for a minimal, non-RECURSIVE, non-subscripted isolation of
      * this exact root cause and its full downstream effect. (This
      * program's own cobc oracle capture is ALSO wrong, for a completely
      * unrelated reason - see pp02b's own note - so this file cannot
      * serve as a clean byte-diff oracle for the fix; pp02b can.)
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP02MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-TABLE.
           05  WS-ITEM OCCURS 2 TIMES.
               10  WS-ITEM-VAL PIC 9(3).
               10  WS-ITEM-TAG PIC X(3).
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10 TO WS-ITEM-VAL(1).
           MOVE "AAA" TO WS-ITEM-TAG(1).
           MOVE 20 TO WS-ITEM-VAL(2).
           MOVE "BBB" TO WS-ITEM-TAG(2).
           DISPLAY "BEFORE VAL2=" WS-ITEM-VAL(2) " TAG2=" WS-ITEM-TAG(2).
           CALL "PP02SUB" USING BY REFERENCE WS-ITEM(2) 1.
           DISPLAY "MID VAL2=" WS-ITEM-VAL(2) " TAG2=" WS-ITEM-TAG(2).
           CALL "PP02SUB" USING BY REFERENCE WS-ITEM(2) 2.
           DISPLAY "AFTER VAL2=" WS-ITEM-VAL(2) " TAG2=" WS-ITEM-TAG(2).
           STOP RUN.
       END PROGRAM PP02MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP02SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-ITEM.
           05  LK-VAL PIC 9(3).
           05  LK-TAG PIC X(3).
       01  LK-TOKEN PIC 9.
       PROCEDURE DIVISION USING LK-ITEM LK-TOKEN.
           ADD LK-TOKEN TO LK-VAL.
           IF LK-TOKEN = 1
               MOVE "ONE" TO LK-TAG
           ELSE
               MOVE "TWO" TO LK-TAG
           END-IF.
           GOBACK.
       END PROGRAM PP02SUB.
