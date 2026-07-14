      * Adversarial (round 23): every prior DECLARATIVES corpus program
      * (x01, k05, i07, etc.) keeps the declarative handler's own body
      * a flat sequence of DISPLAYs - none of them PERFORM a paragraph
      * that lives OUTSIDE the DECLARATIVES...END DECLARATIVES range
      * (i07 uses a GO TO to escape a THRU range, a one-way jump, not a
      * call/return PERFORM). This checks a true out-of-line PERFORM
      * (call/return semantics) issued FROM inside a DECLARATIVES
      * handler INTO an ordinary paragraph (HELPER-PARA) physically
      * declared after MAIN-SECTION, outside the DECLARATIVES block -
      * legal COBOL (a DECLARATIVES section's own procedure is still
      * just an ordinary section/paragraph as far as PERFORM's own
      * scoping rules are concerned) - and confirms control correctly
      * returns to the statement right after the PERFORM, back inside
      * the handler, once HELPER-PARA finishes.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L07DECLPERF.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "L07NOSUCHFILE"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-STATUS PIC XX.
       01 WS-COUNT PIC 9 VALUE 0.
       PROCEDURE DIVISION.
       DECLARATIVES.
       ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       ERR-PARA.
           DISPLAY "ERROR-HANDLER-FIRED STATUS=" WS-STATUS.
           PERFORM HELPER-PARA.
           DISPLAY "ERROR-HANDLER-DONE COUNT=" WS-COUNT.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           OPEN INPUT SOME-FILE.
           DISPLAY "AFTER-OPEN COUNT=" WS-COUNT.
           STOP RUN.
       HELPER-PARA.
           ADD 1 TO WS-COUNT.
           DISPLAY "HELPER-PARA-RAN COUNT=" WS-COUNT.
