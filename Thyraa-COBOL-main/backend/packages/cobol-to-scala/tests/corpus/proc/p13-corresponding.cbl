       IDENTIFICATION DIVISION.
       PROGRAM-ID. P13CORR.
      *
      * Phase 2 corpus target: MOVE CORRESPONDING between two group
      * items whose subordinate names partially overlap. Only the
      * matching names (NAME, AGE, SALARY) move; the source-only and
      * target-only fields are left untouched.
      *
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-SOURCE-GROUP.
           05  NAME            PIC X(10) VALUE 'ALICE'.
           05  AGE             PIC 9(3)  VALUE 30.
           05  SALARY          PIC 9(6)V99 VALUE 55000.50.
           05  SRC-ONLY-FIELD  PIC X(5)  VALUE 'SRCXX'.
       01  WS-TARGET-GROUP.
           05  NAME            PIC X(10) VALUE SPACES.
           05  AGE             PIC 9(3)  VALUE 0.
           05  SALARY          PIC 9(6)V99 VALUE 0.
           05  TGT-ONLY-FIELD  PIC X(5)  VALUE 'TGTZZ'.
       PROCEDURE DIVISION.
       0000-MAIN.
           DISPLAY 'BEFORE-NAME=' NAME OF WS-TARGET-GROUP
           DISPLAY 'BEFORE-AGE=' AGE OF WS-TARGET-GROUP
           DISPLAY 'BEFORE-SALARY=' SALARY OF WS-TARGET-GROUP
           DISPLAY 'BEFORE-TGT-ONLY=' TGT-ONLY-FIELD
      *
           MOVE CORRESPONDING WS-SOURCE-GROUP TO WS-TARGET-GROUP
      *
           DISPLAY 'AFTER-NAME=' NAME OF WS-TARGET-GROUP
           DISPLAY 'AFTER-AGE=' AGE OF WS-TARGET-GROUP
           DISPLAY 'AFTER-SALARY=' SALARY OF WS-TARGET-GROUP
           DISPLAY 'AFTER-TGT-ONLY=' TGT-ONLY-FIELD
           STOP RUN.
