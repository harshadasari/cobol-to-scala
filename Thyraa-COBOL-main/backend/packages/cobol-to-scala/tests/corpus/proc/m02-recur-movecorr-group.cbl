      * Adversarial (round 24): companion to m01. `generateMoveCorresponding`
      * (generator/expression-gen.js) builds its own per-matched-pair write
      * as a raw `${pair.targetCamel} = ${...}` string too - a THIRD bare-
      * assignment call site round-23 finding 1's fix (assignExpr/
      * RECURSIVE_LEAF_NAMES) never touched, alongside INITIALIZE's own
      * non-subscripted group branch (m01). This checks MOVE CORRESPONDING
      * writing directly into a RECURSIVE program's own GROUP LINKAGE
      * parameter at the deepest (base-case) activation, then unwinds back
      * through two more activations to confirm each outer frame's own
      * original LS-GRP survives untouched (the same per-activation
      * aliasing k01/l11 already established for other write paths).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M02MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-GRP.
           05 F-N   PIC 9(2) VALUE 3.
           05 F-TAG PIC X(3) VALUE "TOP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M02SUB" USING WS-GRP.
           STOP RUN.
       END PROGRAM M02MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M02SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC.
           05 F-N   PIC 9(2) VALUE 9.
           05 F-TAG PIC X(3) VALUE "NEW".
       01 WS-NEXT-GRP.
           05 NX-N   PIC 9(2).
           05 NX-TAG PIC X(3).
       LINKAGE SECTION.
       01 LS-GRP.
           05 F-N   PIC 9(2).
           05 F-TAG PIC X(3).
       PROCEDURE DIVISION USING LS-GRP.
       MAIN-PARA.
           DISPLAY "ENTER N=" F-N OF LS-GRP " TAG=" F-TAG OF LS-GRP.
           IF F-N OF LS-GRP < 2
               MOVE CORRESPONDING WS-SRC TO LS-GRP
           ELSE
               COMPUTE NX-N = F-N OF LS-GRP - 1
               MOVE "SUB" TO NX-TAG
               CALL "M02SUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  N=" F-N OF LS-GRP " TAG=" F-TAG OF LS-GRP.
           GOBACK.
       END PROGRAM M02SUB.
