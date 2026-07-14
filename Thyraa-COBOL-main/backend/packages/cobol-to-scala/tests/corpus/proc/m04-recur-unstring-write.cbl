      * Adversarial (round 24): the UNSTRING counterpart to m03 - checks
      * UNSTRING writing into TWO separate RECURSIVE-program LINKAGE
      * parameters in the SAME statement, verifying RECURSIVE_LEAF_NAMES
      * (round-23) is populated for every one of a RECURSIVE program's own
      * LINKAGE leaves at once, not just the first, and that
      * generateUnstring's own per-target renderAssignment calls (inside its
      * one-field-at-a-time loop) correctly route each of the two writes
      * through the getter/setter closure mechanism.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M04MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 2.
       01 WS-A PIC X(3) VALUE SPACES.
       01 WS-B PIC X(3) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M04SUB" USING WS-N, WS-A, WS-B.
           DISPLAY "MAIN A=[" WS-A "] B=[" WS-B "]".
           STOP RUN.
       END PROGRAM M04MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M04SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-SRC PIC X(7) VALUE "AAA,BBB".
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       01 LS-A PIC X(3).
       01 LS-B PIC X(3).
       PROCEDURE DIVISION USING LS-N, LS-A, LS-B.
       MAIN-PARA.
           UNSTRING WS-SRC DELIMITED BY ","
               INTO LS-A, LS-B.
           DISPLAY "ENTER N=" LS-N " A=[" LS-A "] B=[" LS-B "]".
           IF LS-N > 0
               SUBTRACT 1 FROM LS-N
               CALL "M04SUB" USING LS-N, LS-A, LS-B
           END-IF.
           DISPLAY "EXIT  N=" LS-N " A=[" LS-A "] B=[" LS-B "]".
           GOBACK.
       END PROGRAM M04SUB.
