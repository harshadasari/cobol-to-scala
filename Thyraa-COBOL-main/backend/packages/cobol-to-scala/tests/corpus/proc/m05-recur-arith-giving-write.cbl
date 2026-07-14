      * Adversarial (round 24): checks ADD/SUBTRACT ... GIVING writing
      * straight back into the SAME identifier used as an operand
      * (`SUBTRACT 1 FROM LS-N GIVING LS-N`, `ADD 1 LS-M GIVING LS-M`) when
      * that identifier is a RECURSIVE program's own scalar LINKAGE
      * parameter - a different codegen shape than l12's plain SUBTRACT (no
      * GIVING): generateAdd/generateSubtract's own GIVING branch builds a
      * `{ target, resultBD, finalExpr }` entry list and writes each via
      * `renderAssignment(e.target, e.finalExpr)`, exercising that helper's
      * multi-target-GIVING path specifically, not just its single-target
      * TO/FROM path l12 already covers.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. M05MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-N PIC 9(2) VALUE 3.
       01 WS-M PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "M05SUB" USING WS-N, WS-M.
           DISPLAY "MAIN N=" WS-N " M=" WS-M.
           STOP RUN.
       END PROGRAM M05MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. M05SUB RECURSIVE.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LS-N PIC 9(2).
       01 LS-M PIC 9(2).
       PROCEDURE DIVISION USING LS-N, LS-M.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N " M=" LS-M.
           IF LS-N > 0
               SUBTRACT 1 FROM LS-N GIVING LS-N
               ADD 1 LS-M GIVING LS-M
               CALL "M05SUB" USING LS-N, LS-M
           END-IF.
           DISPLAY "EXIT  N=" LS-N " M=" LS-M.
           GOBACK.
       END PROGRAM M05SUB.
