      * hh11: the KEYED-I/O counterpart of hh08/hh09 - round-28 (dd02)
      * fixed DECLARATIVES handler invocation inside a RECURSIVE
      * program's own nested-local-def paragraphs for an OPEN failure;
      * hh08/hh09 check the SAME mechanism for a SEQUENTIAL-access
      * REWRITE/DELETE failure. This checks a RANDOM-access, explicitly
      * KEYED WRITE duplicate-key failure (no INVALID KEY clause on the
      * WRITE itself, so the registered DECLARATIVES handler is the ONLY
      * thing that can react) fired from the deepest activation of a
      * RECURSIVE program, confirming the handler reads THAT activation's
      * own current LINKAGE value.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH11MAIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INIT-FILE ASSIGN TO "HH11FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
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
           MOVE 5 TO WS-IKEY.
           MOVE 5 TO INIT-ID. MOVE "SEEDV" TO INIT-VAL.
           WRITE INIT-REC INVALID KEY DISPLAY "SEED FAIL".
           CLOSE INIT-FILE.

           CALL "HH11SUB" USING WS-START-DEPTH.
           STOP RUN.
       END PROGRAM HH11MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH11SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "HH11FILE.DAT"
               ORGANIZATION IS RELATIVE
               ACCESS MODE IS RANDOM
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
               CALL "HH11SUB" USING WS-NEXT-DEPTH
           ELSE
               OPEN I-O SOME-FILE
               MOVE 5 TO WS-RKEY
               MOVE 5 TO REC-ID
               MOVE "DUPE!" TO REC-VAL
               WRITE SOME-REC
               DISPLAY "AFTER-WRITE DEPTH=" LS-DEPTH
                   " STATUS=" WS-STATUS
               CLOSE SOME-FILE
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM HH11SUB.
