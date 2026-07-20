      * oo02 (round 39): further pressure-test on round-38 finding 1's
      * numeric-over-group REDEFINES accessor - use WS-NUM (REDEFINES a
      * GROUP) as a CALL argument, both BY REFERENCE (the subprogram
      * mutates it, caller must see LINKAGE writeback through the
      * synthetic accessor) and BY CONTENT (caller must NOT see any
      * mutation).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO02CALLARG.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GROUP.
           05  WS-A PIC 99 VALUE 12.
           05  WS-B PIC 99 VALUE 34.
       01  WS-NUM REDEFINES WS-GROUP PIC 9(4).
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE=" WS-NUM.
           CALL "OO02SUB" USING BY CONTENT WS-NUM.
           DISPLAY "AFTER-CONTENT=" WS-NUM.
           CALL "OO02SUB" USING BY REFERENCE WS-NUM.
           DISPLAY "AFTER-REF=" WS-NUM.
           STOP RUN.
       END PROGRAM OO02CALLARG.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. OO02SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-NUM PIC 9(4).
       PROCEDURE DIVISION USING LK-NUM.
           DISPLAY "IN SUB BEFORE=" LK-NUM.
           ADD 1000 TO LK-NUM.
           DISPLAY "IN SUB AFTER=" LK-NUM.
           GOBACK.
       END PROGRAM OO02SUB.
