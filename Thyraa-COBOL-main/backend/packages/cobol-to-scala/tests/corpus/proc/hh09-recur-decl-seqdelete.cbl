      * hh09: the DELETE analogue of hh08 - round-27 finding 2 (cc05/cc06
      * territory)/bb03 confirmed a SEQUENTIAL-access DELETE issued with
      * no valid prior READ correctly reports a FILE STATUS error (and,
      * separately, invokes a registered DECLARATIVES handler), but only
      * ever verified in an ORDINARY (non-recursive) program. This fires
      * that exact failure (DELETE with no prior READ) from the DEEPEST
      * activation of a RECURSIVE program with a registered `USE AFTER
      * STANDARD ERROR PROCEDURE` handler, checking the handler reads
      * THAT activation's own current LINKAGE value, not a stale default.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH09MAIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INIT-FILE ASSIGN TO "HH09FILE.DAT"
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

           CALL "HH09SUB" USING WS-START-DEPTH.
           STOP RUN.
       END PROGRAM HH09MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. HH09SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "HH09FILE.DAT"
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
               CALL "HH09SUB" USING WS-NEXT-DEPTH
           ELSE
               OPEN I-O SOME-FILE
               DELETE SOME-FILE
               DISPLAY "AFTER-DELETE DEPTH=" LS-DEPTH
                   " STATUS=" WS-STATUS
               CLOSE SOME-FILE
           END-IF.
           DISPLAY "EXIT DEPTH=" LS-DEPTH.
           GOBACK.
       END PROGRAM HH09SUB.
