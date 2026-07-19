      * ll14 (round 36): companion/boundary-check for ll01's finding - a
      * SINGLE CALL statement (one lexical call site) to a RECURSIVE
      * program, passing BY CONTENT, invoked REPEATEDLY from inside a
      * PERFORM VARYING loop (three iterations). Since there is only ONE
      * `_call0Snapshot0` declaration textually in the generated Scala
      * (the loop body re-executes the SAME source line three times at
      * runtime, it does not generate three separate `var` declarations),
      * this should NOT hit the "_call0Snapshot0 is already defined"
      * duplicate-declaration bug ll01 found for TWO TEXTUALLY DISTINCT
      * call sites in the same paragraph - confirms the bug is specific to
      * source-level call-site duplication, not to the CALL running more
      * than once.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL14MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-VAL  PIC 9(3) VALUE 10.
       01  WS-LOOP PIC 9(1).
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM VARYING WS-LOOP FROM 1 BY 1 UNTIL WS-LOOP > 3
               CALL "LL14SUB" USING BY CONTENT WS-VAL
           END-PERFORM.
           DISPLAY "MAIN AFTER VAL=" WS-VAL.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL14SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(3).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-MAIN.
           ADD 100 TO LK-VAL.
           DISPLAY "SUB VAL=" LK-VAL.
       END PROGRAM LL14SUB.

       END PROGRAM LL14MAIN.
