      * jj12: the "feature vs RECURSIVE nesting" bug class has confirmed
      * instances for PERFORM THRU, qualified GO TO, SORT/MERGE,
      * DECLARATIVES and EXIT SECTION - this probes a computed
      * `GO TO P1 P2 P3 DEPENDING ON` (round-4's own GO TO DEPENDING ON
      * feature) whose target paragraphs are themselves nested-local
      * defs inside a RECURSIVE program's own entry method
      * (generateProgramFlowLinesNested's flat-nested-def convention,
      * round-29 finding 2) - probing whether the DEPENDING ON dispatch
      * correctly resolves to the SIBLING nested defs rather than
      * falling through/misresolving under that convention.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ12MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "JJ12SUB" USING WS-START.
           STOP RUN.
       END PROGRAM JJ12MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. JJ12SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       01  WS-BRANCH PIC 9 VALUE 2.
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N.
           IF LK-N = 0
               GO TO BRANCH-ONE BRANCH-TWO BRANCH-THREE
                   DEPENDING ON WS-BRANCH
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT
               CALL "JJ12SUB" USING WS-NEXT
               GO TO AFTER-CALL
           END-IF.
       BRANCH-ONE.
           DISPLAY "BRANCH-ONE".
           GO TO AFTER-CALL.
       BRANCH-TWO.
           DISPLAY "BRANCH-TWO".
           GO TO AFTER-CALL.
       BRANCH-THREE.
           DISPLAY "BRANCH-THREE".
       AFTER-CALL.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       END PROGRAM JJ12SUB.
