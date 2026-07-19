      * mm14 (round 37): combines round-36 finding 1's call-site-id fix
      * (ll01, PLAIN-scalar BY CONTENT operand) with round-35 finding 2's
      * own NAMED-GROUP BY CONTENT branch (ll03) - a shape neither ll01
      * nor ll03 individually covered: TWO textually distinct CALL
      * statements in the SAME paragraph, both passing a whole GROUP BY
      * CONTENT to the SAME RECURSIVE program (not just one static call
      * site that recurses, ll03's own shape) - does the per-LEAF snapshot
      * naming inside the "named group" branch also get a unique
      * call-site id per CALL statement, or does the group-leaf branch's
      * own naming collide the same way the plain-scalar branch did before
      * round 36's fix?
       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM14MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-GRP1.
           05  WS-A1 PIC 9(3) VALUE 1.
           05  WS-B1 PIC 9(3) VALUE 2.
       01  WS-GRP2.
           05  WS-A2 PIC 9(3) VALUE 100.
           05  WS-B2 PIC 9(3) VALUE 200.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE1 A=" WS-A1 " B=" WS-B1.
           CALL "MM14SUB" USING BY CONTENT WS-GRP1.
           DISPLAY "AFTER1  A=" WS-A1 " B=" WS-B1.
           DISPLAY "BEFORE2 A=" WS-A2 " B=" WS-B2.
           CALL "MM14SUB" USING BY CONTENT WS-GRP2.
           DISPLAY "AFTER2  A=" WS-A2 " B=" WS-B2.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. MM14SUB IS RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       LINKAGE SECTION.
       01  LK-GRP.
           05  LK-A PIC 9(3).
           05  LK-B PIC 9(3).
       PROCEDURE DIVISION USING LK-GRP.
       SUB-MAIN.
           ADD 10 TO LK-A.
           ADD 20 TO LK-B.
           DISPLAY "SUB A=" LK-A " B=" LK-B.
       END PROGRAM MM14SUB.

       END PROGRAM MM14MAIN.
