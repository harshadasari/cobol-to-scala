      * Adversarial (round 22): a DECLARATIVES SECTION registers a
      * "USE AFTER STANDARD ERROR PROCEDURE ON DEAD-FILE" handler for a
      * file the rest of the program never OPENs (or otherwise
      * accesses) at all - a "dead declarative". Every prior
      * DECLARATIVES corpus program (x01, y01-y03, aa02/aa02b/aa04,
      * b4-b6, d01/d10/d11/d13, e07/e09, f08, g07, h09/h13, i06/i07,
      * j03, z05) always OPENs (or otherwise touches) the file its own
      * USE clause names, even when the open itself is the thing that
      * fails. This checks whether declaratives-registration codegen
      * assumes a file's runtime open/close state var always gets
      * created somewhere (via OPEN codegen) and would blow up/misbehave
      * when that never happens for a file with a registered handler.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. K05DEADDECL.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT DEAD-FILE ASSIGN TO "K05DEADFILE.DAT"
               ORGANIZATION IS LINE SEQUENTIAL
               FILE STATUS IS WS-DEAD-STATUS.
       DATA DIVISION.
       FILE SECTION.
       FD  DEAD-FILE.
       01  DEAD-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01 WS-DEAD-STATUS PIC XX VALUE "00".
       01 WS-COUNT PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       DECLARATIVES.
       DEAD-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON DEAD-FILE.
       DEAD-PARA.
           DISPLAY "DEAD-HANDLER-FIRED-SHOULD-NEVER-HAPPEN".
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           PERFORM VARYING WS-COUNT FROM 1 BY 1 UNTIL WS-COUNT > 3
               DISPLAY "TICK=" WS-COUNT
           END-PERFORM.
           DISPLAY "DONE-NO-FILE-IO".
           STOP RUN.
