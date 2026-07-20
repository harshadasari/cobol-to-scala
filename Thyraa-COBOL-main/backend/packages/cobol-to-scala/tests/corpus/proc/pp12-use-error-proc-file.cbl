      * pp12 (round 40): round-39 finding 3 (oo05/oo06) added an outer
      * `if !isOpenVar || <wrong mode> then <48/49> else <original body>`
      * guard to generateWriteStatement/generateRewriteStatement/
      * generateDeleteStatement - but that guard's OWN "if" branch (the
      * newly-added not-open/wrong-mode short-circuit) never calls
      * declarativeHandlerFor at all, unlike every OTHER keyed-I/O failure
      * path in this generator (bb07 above: a REWRITE-with-no-prior-READ
      * failure DOES invoke a registered USE AFTER STANDARD ERROR PROCEDURE
      * handler). This probe registers that same declarative and triggers
      * a WRITE-after-CLOSE (status 48) to check whether real cobc invokes
      * the handler for THIS specific failure mode too, and whether the
      * generated Scala's new oo05/oo06 guard does the same.
      *
      * OUTCOME (DISHONEST - confirmed exactly as hypothesized): cobc
      * prints `DECLARATIVES-FIRED STATUS=48` immediately before
      * `WRITE-AFTER-CLOSE STATUS=48` - the registered handler DOES fire
      * for a WRITE-after-CLOSE failure, exactly like it already does for
      * every other keyed-I/O failure this generator models (bb07's own
      * REWRITE-with-no-prior-READ case, boundary violations, etc.). The
      * engine's generated Scala sets the correct STATUS=48 but never
      * prints the DECLARATIVES-FIRED line at all - a silently missing
      * side effect, not a wrong value. (Both sides also happen to agree
      * on an interesting, unplanned side observation: the very FIRST
      * WRITE in this probe, made without ever setting WS-RKEY - it
      * defaults to 0, an invalid RELATIVE record number - correctly
      * triggers `DECLARATIVES-FIRED STATUS=24` a boundary violation on
      * BOTH sides, confirming the handler-invocation wiring for
      * ordinary/pre-existing failure paths is unaffected; only the NEW
      * oo05/oo06 not-open/wrong-mode guard is missing it.) Root cause:
      * `generateWriteStatement`'s (and by the same shared wrapper
      * pattern, generateRewriteStatement's/generateDeleteStatement's)
      * outer guard (generator/expression-gen.js, round-39 finding 3) -
      * `if !isOpenVar || <wrong mode> then <status> else
      * <inner body>` - never calls `declarativeHandlerFor(fileName,
      * ...)` in its own `if` branch, unlike the ORIGINAL bodies
      * (preserved as `...Inner`) which already do for their own other
      * failure conditions. Suggested fix: add
      * `declarativeHandlerFor(fileName, <appropriate mode>)` invocation
      * to the guard's own `if` branch, mirroring how the inner bodies
      * already invoke it elsewhere.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP12USEERR.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "PP12FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY   PIC 9(3) VALUE 0.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       FILE-ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       FILE-ERR-PARA.
           DISPLAY "DECLARATIVES-FIRED STATUS=" WS-STATUS.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.
           DISPLAY "AFTER-CLOSE1 STATUS=" WS-STATUS.

           MOVE 2 TO REC-ID.
           MOVE "BBBBB" TO REC-VAL.
           WRITE SOME-REC.
           DISPLAY "WRITE-AFTER-CLOSE STATUS=" WS-STATUS.
           STOP RUN.
