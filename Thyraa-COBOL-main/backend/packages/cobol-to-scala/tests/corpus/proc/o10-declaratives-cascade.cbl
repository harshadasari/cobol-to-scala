      * Adversarial (round 25): every prior DECLARATIVES corpus program
      * (x01/x02/l07/m08/etc.) has exactly ONE file whose OPEN/READ can
      * fail, handled by exactly one declaratives SECTION. This checks a
      * DECLARATIVES handler for SOME-FILE that itself OPENs a SECOND file,
      * OTHER-FILE, which ALSO doesn't exist and ALSO has its own
      * registered USE AFTER STANDARD ERROR PROCEDURE handler - a cascading/
      * nested DECLARATIVES trigger (the first handler's own body causes a
      * second, independent handler to fire before the first handler
      * itself finishes). Checks control correctly returns first to the
      * inner handler's own remaining statements, then back to the outer
      * handler's remaining statements, then finally back to MAIN-SECTION
      * right after the original failing OPEN - not a skipped step or an
      * infinite loop.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. O10CASCADE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "O10NOSUCH1"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS1.
           SELECT OTHER-FILE ASSIGN TO "O10NOSUCH2"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS2.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       FD  OTHER-FILE.
       01  OTHER-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-STATUS1 PIC XX.
       01 WS-STATUS2 PIC XX.
       PROCEDURE DIVISION.
       DECLARATIVES.
       ERR1-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       ERR1-PARA.
           DISPLAY "ERR1-START STATUS=" WS-STATUS1.
           OPEN INPUT OTHER-FILE.
           DISPLAY "ERR1-END STATUS=" WS-STATUS1.
       ERR2-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON OTHER-FILE.
       ERR2-PARA.
           DISPLAY "ERR2-FIRED STATUS=" WS-STATUS2.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "BEFORE-OPEN".
           OPEN INPUT SOME-FILE.
           DISPLAY "AFTER-OPEN".
           STOP RUN.
