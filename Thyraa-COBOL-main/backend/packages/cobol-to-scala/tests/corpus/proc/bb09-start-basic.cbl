      * Adversarial (round 26): START (generateStartStatement,
      * expression-gen.js) is STILL a bare `// START ... - position file
      * for reading` comment with zero runtime effect and no FILE STATUS
      * update at all - the same "documented as stubbed" shape REWRITE/
      * DELETE were in before round 25 fixed them, but START itself was
      * never revisited. This checks the most basic possible use: 5
      * records on a RELATIVE file, START key >= 3, then READ NEXT three
      * times - real cobc should skip straight to record 3, but since
      * START is a no-op here, a subsequent READ NEXT would incorrectly
      * continue from wherever the file's sequential position already was
      * (the very beginning, since no READ preceded the START).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB09START.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB09FILE.DAT"
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
       MAIN-PARA.
           OPEN OUTPUT SOME-FILE.
           MOVE 1 TO REC-ID. MOVE "AAAAA" TO REC-VAL. WRITE SOME-REC.
           MOVE 2 TO REC-ID. MOVE "BBBBB" TO REC-VAL. WRITE SOME-REC.
           MOVE 3 TO REC-ID. MOVE "CCCCC" TO REC-VAL. WRITE SOME-REC.
           MOVE 4 TO REC-ID. MOVE "DDDDD" TO REC-VAL. WRITE SOME-REC.
           MOVE 5 TO REC-ID. MOVE "EEEEE" TO REC-VAL. WRITE SOME-REC.
           CLOSE SOME-FILE.

           OPEN INPUT SOME-FILE.
           MOVE 3 TO WS-RKEY.
           START SOME-FILE KEY IS GREATER THAN OR EQUAL WS-RKEY
               INVALID KEY DISPLAY "START-FAILED"
           END-START.
           DISPLAY "AFTER-START STATUS=" WS-STATUS.
           READ SOME-FILE NEXT RECORD.
           DISPLAY "NEXT1 ID=" REC-ID " VAL=" REC-VAL.
           READ SOME-FILE NEXT RECORD.
           DISPLAY "NEXT2 ID=" REC-ID " VAL=" REC-VAL.
           READ SOME-FILE NEXT RECORD.
           DISPLAY "NEXT3 ID=" REC-ID " VAL=" REC-VAL.
           CLOSE SOME-FILE.
           STOP RUN.
