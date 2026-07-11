      * Round-12 probe z11: SET condition-name TO FALSE, where the 88-level
      * declares its own "WHEN SET TO FALSE IS <value>" clause (verify cobc
      * accepts this syntax first). Round-1's finding 2 fixed SET
      * condition-name TO TRUE (assign the parent field its first declared
      * VALUE); this attacks whether the mirror-image FALSE case got the
      * same treatment, or still falls through to the pre-fix
      * "assign a nonexistent condition-name var" behavior.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z11SET88F.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-STATUS  PIC X(1) VALUE "P".
           88  WS-APPROVED  VALUE "A" WHEN SET TO FALSE IS "P".
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "INITIAL=" WS-STATUS.
           SET WS-APPROVED TO TRUE.
           DISPLAY "AFTER-TRUE=" WS-STATUS.
           SET WS-APPROVED TO FALSE.
           DISPLAY "AFTER-FALSE=" WS-STATUS.
           STOP RUN.
