      * pp15 (round 40): fresh-territory probe - `PROGRAM-ID. NAME
      * INITIAL.` (the INITIAL attribute: WORKING-STORAGE is reset to its
      * VALUE-clause defaults on EVERY call, not just the first). This
      * engine's `isRecursiveProgram` (generator/scala-generator.js) scans
      * PROGRAM-ID's own clause specifically for the RECURSIVE keyword, but
      * a grep finds no equivalent check for INITIAL/COMMON anywhere - this
      * engine's WORKING-STORAGE model is a plain module-level `var`
      * initialized once, so a NON-recursive subprogram called twice would
      * silently retain state across calls regardless of INITIAL. This
      * probe calls the same INITIAL subprogram twice and checks whether
      * its own internal counter resets to the SAME starting value both
      * times (real cobc, INITIAL) or keeps accumulating (this engine's
      * likely un-modeled default).
      *
      * OUTCOME (DISHONEST - confirmed exactly as hypothesized): cobc:
      * `COUNTER=001` on BOTH calls (INITIAL resets WORKING-STORAGE to
      * its VALUE-clause defaults on every entry). Engine: `COUNTER=001`
      * then `COUNTER=002` - the INITIAL attribute is completely
      * unmodeled; PP15SUB's `var wsCounter: Int = 0` is an ordinary
      * module-level var initialized once at class-load time and simply
      * persists across both CALLs, exactly like an ordinary (non-
      * INITIAL) subprogram would (and correctly should NOT). Suggested
      * fix: add an `isInitialProgram(ast)` check mirroring
      * `isRecursiveProgram`'s own token-scan-of-PROGRAM-ID's-own-clause
      * pattern (scan for the INITIAL keyword instead of RECURSIVE), and
      * for a program so flagged, reset every WORKING-STORAGE var to its
      * own declared VALUE-clause default at the top of `entry()` (a
      * simpler, non-per-activation version of the machinery
      * `generateRecursiveEntryMethod` already has for a different
      * reason) - PROGRAM-ID ... COMMON was not separately exercised by
      * this probe and remains unverified/unmodeled too, per the same
      * grep showing no COMMON-specific handling anywhere either.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP15MAIN.
       PROCEDURE DIVISION.
           DISPLAY "CALL1".
           CALL "PP15SUB".
           DISPLAY "CALL2".
           CALL "PP15SUB".
           STOP RUN.
       END PROGRAM PP15MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP15SUB INITIAL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-COUNTER PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
           ADD 1 TO WS-COUNTER.
           DISPLAY "COUNTER=" WS-COUNTER.
           GOBACK.
       END PROGRAM PP15SUB.
