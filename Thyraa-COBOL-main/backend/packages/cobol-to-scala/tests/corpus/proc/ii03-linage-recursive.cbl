      * ii03: round-32 finding 1's LINAGE line counter (a new per-file
      * module-level var, `<file>LinageCtr`) has never been combined
      * with rounds-21-24's RECURSIVE self-CALL machinery. Round-26's
      * bb08 already established that a REWRITE's own bufVar/posVar (also
      * top-level module vars, shared across every activation of a
      * RECURSIVE program's nested-local-def paragraphs) works correctly
      * across recursion depths - this probes whether the BRAND NEW
      * LINAGE counter var shares that same "top-level, shared across
      * every activation" property, by having a RECURSIVE program open a
      * LINAGE-bearing file once (at its own deepest/first activation)
      * and issue one WRITE ... AT END-OF-PAGE per recursion depth, each
      * depth incrementing the SAME shared counter.
       IDENTIFICATION DIVISION.
       PROGRAM-ID. II03MAIN.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01  WS-START PIC 9(2) VALUE 1.
       PROCEDURE DIVISION.
       MAIN-PARA.
           CALL "II03SUB" USING WS-START.
           STOP RUN.
       END PROGRAM II03MAIN.

       IDENTIFICATION DIVISION.
       PROGRAM-ID. II03SUB RECURSIVE.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT PRINT-FILE ASSIGN TO "II03PRT.DAT"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD  PRINT-FILE
           LINAGE IS 3 LINES.
       01  PRINT-REC PIC X(10).
       WORKING-STORAGE SECTION.
       01  WS-NEXT PIC 9(2).
       LINKAGE SECTION.
       01  LK-N PIC 9(2).
       PROCEDURE DIVISION USING LK-N.
       MAIN-ENTRY.
           IF LK-N = 1
               OPEN OUTPUT PRINT-FILE
           END-IF.
           MOVE "LINE" TO PRINT-REC.
           WRITE PRINT-REC
               AT END-OF-PAGE
                   DISPLAY "EOP AT N=" LK-N
               NOT AT END-OF-PAGE
                   DISPLAY "NOTEOP AT N=" LK-N
           END-WRITE.
           IF LK-N < 7
               ADD 1 TO LK-N GIVING WS-NEXT
               CALL "II03SUB" USING WS-NEXT
           ELSE
               CLOSE PRINT-FILE
           END-IF.
           DISPLAY "EXIT N=" LK-N.
           GOBACK.
       END PROGRAM II03SUB.
