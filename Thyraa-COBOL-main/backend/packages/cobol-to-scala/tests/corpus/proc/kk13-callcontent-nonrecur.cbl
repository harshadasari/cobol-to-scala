      * kk13 (round 35): isolation/control companion to kk07 (this same
      * round) - the IDENTICAL mixed BY CONTENT / BY REFERENCE argument
      * shape, but calling a PLAIN (non-RECURSIVE) subprogram instead, with
      * no recursive self-CALL at all. Confirms kk07's StackOverflowError/
      * silently-discarded-write bug is specific to
      * `generateRecursiveEntryMethod`'s own per-call-activation get/set
      * closure convention (scala-generator.js, round-21/22), NOT to BY
      * CONTENT/BY REFERENCE mixing in a CALL statement in general - a
      * non-recursive callee uses the ordinary shared-module-var convention
      * (`generateEntryMethod`) instead, where this passes correctly: LK-REF
      * (BY REFERENCE) writes back to WS-REF-ARG (100 -> 150), LK-CONTENT
      * (BY CONTENT) does NOT (WS-CONTENT-ARG stays 100).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK13MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-CONTENT-ARG   PIC 9(3) VALUE 100.
       01  WS-REF-ARG       PIC 9(3) VALUE 100.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE CONTENT=" WS-CONTENT-ARG " REF=" WS-REF-ARG.
           CALL "KK13SUB" USING BY CONTENT WS-CONTENT-ARG
                                BY REFERENCE WS-REF-ARG.
           DISPLAY "AFTER  CONTENT=" WS-CONTENT-ARG " REF=" WS-REF-ARG.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. KK13SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01  LK-CONTENT PIC 9(3).
       01  LK-REF     PIC 9(3).
       PROCEDURE DIVISION USING LK-CONTENT LK-REF.
       SUB-MAIN.
           ADD 50 TO LK-CONTENT.
           ADD 50 TO LK-REF.
           DISPLAY "IN-SUB CONTENT=" LK-CONTENT " REF=" LK-REF.
       END PROGRAM KK13SUB.

       END PROGRAM KK13MAIN.
