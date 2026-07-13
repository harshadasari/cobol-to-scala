      * Adversarial (round 21): MOVE CORRESPONDING between two groups
      * whose overlapping field names (AGE, NAME, SALARY) are declared
      * in a COMPLETELY DIFFERENT physical order in the source group
      * versus the target group (plus a non-corresponding field in each,
      * at a different position too). Real COBOL CORRESPONDING matches
      * strictly BY NAME, independent of declaration order - p13/r13/
      * y16 etc. all use source/target groups whose corresponding
      * fields happen to already share the same relative order; this
      * checks the generator's own field-pairing logic doesn't secretly
      * depend on positional alignment anywhere.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. J12CORRORDER.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SOURCE-GROUP.
           05  SRC-ONLY-FIELD  PIC X(5)  VALUE "SRCXX".
           05  SALARY          PIC 9(6)V99 VALUE 55000.50.
           05  NAME            PIC X(10) VALUE "ALICE".
           05  AGE             PIC 9(3)  VALUE 30.
       01  WS-TARGET-GROUP.
           05  AGE             PIC 9(3)  VALUE 0.
           05  NAME            PIC X(10) VALUE SPACES.
           05  TGT-ONLY-FIELD  PIC X(5)  VALUE "TGTZZ".
           05  SALARY          PIC 9(6)V99 VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE CORRESPONDING WS-SOURCE-GROUP TO WS-TARGET-GROUP.
           DISPLAY "NAME=" NAME OF WS-TARGET-GROUP.
           DISPLAY "AGE=" AGE OF WS-TARGET-GROUP.
           DISPLAY "SALARY=" SALARY OF WS-TARGET-GROUP.
           DISPLAY "TGT-ONLY=" TGT-ONLY-FIELD.
           STOP RUN.
