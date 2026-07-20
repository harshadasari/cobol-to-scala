      * oo15 (round 39): fresh-territory probe - a nested CALL chain
      * A calls B calls C calls A, NONE of the three PROGRAM-IDs declared
      * RECURSIVE. Real cobc compiles this fine (it's not detectable
      * statically) but ABENDS at RUNTIME the moment the cycle actually
      * closes: `libcob: error: recursive CALL from <X> to <Y> which is
      * NOT RECURSIVE`, nonzero exit code, no further output after the
      * abend line (confirmed empirically). This checks the engine
      * matches that runtime rejection (a real, distinguishable failure
      * mode) rather than silently allowing unbounded/incorrect execution
      * for a shape that isn't valid COBOL at all without RECURSIVE.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO15MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-N PIC 9 VALUE 1.
       PROCEDURE DIVISION.
           DISPLAY "MAIN CALLING A".
           CALL "OO15PA" USING WS-N.
           DISPLAY "MAIN DONE".
           STOP RUN.
       END PROGRAM OO15MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO15PA.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
           DISPLAY "IN A N=" LK-N.
           CALL "OO15PB" USING LK-N.
           DISPLAY "A DONE N=" LK-N.
           GOBACK.
       END PROGRAM OO15PA.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO15PB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
           DISPLAY "IN B N=" LK-N.
           CALL "OO15PC" USING LK-N.
           DISPLAY "B DONE N=" LK-N.
           GOBACK.
       END PROGRAM OO15PB.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO15PC.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
           DISPLAY "IN C N=" LK-N.
           ADD 1 TO LK-N.
           IF LK-N < 3
               CALL "OO15PA" USING LK-N
           END-IF.
           DISPLAY "C DONE N=" LK-N.
           GOBACK.
       END PROGRAM OO15PC.
