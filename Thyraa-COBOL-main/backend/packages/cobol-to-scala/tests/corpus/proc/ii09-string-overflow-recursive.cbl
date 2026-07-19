      * ii09: STRING's own ON OVERFLOW/NOT ON OVERFLOW clause (round-6
      * findings 4/5, compiler-verified) has never been combined with
      * rounds-21-24's RECURSIVE nested-local-def paragraph convention.
      * generateExpression's own STRING codegen is called recursively
      * from inside whichever paragraph-rendering convention wraps it
      * (flat method vs nested local def) - this probes whether that
      * recursive call still emits correct, working ON OVERFLOW/NOT ON
      * OVERFLOW branches when the STRING statement itself lives inside
      * a RECURSIVE program's own nested-def paragraph (its base-case
      * activation, reached after several self-CALLs).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II09MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9 VALUE 2.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "II09SUB" USING WS-START.
           STOP RUN.
       END PROGRAM II09MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. II09SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9.
       01  WS-TARGET PIC X(5).
       01  WS-PTR PIC 9(2).
       LINKAGE SECTION.
       01  LK-N PIC 9.
       PROCEDURE DIVISION USING LK-N.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N.
           IF LK-N = 0
               MOVE SPACES TO WS-TARGET
               MOVE 1 TO WS-PTR
               STRING "HELLOWORLD" DELIMITED BY SIZE INTO WS-TARGET
                   WITH POINTER WS-PTR
                   ON OVERFLOW
                       DISPLAY "OVERFLOW"
                   NOT ON OVERFLOW
                       DISPLAY "NO-OVERFLOW"
               END-STRING
               DISPLAY "TARGET=[" WS-TARGET "]"
               DISPLAY "PTR=" WS-PTR
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT
               CALL "II09SUB" USING WS-NEXT
           END-IF.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       END PROGRAM II09SUB.
