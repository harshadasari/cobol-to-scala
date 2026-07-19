      * ii08: round-29 finding 3 (ee13) fixed ALTER's own parse
      * corruption for an ordinary (flat, non-RECURSIVE) program's
      * `generateAllMethods` convention, degrading it to a visible,
      * compiling `??? TODO` marker - real ALTER retargeting semantics
      * are intentionally NOT implemented (documented Known Gap). This
      * probes the SAME ALTER clause inside a RECURSIVE program's own
      * paragraphs instead, which compile through the completely
      * DIFFERENT `generateProgramFlowLinesNested`/
      * `renderNestedFallthroughDefs` nested-local-def convention -
      * whether the fix (a real parseAlterStatement, not a generic-scan
      * guess) still parses cleanly with no phantom-paragraph corruption
      * in that different generator path too, or whether a NEW crash
      * specific to nested-def rendering appears.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II08MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9 VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "II08SUB" USING WS-START.
           STOP RUN.
       END PROGRAM II08MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. II08SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N.
           IF LK-N = 0
               DISPLAY "BEFORE-ALTER"
               ALTER JUMP-PARA TO PROCEED TO TARGET-TWO
               PERFORM JUMP-PARA
               DISPLAY "AFTER-PERFORM"
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT
               CALL "II08SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       JUMP-PARA.
           GO TO TARGET-ONE.
       TARGET-ONE.
           DISPLAY "IN-TARGET-ONE".
       TARGET-TWO.
           DISPLAY "IN-TARGET-TWO".
       END PROGRAM II08SUB.
