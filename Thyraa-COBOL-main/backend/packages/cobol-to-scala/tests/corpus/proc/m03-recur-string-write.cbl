      * Adversarial (round 24): every prior RECURSIVE-with-writeback corpus
      * program (j10, k01, k04, k12, l04, l10-l12) writes its own LINKAGE
      * parameter only via a plain MOVE/COMPUTE/SUBTRACT - never via STRING,
      * whose target write is built through a completely separate code path
      * (generateString's own `renderAssignment(statement.into, ...)` call,
      * inside a `{ ... }` block-scoped helper). Checks that a STRING
      * statement writing directly into a RECURSIVE program's own scalar
      * LINKAGE parameter correctly reaches the getter/setter closure
      * mechanism (round-23's `assignExpr`) rather than bypassing it, with
      * each recursion level's own tag value surviving unclobbered once
      * deeper activations unwind.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M03MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N   PIC 9(2) VALUE 3.
       01 WS-TAG PIC X(5) VALUE SPACES.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M03SUB" USING WS-N, WS-TAG.
           DISPLAY "MAIN TAG=[" WS-TAG "]".
           STOP RUN.
       END PROGRAM M03MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M03SUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N   PIC 9(2).
       01 LS-TAG PIC X(5).
       PROCEDURE DIVISION USING LS-N, LS-TAG.
       MAIN-PARA.
           STRING "LV" DELIMITED BY SIZE
                  LS-N DELIMITED BY SIZE
                  INTO LS-TAG.
           DISPLAY "ENTER N=" LS-N " TAG=[" LS-TAG "]".
           IF LS-N > 0
               SUBTRACT 1 FROM LS-N
               CALL "M03SUB" USING LS-N, LS-TAG
           END-IF.
           DISPLAY "EXIT  N=" LS-N " TAG=[" LS-TAG "]".
           GOBACK.
       END PROGRAM M03SUB.
