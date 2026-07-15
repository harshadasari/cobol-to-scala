      * dd01: EVALUATE (multiple WHEN arms, a WHEN OTHER, and a THRU
      * range) inside a RECURSIVE program's own nested-paragraph
      * convention (generateProgramFlowLinesNested), each arm writing
      * DIRECTLY to the program's own LINKAGE-aliased parameter (the
      * getter/setter closure mechanism rounds 21-24 built). Probes
      * whether EVALUATE's own codegen (an if/else chain, not a
      * paragraph-call) correctly routes every arm's assignment through
      * assignExpr/RECURSIVE_LEAF_NAMES the same way an ordinary
      * top-level statement inside a nested def already does - a shape
      * no prior RECURSIVE corpus program combines (every prior
      * RECURSIVE writeback probe used IF, not EVALUATE).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD01MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-N   PIC 9(2) VALUE 4.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "DD01SUB" USING WS-START-N.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD01SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-N    PIC 9(2).
       LINKAGE SECTION.
       01  LS-N         PIC 9(2).
       PROCEDURE DIVISION USING LS-N.
       MAIN-PARA.
           DISPLAY "ENTER N=" LS-N.
           EVALUATE LS-N
               WHEN 0
                   MOVE 99 TO LS-N
               WHEN 1 THRU 2
                   ADD 10 TO LS-N
               WHEN 4
                   SUBTRACT 1 FROM LS-N
                   COMPUTE WS-NEXT-N = LS-N
                   CALL "DD01SUB" USING WS-NEXT-N
                   ADD 1 TO LS-N
               WHEN OTHER
                   MOVE 77 TO LS-N
           END-EVALUATE.
           DISPLAY "EXIT N=" LS-N.
           GOBACK.
       END PROGRAM DD01SUB.
       END PROGRAM DD01MAIN.
