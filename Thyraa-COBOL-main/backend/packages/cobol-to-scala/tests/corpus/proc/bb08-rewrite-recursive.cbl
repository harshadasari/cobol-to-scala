      * Adversarial (round 26): round-25's brand-new OPEN I-O/REWRITE
      * buffer model has never been combined with rounds-21-24's RECURSIVE
      * self-CALL machinery. A RECURSIVE program's own paragraphs compile
      * as NESTED local defs closing over per-activation LINKAGE getter/
      * setter closures (generateProgramFlowLinesNested) - but bufVar/
      * posVar/the file handles themselves are ordinary top-level module
      * vars (generateFileHandleDeclarations), shared across every
      * activation. This checks that a REWRITE issued from deep inside a
      * self-recursive program's own base-case activation still correctly
      * reaches that shared top-level buffer, and that the freshly-read
      * record's ID correctly flows back UP through the recursive
      * LINKAGE-aliasing chain to the outermost activation.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB08MAIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INIT-FILE ASSIGN TO "BB08FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-IKEY
               FILE STATUS IS WS-ISTATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  INIT-FILE.
       01  INIT-REC.
           05 INIT-ID  PIC 9(3).
           05 INIT-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-IKEY    PIC 9(3) VALUE 0.
       01 WS-ISTATUS PIC XX.
       01 WS-N       PIC 9 VALUE 3.
       01 WS-RESULT  PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT INIT-FILE.
           MOVE 7 TO INIT-ID.
           MOVE "SEEDV" TO INIT-VAL.
           WRITE INIT-REC.
           CLOSE INIT-FILE.

           CALL "BB08SUB" USING WS-N, WS-RESULT.
           DISPLAY "MAIN RESULT=" WS-RESULT.
           STOP RUN.
       END PROGRAM BB08MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. BB08SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "BB08FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS SEQUENTIAL
               RELATIVE KEY IS WS-RKEY
               FILE STATUS IS WS-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  SOME-FILE.
       01  SOME-REC.
           05 REC-ID  PIC 9(3).
           05 REC-VAL PIC X(5).
       WORKING-STORAGE SECTION.
       01 WS-RKEY    PIC 9(3) VALUE 0.
       01 WS-STATUS  PIC XX.
       01 WS-NEXT-N  PIC 9.
       LINKAGE SECTION.
       01 LK-N       PIC 9.
       01 LK-RESULT  PIC 9(3).
       PROCEDURE DIVISION USING LK-N, LK-RESULT.
       MAIN-ENTRY.
           DISPLAY "ENTER N=" LK-N.
           IF LK-N = 0
               OPEN I-O SOME-FILE
               READ SOME-FILE
               MOVE "DEEPV" TO REC-VAL
               REWRITE SOME-REC
               MOVE REC-ID TO LK-RESULT
               CLOSE SOME-FILE
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT-N
               CALL "BB08SUB" USING WS-NEXT-N, LK-RESULT
           END-IF.
           DISPLAY "EXIT N=" LK-N " RESULT=" LK-RESULT.
           GOBACK.
       END PROGRAM BB08SUB.
