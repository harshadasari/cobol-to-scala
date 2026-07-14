      * Adversarial (round 23): the "Known gaps" section (tests/oracle/
      * README.md, round-7 finding 1c) documents CALL of a data-name
      * (rather than a literal) as falling into the same "unresolvable
      * external subprogram" TODO-marker path as a genuinely external
      * CALL, explicitly noting "even if that name would happen to
      * match a sibling PROGRAM-ID at runtime" - but this exact
      * "coincidental match" scenario was never actually tried against
      * a real corpus program. This does exactly that: WS-PROG-NAME
      * holds the literal text "L05SUB", a PROGRAM-ID this SAME source
      * file defines, and `CALL WS-PROG-NAME USING WS-X` names it
      * dynamically. Real cobc resolves this at runtime and actually
      * calls L05SUB (dynamic CALL is ordinary, fully legal COBOL) -
      * the goal is to confirm the generator's own decline is
      * genuinely HONEST (a visible marker, still printing SOMETHING
      * distinguishable from a silently-wrong "looks like it worked"
      * result) rather than silently emitting wrong output with no
      * marker at all.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. L05MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-PROG-NAME PIC X(8) VALUE "L05SUB".
       01 WS-X PIC 9(3) VALUE 7.
       PROCEDURE DIVISION.
       MAIN-PARA.
           DISPLAY "BEFORE X=" WS-X.
           CALL WS-PROG-NAME USING WS-X.
           DISPLAY "AFTER  X=" WS-X.
           STOP RUN.
       END PROGRAM L05MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. L05SUB.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-X PIC 9(3).
       PROCEDURE DIVISION USING LS-X.
       MAIN-PARA.
           DISPLAY "IN L05SUB LS-X=" LS-X.
           COMPUTE LS-X = LS-X + 100.
           GOBACK.
       END PROGRAM L05SUB.
