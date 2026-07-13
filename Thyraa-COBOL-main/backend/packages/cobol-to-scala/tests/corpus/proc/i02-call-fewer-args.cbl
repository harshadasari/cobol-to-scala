       IDENTIFICATION DIVISION.
       PROGRAM-ID. I02FEWARGSMAIN.
      *
      * Adversarial (round 20): PROCEDURE DIVISION USING declares TWO
      * LINKAGE items (LK-A, LK-B), but the caller's CALL supplies only
      * ONE actual argument. Legal COBOL as long as the callee never
      * references the missing trailing parameter (confirmed against
      * installed GnuCOBOL: touching the missing LK-B segfaults with
      * "attempt to reference unallocated memory" - out-of-scope
      * undefined behavior - but never referencing it at all is a well-
      * defined, common idiom for an "optional trailing argument").
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC 9(3) VALUE 111.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-CALL".
           CALL "I02FEWARGSSUB" USING WS-A.
           DISPLAY "AFTER-CALL A=" WS-A.
           STOP RUN.
       END PROGRAM I02FEWARGSMAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. I02FEWARGSSUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-A PIC 9(3).
       01  LK-B PIC 9(3).
       PROCEDURE DIVISION USING LK-A LK-B.
       SUB-PARA.
           DISPLAY "SUB-SAW-A=" LK-A.
           ADD 1 TO LK-A.
           GOBACK.
       END PROGRAM I02FEWARGSSUB.
