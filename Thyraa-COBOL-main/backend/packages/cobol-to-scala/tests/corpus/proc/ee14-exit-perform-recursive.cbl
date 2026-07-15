      * ee14: EXIT PERFORM (an inline PERFORM UNTIL loop, exited early)
      * inside a RECURSIVE program's own nested-local-def paragraph -
      * completes the EXIT PARAGRAPH/EXIT SECTION/EXIT PERFORM trio this
      * round's brief asked for (ee09 already found EXIT SECTION broken
      * there). EXIT PERFORM's own codegen uses
      * `scala.util.boundary.break()`, not `return`, so it plausibly
      * doesn't share ee09's cascading-return mechanism - this confirms
      * whether that's actually true.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE14MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "EE14SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. EE14SUB RECURSIVE.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       01  WS-I            PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           MOVE 1 TO WS-I.
           PERFORM UNTIL WS-I > 5
               DISPLAY "LOOP I=" WS-I " DEPTH=" LS-DEPTH
               IF WS-I = 3
                   EXIT PERFORM
               END-IF
               ADD 1 TO WS-I
           END-PERFORM.
           DISPLAY "AFTER-LOOP I=" WS-I " DEPTH=" LS-DEPTH.
           IF LS-DEPTH < 1
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "EE14SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM EE14SUB.
       END PROGRAM EE14MAIN.
