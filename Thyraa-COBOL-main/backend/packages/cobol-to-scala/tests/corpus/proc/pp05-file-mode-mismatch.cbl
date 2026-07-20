      * pp05 (round 40): round-38 finding 3 (nn07) added an isOpenVar guard
      * to generateReadStatement (expression-gen.js) so READ-after-CLOSE
      * reports FILE STATUS "47" instead of crashing - but that guard only
      * checks "is the file open at all", never "is it open in a mode that
      * permits READ" (round-39 finding 3/oo05-oo06 added exactly that
      * mode-aware guard to WRITE/REWRITE/DELETE, but READ/START were never
      * revisited the same way). This probe issues a READ while the file is
      * open in OUTPUT-only mode - the file IS open (isOpenVar true) but no
      * reader/iterator handle would ever have been built for an
      * OUTPUT-mode OPEN, so this may reach a null-handle runtime crash
      * instead of cobc's own non-crashing FILE STATUS "47".
      *
      * OUTCOME (DISHONEST - real, but not a crash as guessed): cobc:
      * `READ-WHILE-OUTPUT STATUS=47`. Engine: `STATUS=10` (silently
      * wrong FILE STATUS - reports "end of file" instead of "wrong open
      * mode"; no crash, since the READ body's own AAT-END branch degrades
      * gracefully when its iterator is absent/empty rather than NPEing).
      * Root cause: `generateReadStatement` (generator/expression-gen.js,
      * ~line 7644) only checks `isOpenVar` (true here - the file IS
      * open, just in the wrong mode), never `openModeVar` - unlike
      * `generateWriteStatement`/`generateRewriteStatement`/
      * `generateDeleteStatement` (round-39 finding 3), which all check
      * BOTH `isOpenVar` and the mode. Suggested fix: extend
      * generateReadStatement's existing `if !isOpenVar then ...` guard
      * to also check `openModeVar != "INPUT" && openModeVar != "I-O"`,
      * reporting "47" for either condition, mirroring oo05/oo06's own
      * mode-check convention.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP05MODE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "PP05FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS DYNAMIC
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  REL-FILE.
       01  REL-REC.
           05  REL-DATA PIC X(8).
       WORKING-STORAGE SECTION.
       01  WS-RKEY PIC 9(2) VALUE 0.
       01  WS-STATUS PIC XX VALUE "00".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT REL-FILE.
           DISPLAY "OPEN-OUTPUT STATUS=" WS-STATUS.
           MOVE 1 TO WS-RKEY.
           READ REL-FILE.
           DISPLAY "READ-WHILE-OUTPUT STATUS=" WS-STATUS.
           MOVE "SOMEDATA" TO REL-DATA.
           WRITE REL-REC.
           DISPLAY "WRITE-STILL-WORKS STATUS=" WS-STATUS.
           CLOSE REL-FILE.
           STOP RUN.
