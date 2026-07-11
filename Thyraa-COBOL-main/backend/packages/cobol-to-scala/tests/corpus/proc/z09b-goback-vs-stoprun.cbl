      * Round-12 probe z09b: isolation of z09's GOBACK-vs-STOP-RUN half only
      * (no OMITTED/fewer-args - those hit a separate, already-confirmed
      * CALL-arity bug that would otherwise mask this narrower question).
      * GOBACK inside a called subprogram returns control to the CALLER (the
      * statement right after the CALL keeps running); STOP RUN inside a
      * called subprogram terminates the WHOLE run unit outright - the
      * statement after that CALL must never run.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09BCALL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-GOBACK-CALL".
           CALL "Z09BGOBACK".
           DISPLAY "AFTER-GOBACK-CALL - THIS MUST PRINT".

           DISPLAY "BEFORE-STOPRUN-CALL".
           CALL "Z09BSTOPRUN".
           DISPLAY "AFTER-STOPRUN-CALL - THIS MUST NEVER PRINT".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09BGOBACK.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       Z09BGOBACK-PARA.
           DISPLAY "INSIDE-Z09BGOBACK".
           GOBACK.
       END PROGRAM Z09BGOBACK.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09BSTOPRUN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       Z09BSTOPRUN-PARA.
           DISPLAY "INSIDE-Z09BSTOPRUN".
           STOP RUN.
       END PROGRAM Z09BSTOPRUN.
       END PROGRAM Z09BCALL.
