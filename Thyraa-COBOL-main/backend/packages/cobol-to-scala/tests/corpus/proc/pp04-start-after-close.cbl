      * pp04 (round 40): round-38 finding 3 (nn07) and round-39 finding 3
      * (oo05/oo06) added isOpenVar/openModeVar lifecycle checks to
      * OPEN/CLOSE/READ/WRITE/REWRITE/DELETE, but never to START
      * (generateStartStatement, generator/expression-gen.js) - this probe
      * checks whether a START issued after CLOSE reports the same "47"
      * (not open) real cobc gives for READ-after-CLOSE, or whether it falls
      * through to the buffer-based INVALID KEY ("23") logic instead, since
      * generateStartStatement's own only guard is `bufVar != null`
      * (which IS nulled by CLOSE, so this may coincidentally produce "23"
      * rather than the crash-not-checked "00" a naive reading might guess).
      *
      * OUTCOME (DISHONEST): confirmed exactly as hypothesized. cobc:
      * `START-AFTER-CLOSE STATUS=47`. Engine: fires the INVALID KEY
      * branch and reports `STATUS=23` instead (silently wrong FILE
      * STATUS code AND the wrong clause dispatched - INVALID KEY instead
      * of no clause at all). Root cause: `generateStartStatement`
      * (generator/expression-gen.js, ~line 8925) never consults
      * `isOpenVar` at all - its only guard is `${bufVar} != null`, which
      * CLOSE happens to null out, so a post-CLOSE START silently
      * degrades into the ordinary "buffer empty" INVALID KEY path
      * instead of the file-not-open path. Suggested fix: mirror the
      * nn07/oo05-oo06 convention - wrap the whole function body in
      * `if !isOpenVar then <47> else <original body>`, the same "check
      * state before touching any handle" guard READ/WRITE/REWRITE/
      * DELETE already got.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PP04START.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT REL-FILE ASSIGN TO "PP04FILE.DAT"
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
           MOVE 1 TO WS-RKEY.
           MOVE "FIRSTREC" TO REL-DATA.
           WRITE REL-REC.
           MOVE 2 TO WS-RKEY.
           MOVE "SECNDREC" TO REL-DATA.
           WRITE REL-REC.
           CLOSE REL-FILE.

           OPEN I-O REL-FILE.
           DISPLAY "OPEN1 STATUS=" WS-STATUS.
           CLOSE REL-FILE.
           DISPLAY "CLOSE1 STATUS=" WS-STATUS.

           MOVE 1 TO WS-RKEY.
           START REL-FILE KEY IS EQUAL TO WS-RKEY
               INVALID KEY DISPLAY "START-AFTER-CLOSE INVALID"
               NOT INVALID KEY DISPLAY "START-AFTER-CLOSE OK"
           END-START.
           DISPLAY "START-AFTER-CLOSE STATUS=" WS-STATUS.
           STOP RUN.
