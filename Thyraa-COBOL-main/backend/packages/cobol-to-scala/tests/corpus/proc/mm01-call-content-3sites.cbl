      * mm01 (round 37): pressure-test on round-36 finding 1 (ll01)'s
      * call-site-id fix, generalized from TWO to THREE textually distinct
      * CALL statements to the SAME RECURSIVE program, all in the SAME
      * paragraph, all passing BY CONTENT as their first argument -
      * hypothesis: nextCallSiteId()/CALL_SITE_SEQ correctly counts past 2,
      * giving _call0_0Snapshot0/_call1_0Snapshot0/_call2_0Snapshot0 with
      * no collision (ll01 only proved the 2-site case).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM01MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC 9(3) VALUE 10.
       01  WS-B PIC 9(3) VALUE 20.
       01  WS-C PIC 9(3) VALUE 30.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE A=" WS-A " B=" WS-B " C=" WS-C.
           CALL "MM01SUB" USING BY CONTENT WS-A.
           CALL "MM01SUB" USING BY CONTENT WS-B.
           CALL "MM01SUB" USING BY CONTENT WS-C.
           DISPLAY "AFTER A=" WS-A " B=" WS-B " C=" WS-C.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM01SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(3).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-MAIN.
           ADD 100 TO LK-VAL.
           DISPLAY "IN SUB VAL=" LK-VAL.
       END PROGRAM MM01SUB.

       END PROGRAM MM01MAIN.
