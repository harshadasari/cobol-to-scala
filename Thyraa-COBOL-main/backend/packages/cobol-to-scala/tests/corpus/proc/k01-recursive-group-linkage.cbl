      * Adversarial (round 22): round-21 finding 2's own doc comment
      * (generateRecursiveEntryMethod, generator/scala-generator.js)
      * explicitly narrows its getter/setter-closure fix to a RECURSIVE
      * program whose LINKAGE parameter is a plain scalar - "a GROUP
      * LINKAGE parameter falls back to the ordinary generateEntryMethod
      * convention entirely - an out-of-scope combination no corpus
      * program exercises". This is exactly that out-of-scope shape,
      * tried for real: a RECURSIVE subprogram whose sole LINKAGE item
      * is a GROUP (LS-DEPTH-GRP, containing LS-DEPTH/LS-TAG), called
      * recursively three levels deep, mirroring j10's own probe/print
      * shape as closely as possible so any divergence is attributable
      * to the GROUP-vs-scalar difference alone. The goal is to confirm
      * this falls back HONESTLY (a visible marker, or a fallback whose
      * own documented convention is followed transparently) rather than
      * silently producing wrong per-activation values with no marker.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K01RECMAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-DEPTH-GRP.
           05 WS-DEPTH PIC 9(2) VALUE 1.
           05 WS-TAG   PIC X(3) VALUE "TOP".
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "K01RECSUB" USING WS-DEPTH-GRP.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. K01RECSUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 0.
       01 WS-NEXT-GRP.
           05 WS-NEXT     PIC 9(2).
           05 WS-NEXT-TAG PIC X(3).
       LINKAGE SECTION.
       01 LS-DEPTH-GRP.
           05 LS-DEPTH PIC 9(2).
           05 LS-TAG   PIC X(3).
       PROCEDURE DIVISION USING LS-DEPTH-GRP.
       MAIN-PARA.
           ADD 1 TO WS-N.
           DISPLAY "ENTER DEPTH=" LS-DEPTH " TAG=" LS-TAG " WS-N=" WS-N.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT = LS-DEPTH + 1
               MOVE "SUB" TO WS-NEXT-TAG
               CALL "K01RECSUB" USING WS-NEXT-GRP
           END-IF.
           DISPLAY "EXIT  DEPTH=" LS-DEPTH " TAG=" LS-TAG " WS-N=" WS-N.
           GOBACK.
       END PROGRAM K01RECSUB.
       END PROGRAM K01RECMAIN.
