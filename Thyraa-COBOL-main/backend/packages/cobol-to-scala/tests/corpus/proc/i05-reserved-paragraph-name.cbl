       IDENTIFICATION DIVISION.
       PROGRAM-ID. I05RESPARA.
      *
      * Adversarial (round 20): the ENTIRE PROCEDURE DIVISION consists
      * of exactly ONE paragraph, and that paragraph's name is "EXIT" -
      * a COBOL reserved word used elsewhere as the EXIT statement, but
      * legal as a user-defined paragraph-name here (confirmed against
      * installed GnuCOBOL: PERFORM EXIT. as a bare target is genuinely
      * ambiguous/rejected by cobc, but naming the sole, implicitly-
      * entered top-level paragraph EXIT compiles and runs fine).
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-X PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       EXIT.
           DISPLAY "IN-EXIT-PARA".
           ADD 5 TO WS-X.
           DISPLAY "X=" WS-X.
           STOP RUN.
