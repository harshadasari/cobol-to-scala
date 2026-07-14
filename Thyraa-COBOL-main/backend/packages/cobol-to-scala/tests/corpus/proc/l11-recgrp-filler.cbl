      * Adversarial (round 23): round-22 finding 1's own doc comment
      * (flattenGroupLeaves, generator/expression-gen.js) lists a
      * FILLER child as a SECOND bail-to-null case for a RECURSIVE
      * program's GROUP LINKAGE parameter (alongside the OCCURS case
      * l10 exercises), falling back to "the ordinary convention" - not
      * yet tried against a real corpus program. LS-DEPTH-GRP here
      * mirrors k01's own shape exactly (LS-DEPTH, then LS-TAG) but
      * with an anonymous FILLER inserted between them, three levels of
      * recursion deep. Checks whether this bail-out is an HONEST
      * decline or (like l10's OCCURS-child variant) a silent
      * infinite-recursion crash, since LS-DEPTH itself sits in the
      * SAME group as the FILLER that triggers the bail-out.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L11MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DEPTH-GRP.
           05 WS-DEPTH PIC 9(2) VALUE 1.
           05 FILLER   PIC X(3) VALUE "XXX".
           05 WS-TAG   PIC X(3) VALUE "TOP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "L11SUB" USING WS-DEPTH-GRP.
           STOP RUN.
       END PROGRAM L11MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L11SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 0.
       01 WS-NEXT-GRP.
           05 WS-NEXT     PIC 9(2).
           05 FILLER      PIC X(3).
           05 WS-NEXT-TAG PIC X(3).
       LINKAGE SECTION.
       01 LS-DEPTH-GRP.
           05 LS-DEPTH PIC 9(2).
           05 FILLER   PIC X(3).
           05 LS-TAG   PIC X(3).
       PROCEDURE DIVISION USING LS-DEPTH-GRP.
       MAIN-PARA.
           ADD 1 TO WS-N.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " TAG=" LS-TAG " WS-N=" WS-N.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               MOVE "SUB" TO WS-NEXT-TAG
               CALL "L11SUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " TAG=" LS-TAG " WS-N=" WS-N.
           GOBACK.
       END PROGRAM L11SUB.
