      * ff06: STOP RUN issued from several levels deep inside a
      * RECURSIVE program's own nested-local-def call chain - STOP RUN
      * must terminate the ENTIRE process immediately, unwinding every
      * pending nested def/call frame at once (never returning control
      * to any pending caller, unlike GOBACK, which only returns one
      * level). Checks the nested-def convention's own exception/return
      * machinery (round-29's boundary/try-catch additions for EXIT
      * SECTION/PARAGRAPH) doesn't accidentally intercept or otherwise
      * interfere with a deep STOP RUN, and that no pending "EXIT
      * DEPTH=" trailer line from any shallower frame is printed after
      * the process should already have terminated.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF06MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "FF06SUB" USING WS-START-DEPTH.
           DISPLAY "SHOULD-NOT-PRINT".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF06SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       SECTION-A SECTION.
       PARA-A1.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
       PARA-A2.
           IF LS-DEPTH < 3
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "FF06SUB" USING WS-NEXT-DEPTH
           ELSE
               DISPLAY "STOPPING AT DEPTH=" LS-DEPTH
               STOP RUN
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM FF06SUB.
       END PROGRAM FF06MAIN.
