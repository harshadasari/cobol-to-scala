      * ll01 (round 36): pressure-test on round 35 finding 2's own fix
      * (generateCall's `target.recursive` branch, expression-gen.js) - the
      * new BY CONTENT snapshot var is named `_call<i>Snapshot<j>` where `i`
      * is simply the USING-position INDEX WITHIN THAT CALL NODE, not any
      * call-site-unique counter. TWO SEPARATE CALL statements to the SAME
      * RECURSIVE program, textually one after another in the SAME
      * paragraph, each passing BY CONTENT as their first (index 0) USING
      * argument, would both try to declare `var _call0Snapshot0` in the
      * SAME generated Scala method body (MAIN-PARA's own function) -
      * hypothesis: a Scala COMPILE error ("_call0Snapshot0 is already
      * defined").
       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL01MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-A PIC 9(3) VALUE 10.
       01  WS-B PIC 9(3) VALUE 20.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE A=" WS-A " B=" WS-B.
           CALL "LL01SUB" USING BY CONTENT WS-A.
           CALL "LL01SUB" USING BY CONTENT WS-B.
           DISPLAY "AFTER A=" WS-A " B=" WS-B.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. LL01SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-VAL PIC 9(3).
       PROCEDURE DIVISION USING LK-VAL.
       SUB-MAIN.
           ADD 100 TO LK-VAL.
           DISPLAY "IN SUB VAL=" LK-VAL.
       END PROGRAM LL01SUB.

       END PROGRAM LL01MAIN.
