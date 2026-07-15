      * dd12: DELETE (round-25/26's own RELATIVE-file buffer/occupied
      * model) issued from deep inside a RECURSIVE program's own
      * base-case activation - the DELETE analogue of bb08's REWRITE-
      * recursive probe (bb08 never combined RECURSIVE with DELETE
      * specifically). Confirms the shared top-level bufVar/occVar
      * (module-level, not one of the RECURSIVE program's own
      * per-activation nested defs) is correctly reachable and mutated
      * from the DEEPEST activation, and that the record count/surviving
      * data correctly flows back up through the LINKAGE-aliasing chain
      * to the outermost activation and back to MAIN.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD12MAIN.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT INIT-FILE ASSIGN TO "DD12FILE.DAT"
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
           MOVE 1 TO INIT-ID. MOVE "AAAAA" TO INIT-VAL. WRITE INIT-REC.
           MOVE 2 TO INIT-ID. MOVE "BBBBB" TO INIT-VAL. WRITE INIT-REC.
           MOVE 3 TO INIT-ID. MOVE "CCCCC" TO INIT-VAL. WRITE INIT-REC.
           CLOSE INIT-FILE.

           CALL "DD12SUB" USING WS-N, WS-RESULT.
           DISPLAY "MAIN RESULT=" WS-RESULT.

           OPEN INPUT INIT-FILE.
           PERFORM 3 TIMES
               READ INIT-FILE
                   AT END DISPLAY "EOF"
                   NOT AT END
                       DISPLAY "SURV ID=" INIT-ID " VAL=" INIT-VAL
               END-READ
           END-PERFORM.
           CLOSE INIT-FILE.
           STOP RUN.
       END PROGRAM DD12MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. DD12SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT SOME-FILE ASSIGN TO "DD12FILE.DAT"
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
               READ SOME-FILE
               DELETE SOME-FILE
               MOVE REC-ID TO LK-RESULT
               CLOSE SOME-FILE
           ELSE
               SUBTRACT 1 FROM LK-N GIVING WS-NEXT-N
               CALL "DD12SUB" USING WS-NEXT-N, LK-RESULT
           END-IF.
           DISPLAY "EXIT N=" LK-N " RESULT=" LK-RESULT.
           GOBACK.
       END PROGRAM DD12SUB.
