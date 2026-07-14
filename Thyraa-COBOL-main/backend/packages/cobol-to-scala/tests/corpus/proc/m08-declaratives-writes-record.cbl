      * Adversarial (round 24): every prior DECLARATIVES corpus program
      * (x01, k05, l07, etc.) only ever READS from the FD record area (or
      * doesn't touch it at all) inside the handler - none of them WRITE
      * into the FD record's own field from within DECLARATIVES. This
      * checks a USE AFTER STANDARD ERROR PROCEDURE handler that MOVEs a
      * literal directly into the FD's own record buffer (SOME-REC) after a
      * failed OPEN, then verifies that write is visible in MAIN-SECTION
      * once control returns to the statement after the failing OPEN (the
      * "nobody writes here yet" pattern applied to a DECLARATIVES-adjacent
      * field instead of a recursive LINKAGE parameter).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M08DECLWRITE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "M08NOSUCHFILE"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-STATUS PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       ERR-PARA.
           DISPLAY "ERROR-HANDLER-FIRED STATUS=" WS-STATUS.
           MOVE "HANDLERSET" TO SOME-REC.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "BEFORE-OPEN REC=[" SOME-REC "]".
           OPEN INPUT SOME-FILE.
           DISPLAY "AFTER-OPEN REC=[" SOME-REC "]".
           STOP RUN.
