       IDENTIFICATION DIVISION.
       PROGRAM-ID. I11EVALFUNC.
      *
      * Adversarial (round 20): EVALUATE whose SUBJECT is itself a
      * FUNCTION call (FUNCTION UPPER-CASE(...)), not a bare identifier
      * or literal - never exercised in the prior 19 rounds.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CODE PIC X(5) VALUE "abc".
       PROCEDURE DIVISION.
       MAIN-PARA.
           EVALUATE FUNCTION UPPER-CASE(WS-CODE)
               WHEN "ABC  " DISPLAY "MATCHED-ABC"
               WHEN OTHER DISPLAY "NO-MATCH"
           END-EVALUATE.
           MOVE "xyz  " TO WS-CODE.
           EVALUATE FUNCTION UPPER-CASE(WS-CODE)
               WHEN "ABC  " DISPLAY "MATCHED-ABC-2"
               WHEN "XYZ  " DISPLAY "MATCHED-XYZ-2"
               WHEN OTHER DISPLAY "NO-MATCH-2"
           END-EVALUATE.
           STOP RUN.
