      * Adversarial (round 23): round-22 finding 1 fixed a RECURSIVE
      * subprogram whose LINKAGE parameter is a FLAT group (k01:
      * LS-DEPTH-GRP containing only elementary children LS-DEPTH/
      * LS-TAG) by flattening the group's leaves into individual
      * getter/setter closures. `flattenGroupLeaves` (generator/
      * expression-gen.js) is documented as recursing into a NESTED
      * sub-group too, but no corpus program actually exercises that
      * recursive branch - every existing recursive-group-linkage
      * program (k01) uses a group whose children are ALL elementary,
      * never a group containing another group. This program is exactly
      * that untested shape: LS-DEPTH-GRP contains LS-DEPTH (elementary)
      * AND LS-INNER-GRP (a NESTED sub-group with its own two
      * elementary children, LS-INNER-A/LS-INNER-B), recursed three
      * levels deep. The goal is to confirm the nested-group leaf
      * flattening actually produces correct independent per-activation
      * values (like k01 does for the flat case), not silently reused/
      * clobbered storage for the nested sub-group's own children.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L01MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DEPTH-GRP.
           05 WS-DEPTH PIC 9(2) VALUE 1.
           05 WS-INNER-GRP.
               10 WS-INNER-A PIC 9(2) VALUE 10.
               10 WS-INNER-B PIC X(3) VALUE "AAA".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "L01SUB" USING WS-DEPTH-GRP.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L01SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 0.
       01 WS-NEXT-GRP.
           05 WS-NEXT PIC 9(2).
           05 WS-NEXT-INNER-GRP.
               10 WS-NEXT-INNER-A PIC 9(2).
               10 WS-NEXT-INNER-B PIC X(3).
       LINKAGE SECTION.
       01 LS-DEPTH-GRP.
           05 LS-DEPTH PIC 9(2).
           05 LS-INNER-GRP.
               10 LS-INNER-A PIC 9(2).
               10 LS-INNER-B PIC X(3).
       PROCEDURE DIVISION USING LS-DEPTH-GRP.
       MAIN-PARA.
           ADD 1 TO WS-N.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " A=" LS-INNER-A
               " B=" LS-INNER-B " WS-N=" WS-N.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               COMPUTE WS-NEXT-INNER-A = LS-INNER-A + 1
               MOVE "SUB" TO WS-NEXT-INNER-B
               CALL "L01SUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " A=" LS-INNER-A
               " B=" LS-INNER-B " WS-N=" WS-N.
           GOBACK.
       END PROGRAM L01SUB.
       END PROGRAM L01MAIN.
