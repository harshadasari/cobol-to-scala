      * Round-12 probe z09: (a) CALL ... USING with an explicit OMITTED
      * parameter position; (b) CALL ... USING with FEWER arguments than the
      * callee's own LINKAGE SECTION/PROCEDURE DIVISION USING declares (both
      * confirmed legal COBOL - compiles/runs clean under installed
      * GnuCOBOL, standalone-probed before writing this file); (c) GOBACK
      * inside a called subprogram returns control to the CALLER (the
      * statement right after the CALL keeps running), vs STOP RUN inside a
      * called subprogram, which terminates the WHOLE run unit outright -
      * the statement after that CALL must NEVER run.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09CALL.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A PIC 9(4) VALUE 10.
       01 WS-C PIC 9(4) VALUE 0.
       01 WS-D PIC 9(4) VALUE 20.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE-OMIT A=" WS-A " C=" WS-C.
           CALL "Z09OMIT" USING WS-A, OMITTED, WS-C.
           DISPLAY "AFTER-OMIT  A=" WS-A " C=" WS-C.

           DISPLAY "BEFORE-FEWER D=" WS-D.
           CALL "Z09FEWER" USING WS-D.
           DISPLAY "AFTER-FEWER  D=" WS-D.

           DISPLAY "BEFORE-GOBACK-CALL".
           CALL "Z09GOBACK".
           DISPLAY "AFTER-GOBACK-CALL - THIS MUST PRINT".

           DISPLAY "BEFORE-STOPRUN-CALL".
           CALL "Z09STOPRUN".
           DISPLAY "AFTER-STOPRUN-CALL - THIS MUST NEVER PRINT".
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09OMIT.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-A PIC 9(4).
       01 LK-B PIC 9(4).
       01 LK-C PIC 9(4).
       PROCEDURE DIVISION USING LK-A, LK-B, LK-C.
       Z09OMIT-PARA.
           ADD 1 TO LK-A.
           MOVE LK-A TO LK-C.
           GOBACK.
       END PROGRAM Z09OMIT.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09FEWER.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01 LK-D PIC 9(4).
       01 LK-E PIC 9(4).
       PROCEDURE DIVISION USING LK-D, LK-E.
       Z09FEWER-PARA.
           ADD 5 TO LK-D.
           GOBACK.
       END PROGRAM Z09FEWER.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09GOBACK.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       Z09GOBACK-PARA.
           DISPLAY "INSIDE-Z09GOBACK".
           GOBACK.
       END PROGRAM Z09GOBACK.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. Z09STOPRUN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       PROCEDURE DIVISION.
       Z09STOPRUN-PARA.
           DISPLAY "INSIDE-Z09STOPRUN".
           STOP RUN.
       END PROGRAM Z09STOPRUN.
       END PROGRAM Z09CALL.
