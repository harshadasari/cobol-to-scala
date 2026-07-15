      * ff10: MOVE CORRESPONDING / ADD CORRESPONDING between two group
      * items whose matching members are COMP-1 (Float) - round-28/29's
      * COMP-1/COMP-2 codec work was verified against plain MOVE/
      * COMPUTE/ADD/SUBTRACT/MULTIPLY/DIVIDE and file I/O, but never
      * against the CORRESPONDING family, which generates its own
      * synthesized per-member MOVE/ADD expressions (a genuinely
      * different codegen path, `generator/expression-gen.js`'s
      * CORRESPONDING handling) that may not have been audited for a
      * Float/Double-typed member at all.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. FF10CORR.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  GRP-A.
           05  A-ID        PIC 9(2)   VALUE 1.
           05  A-AMT       COMP-1.
           05  A-NAME      PIC X(5)   VALUE "AAAAA".
       01  GRP-B.
           05  A-ID        PIC 9(2)   VALUE 9.
           05  A-AMT       COMP-1.
           05  A-NAME      PIC X(5)   VALUE "BBBBB".
       PROCEDURE DIVISION.
       MAIN-PARA.
           MOVE 10.5 TO A-AMT IN GRP-A.
           MOVE 2.25 TO A-AMT IN GRP-B.
           DISPLAY "BEFORE A=" A-AMT IN GRP-A " B=" A-AMT IN GRP-B.

           MOVE CORRESPONDING GRP-A TO GRP-B.
           DISPLAY "AFTER-MOVE B-ID=" A-ID IN GRP-B
               " B-AMT=" A-AMT IN GRP-B
               " B-NAME=" A-NAME IN GRP-B.

           MOVE 10.5 TO A-AMT IN GRP-A.
           MOVE 2.25 TO A-AMT IN GRP-B.
           ADD CORRESPONDING GRP-A TO GRP-B.
           DISPLAY "AFTER-ADD B-AMT=" A-AMT IN GRP-B.
           STOP RUN.
