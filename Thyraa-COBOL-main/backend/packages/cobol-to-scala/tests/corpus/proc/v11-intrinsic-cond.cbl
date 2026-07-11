       IDENTIFICATION DIVISION.
       PROGRAM-ID. V11-INTRINSIC-COND.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-A         PIC 9(4) VALUE 10.
       01 WS-B         PIC 9(4) VALUE 3.
       01 WS-C         PIC 9(4) VALUE 2.
       01 WS-RESULT    PIC 9(6) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           COMPUTE WS-RESULT =
              ((((WS-A + WS-B) * (WS-C + 1)) - ((WS-A - WS-C) * 2))
              + (((WS-B * WS-C) + 1) * 2)).
           DISPLAY "RESULT=" WS-RESULT.
           IF FUNCTION MOD(WS-A, WS-B) = 1
               DISPLAY "MOD-COND: TRUE"
           ELSE
               DISPLAY "MOD-COND: FALSE"
           END-IF.
           IF FUNCTION MAX(WS-A, WS-B, WS-C) >
              FUNCTION MIN(WS-A, WS-B, WS-C)
               DISPLAY "MAXMIN-COND: TRUE"
           ELSE
               DISPLAY "MAXMIN-COND: FALSE"
           END-IF.
           STOP RUN.
