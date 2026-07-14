      * Adversarial (round 26): generateRewriteStatement's own doc comment
      * admits "REWRITE without a preceding successful READ in that mode
      * (illegal COBOL - real cobc reports FILE STATUS 44) is a harmless
      * no-op here rather than an ArrayIndexOutOfBounds crash" - i.e. it
      * deliberately does NOT set WS-STATUS to the correct error code in
      * this case, leaving it at whatever it was before. This checks that
      * exact scenario directly: OPEN I-O with no READ at all, straight to
      * REWRITE, and displays WS-STATUS - a silent divergence if it doesn't
      * match cobc's real code (and confirms no record gets corrupted as a
      * side effect either way).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB02NOREAD.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB02FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
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
       01 WS-STATUS PIC XX VALUE "??".
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID.
           MOVE "AAAAA" TO REC-VAL.
           WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN I-O SOME-FILE.
           DISPLAY "BEFORE-REWRITE STATUS=" WS-STATUS.
           MOVE 9 TO REC-ID.
           MOVE "ZZZZZ" TO REC-VAL.
           REWRITE SOME-REC.
           DISPLAY "AFTER-REWRITE STATUS=" WS-STATUS.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           READ SOME-FILE.
           DISPLAY "REREAD ID=" REC-ID " VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.
