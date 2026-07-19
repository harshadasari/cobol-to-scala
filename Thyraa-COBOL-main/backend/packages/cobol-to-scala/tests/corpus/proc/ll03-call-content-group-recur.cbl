      * ll03 (round 36): pressure-test on round-35 finding 2 (kk07)'s BY
      * CONTENT snapshot fix for a GROUP operand with SEVERAL leaf children
      * (the `isNamedGroup` branch in generateCall's target.recursive path,
      * expression-gen.js) - does the isolated-snapshot mechanism handle
      * EACH leaf independently when a whole GROUP is passed BY CONTENT
      * into a self-recursive CALL? Real cobc: WS-GRP (WS-A/WS-B/WS-C) is
      * passed BY CONTENT into LL03SUB, which mutates all three leaves of
      * its own LK-GRP view and recurses one level with the (mutated, but
      * still callee-local) group again BY CONTENT - the deeper level's
      * mutations must never leak back up to the shallower level's own
      * view, and none of it must ever reach WS-GRP in MAIN.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL03MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP.
           05  WS-A PIC 9(3) VALUE 1.
           05  WS-B PIC 9(3) VALUE 2.
           05  WS-C PIC 9(3) VALUE 3.
       01  WS-DEPTH PIC 9(1) VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "MAIN BEFORE A=" WS-A " B=" WS-B " C=" WS-C.
           CALL "LL03SUB" USING BY CONTENT WS-GRP BY CONTENT WS-DEPTH.
           DISPLAY "MAIN AFTER  A=" WS-A " B=" WS-B " C=" WS-C.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL03SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-GRP.
           05  LK-A PIC 9(3).
           05  LK-B PIC 9(3).
           05  LK-C PIC 9(3).
       01  LK-DEPTH PIC 9(1).
       PROCEDURE DIVISION USING LK-GRP LK-DEPTH.
       SUB-MAIN.
           ADD 10 TO LK-A.
           ADD 20 TO LK-B.
           ADD 30 TO LK-C.
           DISPLAY "SUB DEPTH=" LK-DEPTH " A=" LK-A " B=" LK-B
               " C=" LK-C.
           IF LK-DEPTH > 1
               SUBTRACT 1 FROM LK-DEPTH
               CALL "LL03SUB" USING BY CONTENT LK-GRP
                   BY CONTENT LK-DEPTH
           END-IF.
           DISPLAY "SUB RETURN DEPTH=" LK-DEPTH " A=" LK-A " B=" LK-B
               " C=" LK-C.
       END PROGRAM LL03SUB.

       END PROGRAM LL03MAIN.
