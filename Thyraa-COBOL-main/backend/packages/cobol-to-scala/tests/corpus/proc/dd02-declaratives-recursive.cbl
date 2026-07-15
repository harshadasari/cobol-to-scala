      * dd02: A DECLARATIVES USE AFTER STANDARD ERROR PROCEDURE handler
      * registered inside a RECURSIVE program, triggered by a failed
      * OPEN issued from a DEEP recursive activation (not the outermost
      * one). Probes whether DECLARATIVES handler invocation - wired
      * from generateOpen's failure path (round-10) - correctly reaches
      * into and reads the CURRENT recursive activation's own
      * LINKAGE-aliased LS-DEPTH (a plain top-level, module-shared
      * method per round-10's own registration codegen, not one of the
      * RECURSIVE program's own nested per-activation defs) rather than
      * some stale/default value, and that control correctly falls back
      * to the SAME activation afterward (not the outermost one).
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD02MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START-DEPTH  PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "DD02SUB" USING WS-START-DEPTH.
           STOP RUN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD02SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT MISSING-FILE ASSIGN TO "DD02-NO-SUCH-FILE-XYZ"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  MISSING-FILE.
       01  MISSING-REC   PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-NEXT-DEPTH   PIC 9(2).
       LINKAGE SECTION.
       01  LS-DEPTH        PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       DECLARATIVES.
       MISSING-FILE-ERR SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON MISSING-FILE.
       MISSING-FILE-HANDLER.
           DISPLAY "HANDLER-FIRED AT DEPTH=" LS-DEPTH.
       END DECLARATIVES.
       MAIN-PARA SECTION.
       MAIN-PARA-START.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           IF LS-DEPTH = 2
               OPEN INPUT MISSING-FILE
           END-IF.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "DD02SUB" USING WS-NEXT-DEPTH
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM DD02SUB.
       END PROGRAM DD02MAIN.
