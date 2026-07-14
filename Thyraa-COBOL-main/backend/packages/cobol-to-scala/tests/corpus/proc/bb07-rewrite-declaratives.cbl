      * Adversarial (round 26): DECLARATIVES handler invocation (round-10
      * finding 1/2, documented in the README's Known Gaps as "wired only
      * from OPEN's failure path and a bare READ's end-of-file path") is
      * checked here against a REWRITE-triggered error specifically - a
      * REWRITE issued with no prior READ (real cobc: FILE STATUS 44, and
      * a registered USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE
      * handler fires, since REWRITE has no INVALID KEY clause of its own
      * here to take precedence). Checks whether the DECLARATIVES handler
      * actually runs in the generated Scala too, or is silently skipped.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB07RWDECL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB07FILE.DAT"
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

           OPEN I-O SOME-FILE.
           MOVE 9 TO REC-ID.
           MOVE "ZZZZZ" TO REC-VAL.
           REWRITE SOME-REC.
           DISPLAY "AFTER-REWRITE STATUS=" WS-STATUS.
           CLOSE SOME-FILE.
           STOP RUN.
