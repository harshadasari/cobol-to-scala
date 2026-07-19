      * hh08: round-28 finding 1 (dd02) fixed DECLARATIVES handler
      * invocation inside a RECURSIVE program's own nested-local-def
      * paragraphs, verified against an OPEN failure specifically. bb07
      * separately confirmed a SEQUENTIAL-access REWRITE-with-no-prior-
      * READ failure invokes a registered DECLARATIVES handler too, but
      * only in an ORDINARY (non-recursive) program. This combines both:
      * a SEQUENTIAL-access REWRITE failure (no prior READ) triggered
      * from the DEEPEST activation of a RECURSIVE program, checking
      * whether the handler correctly reads THAT activation's own current
      * LINKAGE value (LS-DEPTH=02), not the stale module-level default
      * dd02's own bug produced before its fix.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH08MAIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INIT-FILE ASSIGN TO "HH08FILE.DAT"
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
       01 WS-START-DEPTH PIC 9(2) VALUE 0.
       PROCEDURE DIVISION.
       MAIN-PARA.
           OPEN OUTPUT INIT-FILE.
           MOVE 7 TO INIT-ID. MOVE "SEEDV" TO INIT-VAL. WRITE INIT-REC.
           CLOSE INIT-FILE.

           CALL "HH08SUB" USING WS-START-DEPTH.
           STOP RUN.
       END PROGRAM HH08MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH08SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "HH08FILE.DAT"
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
       01 WS-NEXT-DEPTH PIC 9(2).
       LINKAGE SECTION.
       01 LS-DEPTH   PIC 9(2).
       PROCEDURE DIVISION USING LS-DEPTH.
       DECLARATIVES.
       FILE-ERR-SECTION SECTION.
           USE AFTER STANDARD ERROR PROCEDURE ON SOME-FILE.
       FILE-ERR-PARA.
           DISPLAY "HANDLER-FIRED AT DEPTH=" LS-DEPTH
               " STATUS=" WS-STATUS.
       END DECLARATIVES.
       MAIN-SECTION SECTION.
       MAIN-PARA.
           DISPLAY "ENTER DEPTH=" LS-DEPTH.
           IF LS-DEPTH < 2
               COMPUTE WS-NEXT-DEPTH = LS-DEPTH + 1
               CALL "HH08SUB" USING WS-NEXT-DEPTH
           ELSE
               OPEN I-O SOME-FILE
               MOVE "ZZZZZ" TO REC-VAL
               REWRITE SOME-REC
               DISPLAY "AFTER-REWRITE DEPTH=" LS-DEPTH
                   " STATUS=" WS-STATUS
               CLOSE SOME-FILE
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM HH08SUB.
