      * Adversarial (round 25): round-24 finding 4 (m08) fixed an FD
      * record's own no-VALUE field to default to LOW-VALUES (not spaces)
      * before its first successful OPEN+I/O - but m08's own SOME-REC is a
      * plain, single elementary field with no REDEFINES anywhere near it.
      * This checks the SAME "before first I/O" moment through a REDEFINES
      * alias over the FD record - does DISPLAYing the REDEFINES view
      * (SOME-REC-ALT) before the first OPEN also show low-values (correctly
      * sharing the same underlying storage `buildFieldRegistry` now
      * defaults to low-values), or does the REDEFINES accessor route
      * through some other, unfixed default?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O11FDREDEF.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "O11NOSUCHFILE"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       01  SOME-REC-ALT REDEFINES SOME-REC.
           05 ALT-A PIC X(4).
           05 ALT-B PIC X(6).
       WORKING-STORAGE SECTION.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       ERR-PARA.
           DISPLAY "ERROR-HANDLER-FIRED STATUS=" WS-STATUS.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "BEFORE-OPEN REC=[" SOME-REC "]".
           DISPLAY "BEFORE-OPEN ALT-A=[" ALT-A "] ALT-B=[" ALT-B "]".
           OPEN INPUT SOME-FILE.
           DISPLAY "AFTER-OPEN REC=[" SOME-REC "]".
           STOP RUN.
