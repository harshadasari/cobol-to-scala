      * Adversarial (round 24): round-23 finding 1 centralized every bare
      * `${camel} = value` string-building assignment site behind the new
      * `assignExpr`/RECURSIVE_LEAF_NAMES mechanism so a RECURSIVE program's
      * LINKAGE-aliased local getter/setter def pair is always written
      * through the explicit `<camel>_=(value)` setter call form, never
      * Scala's own (broken-for-locals) assignment sugar. That fix's own
      * text lists MOVE/ADD/SUBTRACT/COMPUTE/STRING/UNSTRING/ACCEPT/
      * INITIALIZE/SET as routing through the shared `renderAssignment`
      * helper it touched - but INITIALIZE of a whole GROUP target (no
      * subscript) does NOT go through renderAssignment at all: it recurses
      * through a SEPARATE helper, `initializeAssignmentLines`
      * (generator/expression-gen.js), whose own non-subscripted leaf branch
      * builds `${c.camel} = ${...}` directly as a raw string - a write path
      * `renderAssignment`'s own per-statement-type callers never reach.
      * This checks INITIALIZE of a RECURSIVE program's own GROUP LINKAGE
      * parameter (mirroring k01/l11's own LS-DEPTH-GRP shape) - the base
      * case resets its own LS-GRP via INITIALIZE rather than an ordinary
      * MOVE/COMPUTE, isolating whether that second, untouched bare-
      * assignment call site was actually covered by round-23's fix or is a
      * fifth still-undiscovered instance of the same bug class.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M01MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-GRP.
           05 WS-N   PIC 9(2) VALUE 3.
           05 WS-TAG PIC X(3) VALUE "TOP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M01SUB" USING WS-GRP.
           STOP RUN.
       END PROGRAM M01MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M01SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NEXT-GRP.
           05 WS-NEXT-N   PIC 9(2).
           05 WS-NEXT-TAG PIC X(3).
       LINKAGE SECTION.
       01 LS-GRP.
           05 LS-N   PIC 9(2).
           05 LS-TAG PIC X(3).
       PROCEDURE DIVISION USING LS-GRP.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N " TAG=" LS-TAG.
           IF LS-N > 0
               COMPUTE WS-NEXT-N = LS-N - 1
               MOVE "SUB" TO WS-NEXT-TAG
               CALL "M01SUB" USING WS-NEXT-GRP
           ELSE
               INITIALIZE LS-GRP
           END-IF.
           DISPLAY "EXIT  N=" LS-N " TAG=" LS-TAG.
           GOBACK.
       END PROGRAM M01SUB.
